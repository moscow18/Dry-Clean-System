هذا الملف يحتوي على السياق البرمجي (Context) الخاص بنظام "الترزي"، وهو تطبيق Desktop مبني بـ Electron.js.
يمكنك إرسال هذا الملف بالكامل إلى Claude أو ChatGPT لسؤاله عن أي شيء يخص الـ API أو خدمة الواتساب.

---

### **مقدمة عن النظام (System Overview)**
- **نوع التطبيق**: Electron.js Desktop Application.
- **الهدف**: نظام لإدارة محل ترزي (خياطة)، يشمل فواتير، عملاء، نقدية، وإرسال إشعارات واتساب للعملاء.
- **البنية (Architecture)**:
  - **Main Process**: يحتوي على الاتصال بقاعدة البيانات (SQLite)، وخدمة الواتساب (`whatsapp-web.js` & Puppeteer)، ويتعامل مع أحداث النظام.
  - **Preload Script**: يستخدم `contextBridge` لتعريض (Expose) الـ APIs المسموح بها من الـ Main للـ Renderer بأمان عبر قنوات الـ IPC (`ipcMain` & `ipcRenderer`).
  - **Renderer Process**: الواجهة الأمامية التي تستخدم `window.whatsapp` و `window.db` وغيرها للتعامل مع النظام.

---

### **أولاً: خدمة الواتساب (whatsapp-service.js)**
ملف الخدمة يعمل في الـ Main Process، يعتمد على مكتبة `whatsapp-web.js`، ويقوم بالآتي:
1. فتح متصفح مخفي (أو ظاهر) باستخدام Chrome/Edge المثبت على جهاز المستخدم.
2. استخدام `LocalAuth` لحفظ جلسة الواتساب.
3. إرسال أحداث للـ Renderer (مثل الـ QR Code، حالة الاتصال، الخ).
4. توفير قوالب جاهزة (Templates) للرسائل مع إمكانية دمج المتغيرات (مثل اسم العميل ورقم الفاتورة).

```javascript
// whatsapp/whatsapp-service.js (مختصر)
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client = null;
let clientReady = false;
let currentQR = null;
let mainWindowRef = null;

function initWhatsApp(mainWindow, userDataPath) {
    mainWindowRef = mainWindow;
    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'el-tarzy-whatsapp',
            dataPath: path.join(userDataPath, 'whatsapp-sessions'),
        }),
        puppeteer: { headless: false, /* إعدادات المتصفح */ }
    });

    client.on('qr', async (qr) => {
        currentQR = qr;
        const qrImage = await qrcode.toDataURL(qr);
        mainWindowRef.webContents.send('whatsapp:qr', qrImage);
    });

    client.on('ready', () => {
        clientReady = true;
        mainWindowRef.webContents.send('whatsapp:ready');
    });
    
    client.initialize();
}

async function sendWhatsApp(phone, message) {
    if (!clientReady || !client) return { success: false, error: 'واتساب غير متصل' };
    try {
        const cleanPhone = phone.replace(/\D/g, '');
        // تنسيق الرقم لمصر (20)
        let formatted = cleanPhone.startsWith('01') ? '2' + cleanPhone : cleanPhone;
        const chatId = `${formatted}@c.us`;
        await client.sendMessage(chatId, message);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// قوالب الرسائل الديناميكية
const MESSAGES = {
  invoiceConfirm: ({ customerName, invoiceNumber, total, paid, remaining, shopName }) => {
    // بناء الرسالة واستبدال المتغيرات
  },
  // قوالب أخرى: orderReady, delivered, fullPayment, partialPayment...
};

module.exports = { initWhatsApp, sendWhatsApp, MESSAGES, /* ... */ };
```

---

### **ثانياً: ملف الـ Main (main.js) والـ IPC Handlers**
يقوم الـ Main Process باستقبال طلبات الـ API من الواجهة الأمامية وإرسالها لخدمة الواتساب، كما يقوم بجلب إعدادات المحل (مثل اسم المحل) من قاعدة البيانات لتضمينها في الرسائل.

```javascript
// main.js (مختصر - جزء الـ IPC الخاص بالواتساب)
const { ipcMain } = require('electron');
const { initWhatsApp, sendWhatsApp, MESSAGES } = require('./whatsapp/whatsapp-service');

// تهيئة الواتساب بعد ظهور النافذة
// initWhatsApp(mainWindow, app.getPath('userData'));

ipcMain.handle('whatsapp:getStatus', () => {
  return { ready: isReady(), hasQR: !!getCurrentQR() };
});

ipcMain.handle('whatsapp:send', async (_, phone, message) => {
  return await sendWhatsApp(phone, message);
});

// مثال على API مركب: إرسال تأكيد الفاتورة
ipcMain.handle('whatsapp:sendInvoiceConfirm', async (_, data) => {
  const shopSettings = getShopSettings(); // يجلب من قاعدة البيانات
  const msg = MESSAGES.invoiceConfirm({
    ...data,
    shopName: shopSettings.company_name || 'المحل',
  });
  return await sendWhatsApp(data.phone, msg);
});

// APIs أخرى مشابهة: sendOrderReady, sendDelivered, sendPartialPayment
```

---

### **ثالثاً: طبقة الوسيط (preload.js)**
يقوم هذا الملف بتعريض (Exposing) الـ APIs للواجهة الأمامية بأمان، بحيث يمكن لملفات الـ HTML/JS في الـ Renderer استدعاء الواتساب بسهولة.

```javascript
// preload.js (مختصر)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whatsapp', {
  getStatus: () => ipcRenderer.invoke('whatsapp:getStatus'),
  send: (phone, msg) => ipcRenderer.invoke('whatsapp:send', phone, msg),
  sendInvoiceConfirm: (d) => ipcRenderer.invoke('whatsapp:sendInvoiceConfirm', d),
  
  // الاستماع للأحداث (Events)
  onQR: (cb) => ipcRenderer.on('whatsapp:qr', (_, data) => cb(data)),
  onReady: (cb) => ipcRenderer.on('whatsapp:ready', () => cb()),
  onError: (cb) => ipcRenderer.on('whatsapp:error', (_, msg) => cb(msg)),
});

// هناك أيضاً APIs أخرى لـ (db, auth, shift, users) بنفس الطريقة
```

---

### **رابعاً: كيف تستخدم الواجهة الأمامية (Renderer) هذه الـ API؟**
بفضل الـ Preload، يمكن للواجهة استخدام الكود التالي لإرسال رسالة:

```javascript
// في أي ملف واجهة (مثل invoice.js)
async function notifyCustomer(phone, invoiceData) {
    const result = await window.whatsapp.sendInvoiceConfirm({
        phone: phone,
        customerName: invoiceData.name,
        invoiceNumber: invoiceData.id,
        total: invoiceData.total,
        paid: invoiceData.paid,
        remaining: invoiceData.remaining
    });
    
    if(result.success) {
        console.log('تم إرسال الرسالة بنجاح');
    }
}
```

---

### **سؤال المستخدم لـ Claude (يمكنك كتابة سؤالك هنا):**
"بناءً على الكود والبنية السابقة الموضحة للـ Main والـ Preload و whatsapp-service، أريد المساعدة في: 
[اكتب مشكلتك أو استفسارك هنا، مثلاً: تحسين أداء إرسال الرسائل، إضافة ميزة إرسال صور، حل مشكلة معينة في IPC، إلخ...]"
