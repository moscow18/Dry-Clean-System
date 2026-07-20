'use strict';

/**
 * ============================================================
 * whatsapp-service.js — خدمة واتساب مدمجة في مشروع الترزي
 * ============================================================
 * تشتغل في Main Process فقط
 * اسم المحل يُجلب دايماً من إعدادات البرنامج
 * الرسائل بنفس صيغة reports.html الأصلية
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

let client = null;
let clientReady = false;
let currentQR = null;
let mainWindowRef = null;
let userDataPath = null;

const fs = require('fs');

// دالة للبحث عن مسار متصفح كروم أو إيدج في الويندوز
function getBrowserPath() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ──────────────────────────────────────────────
// تهيئة الخدمة
// ──────────────────────────────────────────────
function initWhatsApp(mainWindow, userData) {
    mainWindowRef = mainWindow;
    userDataPath = userData;

    const browserPath = getBrowserPath();

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'el-tarzy-whatsapp',
            dataPath: path.join(userDataPath, 'whatsapp-sessions'),
        }),
        puppeteer: {
            headless: true,
            executablePath: browserPath || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ],
        },
    });

    // ── Timeout لتعليق الواتساب على ويندوز 7 ──
    let initTimeout = setTimeout(() => {
        if (!clientReady && !currentQR) {
            sendToRenderer('whatsapp:error', 'المتصفح استغرق وقتاً طويلاً. قد يكون الويندوز قديماً (مثل ويندوز 7) أو غير متوافق. تأكد من تحميل Google Chrome محدث.');
            clientReady = false;
        }
    }, 45000);

    // ── الأحداث ──
    client.on('loading_screen', (percent) => {
        sendToRenderer('whatsapp:loading', percent);
    });

    client.on('qr', async (qr) => {
        clearTimeout(initTimeout);
        currentQR = qr;
        try {
            const qrImage = await qrcode.toDataURL(qr, { width: 256, margin: 2 });
            sendToRenderer('whatsapp:qr', qrImage);
        } catch (e) {
            sendToRenderer('whatsapp:qr', null);
        }
    });

    client.on('authenticated', () => {
        currentQR = null;
        sendToRenderer('whatsapp:authenticated');
    });

    client.on('auth_failure', (msg) => {
        clearTimeout(initTimeout);
        clientReady = false;
        sendToRenderer('whatsapp:error', msg);
    });

    client.on('ready', () => {
        clearTimeout(initTimeout);
        clientReady = true;
        currentQR = null;
        sendToRenderer('whatsapp:ready');
        console.log('[WhatsApp] ✅ جاهز للإرسال');
    });

    client.on('disconnected', (reason) => {
        clientReady = false;
        sendToRenderer('whatsapp:disconnected', reason);
        console.log('[WhatsApp] 🔴 انقطع الاتصال:', reason);
    });

    client.initialize().catch(err => {
        console.error('[WhatsApp] خطأ في التهيئة:', err.message);
        sendToRenderer('whatsapp:error', err.message);
    });
}

// ──────────────────────────────────────────────
// إرسال رسالة خام
// ──────────────────────────────────────────────
async function sendWhatsApp(phone, message) {
    if (!clientReady || !client) {
        return { success: false, error: 'واتساب غير متصل' };
    }
    if (!phone || phone.trim() === '') {
        return { success: false, error: 'رقم الهاتف غير موجود' };
    }

    try {
        const cleanPhone = phone.replace(/\D/g, '');
        let formatted = cleanPhone;
        if (formatted.startsWith('01')) formatted = '2' + formatted;
        else if (!formatted.startsWith('20')) formatted = '20' + formatted;

        const chatId = `${formatted}@c.us`;

        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return { success: false, error: `الرقم ${phone} غير مسجل على واتساب` };
        }

        await client.sendMessage(chatId, message);
        console.log(`[WhatsApp] ✅ إرسال لـ ${phone}`);
        return { success: true };

    } catch (err) {
        console.error(`[WhatsApp] ❌ فشل الإرسال لـ ${phone}:`, err.message);
        return { success: false, error: err.message };
    }
}

// ──────────────────────────────────────────────
// قطع الاتصال
// ──────────────────────────────────────────────
async function disconnectWhatsApp() {
    if (!client) return { success: false };
    try {
        await client.logout();
        clientReady = false;
        currentQR = null;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ──────────────────────────────────────────────
// رسائل الترزي — ديناميكية من الإعدادات
// ──────────────────────────────────────────────

// القوالب الافتراضية (تُستخدم لو مفيش قالب محفوظ في الإعدادات)
const DEFAULT_TEMPLATES = {
  invoiceConfirm: `أهلاً {customerName} 🤍\n\nطلبك اتسجل عندنا في {shopName} ✂️\n📋 تفاصيل الفاتورة:\nرقم الفاتورة: {invoiceNumber}\nتاريخ الاستلام: {date} {time}\nالفني المنفذ: {tailorName}\nالإجمالي: {total} جنيه\nالمدفوع: {paid} جنيه\nالباقي: {remaining} جنيه\n🧵 ميعاد التسليم المتوقع للتصاليح: 48 ساعة من تاريخ الفاتورة\nكل غرزة بتشيلها عنينا، وكل قطعة بنسلمها وإحنا مطمنين إنها بأحسن صورة.\nفي انتظار إطلالتك الجديدة 🤍\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  orderReady: `أهلاً {customerName} 🤍\n\nشغلك جاهز عندنا في {shopName} ✂️\nتم تجهيز طلبك بفاتورة رقم {invoiceNumber} وفي انتظار استلامك في أقرب فرصة.\nنتمنى نكون عند حسن ظنك 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  delivered: `أهلاً {customerName} 🤍\n\nشكراً لاستلامك طلبك من {shopName} ✂️\nفاتورة رقم {invoiceNumber} — تم التسليم بنجاح ✅\n\nنتشرف بخدمتك دايماً وفي انتظار إطلالتك القادمة 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  fullPayment: `أهلاً {customerName} 🤍\n\nتم استلام دفعتك، وفاتورتك رقم {invoiceNumber} مسددة بالكامل ✅\n💵 المبلغ المدفوع: {paid} جنيه\n💳 طريقة الدفع: {paymentMethod}\n\nشكرًا لثقتك في {shopName} 🤍 نتشرف بزيارتك دايمًا\n📞 {contactPhone}`,

  partialPayment: `أهلاً {customerName} 🤍\n\nتم استلام دفعتك بنجاح في {shopName} ✂️\n🧾 فاتورة رقم {invoiceNumber}\n💵 المبلغ المدفوع الآن: {paidNow} جنيه\n💳 طريقة الدفع: {paymentMethod}\n📊 إجمالي المدفوع لحد دلوقتي: {totalPaid} جنيه\n📌 الباقي: {remaining} جنيه\n\nشكرًا لثقتك في {shopName} 🤍\n📞 {contactPhone}`,
};

// دالة استبدال المتغيرات في القالب
function applyTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

// دالة مساعدة لتنسيق الاسم
function formatName(name) {
  if (!name || name === 'عميل نقدي') return 'عميلنا العزيز';
  if (name.startsWith('أ/')) return name;
  return 'أ/ ' + name;
}

// بناء الرسائل (يستقبل settings من الـ caller)
const MESSAGES = {
  invoiceConfirm: ({ customerName, invoiceNumber, total, paid, remaining, shopName, address, contactPhone, tailorName, date, time, settings }) => {
    const tpl = (settings && settings.wa_tpl_invoice_confirm) || DEFAULT_TEMPLATES.invoiceConfirm;
    return applyTemplate(tpl, {
      customerName: formatName(customerName),
      invoiceNumber: invoiceNumber || '—',
      total, paid, remaining,
      shopName: shopName || 'المحل',
      address: address || '',
      contactPhone: contactPhone || '',
      tailorName: tailorName || 'غير محدد',
      date: date || '',
      time: time || '',
    });
  },

  orderReady: ({ customerName, invoiceNumber, shopName, address, contactPhone, settings }) => {
    const tpl = (settings && settings.wa_tpl_order_ready) || DEFAULT_TEMPLATES.orderReady;
    return applyTemplate(tpl, {
      customerName: formatName(customerName),
      invoiceNumber: invoiceNumber || '—',
      shopName: shopName || 'المحل',
      address: address || '',
      contactPhone: contactPhone || '',
    });
  },

  delivered: ({ customerName, invoiceNumber, shopName, address, contactPhone, settings }) => {
    const tpl = (settings && settings.wa_tpl_delivered) || DEFAULT_TEMPLATES.delivered;
    return applyTemplate(tpl, {
      customerName: formatName(customerName),
      invoiceNumber: invoiceNumber || '—',
      shopName: shopName || 'المحل',
      address: address || '',
      contactPhone: contactPhone || '',
    });
  },

  deliveredWithFullPayment: ({ customerName, invoiceNumber, paid, paidNow, paymentMethod, shopName, address, contactPhone, settings }) => {
    const tpl = (settings && settings.wa_tpl_full_payment) || DEFAULT_TEMPLATES.fullPayment;
    const method = paymentMethod === 'فودافون كاش' ? 'تحويل' : 'نقدي';
    return applyTemplate(tpl, {
      customerName: formatName(customerName),
      invoiceNumber: invoiceNumber || '—',
      paid: paid || paidNow || '0', 
      paymentMethod: method,
      shopName: shopName || 'المحل',
      address: address || '',
      contactPhone: contactPhone || '',
    });
  },

  partialPayment: ({ customerName, invoiceNumber, paidNow, totalPaid, remaining, paymentMethod, shopName, address, contactPhone, settings }) => {
    const tpl = (settings && settings.wa_tpl_partial_payment) || DEFAULT_TEMPLATES.partialPayment;
    const method = paymentMethod === 'فودافون كاش' ? 'تحويل' : 'نقدي';
    return applyTemplate(tpl, {
      customerName: formatName(customerName),
      invoiceNumber: invoiceNumber || '—',
      paidNow, totalPaid, remaining,
      paymentMethod: method,
      shopName: shopName || 'المحل',
      address: address || '',
      contactPhone: contactPhone || '',
    });
  },
};

// ──────────────────────────────────────────────
// مساعد: إرسال للـ renderer
// ──────────────────────────────────────────────
function sendToRenderer(channel, data) {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send(channel, data);
    }
}

// ──────────────────────────────────────────────
// Getters
// ──────────────────────────────────────────────
function isReady() { return clientReady; }
function getCurrentQR() { return currentQR; }

module.exports = {
    initWhatsApp,
    sendWhatsApp,
    disconnectWhatsApp,
    isReady,
    getCurrentQR,
    MESSAGES,
};
