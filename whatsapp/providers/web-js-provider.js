'use strict';

/**
 * ============================================================
 * web-js-provider.js — مزوّد whatsapp-web.js (Puppeteer)
 * ============================================================
 */

const BaseWhatsAppProvider = require('./base-provider');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

// ── القوالب الافتراضية للرسائل النصية ──
const DEFAULT_TEMPLATES = {
  invoiceConfirm: `أهلاً {customerName} 🤍\n\nطلبك اتسجل عندنا في {shopName} ✂️\n📋 تفاصيل الفاتورة:\nرقم الفاتورة: {invoiceNumber}\nتاريخ الاستلام: {date} {time}\nالفني المنفذ: {tailorName}\nالإجمالي: {total} جنيه\nالمدفوع: {paid} جنيه\nالباقي: {remaining} جنيه\n🧵 ميعاد التسليم المتوقع للتصاليح: 48 ساعة من تاريخ الفاتورة\nكل غرزة بتشيلها عنينا، وكل قطعة بنسلمها وإحنا مطمنين إنها بأحسن صورة.\nفي انتظار إطلالتك الجديدة 🤍\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  orderReady: `أهلاً {customerName} 🤍\n\nشغلك جاهز عندنا في {shopName} ✂️\nتم تجهيز طلبك بفاتورة رقم {invoiceNumber} وفي انتظار استلامك في أقرب فرصة.\nنتمنى نكون عند حسن ظنك 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  delivered: `أهلاً {customerName} 🤍\n\nشكراً لاستلامك طلبك من {shopName} ✂️\nفاتورة رقم {invoiceNumber} — تم التسليم بنجاح ✅\n\nنتشرف بخدمتك دايماً وفي انتظار إطلالتك القادمة 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`,

  fullPayment: `أهلاً {customerName} 🤍\n\nتم استلام دفعتك، وفاتورتك رقم {invoiceNumber} مسددة بالكامل ✅\n💵 المبلغ المدفوع: {paid} جنيه\n💳 طريقة الدفع: {paymentMethod}\n\nشكرًا لثقتك في {shopName} 🤍 نتشرف بزيارتك دايمًا\n📞 {contactPhone}`,

  partialPayment: `أهلاً {customerName} 🤍\n\nتم استلام دفعتك بنجاح في {shopName} ✂️\n🧾 فاتورة رقم {invoiceNumber}\n💵 المبلغ المدفوع الآن: {paidNow} جنيه\n💳 طريقة الدفع: {paymentMethod}\n📊 إجمالي المدفوع لحد دلوقتي: {totalPaid} جنيه\n📌 الباقي: {remaining} جنيه\n\nشكرًا لثقتك في {shopName} 🤍\n📞 {contactPhone}`,
};

class WebJSProvider extends BaseWhatsAppProvider {
  constructor() {
    super();
    this.client = null;
    this.clientReady = false;
    this.currentQR = null;
    this.mainWindowRef = null;
    this.initTimeout = null;
    this._statusLabel = 'جاري التهيئة...';
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  // ─── تسجيل الأخطاء على سطح المكتب ────────────────────────────────────────
  _log(msg) {
    try {
      const os = require('os');
      const logPath = require('path').join(os.homedir(), 'Desktop', 'eltarzy-error.txt');
      fs.appendFileSync(logPath, `\n[WebJS ${new Date().toISOString()}] ${msg}`);
    } catch (e) {}
    console.log('[WebJS]', msg);
  }

  // ──────────────────────────────────────────────
  // تهيئة المزوّد
  // ──────────────────────────────────────────────
  async initialize(config) {
    this.mainWindowRef = config.mainWindow;
    const userDataPath = config.sessionPath;

    const browserPath = this._getBrowserPath();
    if (!browserPath) {
      this.clientReady = false;
      this._statusLabel = '❌ متصفح Chrome غير متوفر';
      this._sendToRenderer('whatsapp:error', 'عفواً، يتطلب البرنامج وجود متصفح Google Chrome مثبتاً على جهازك.');
      this._log('❌ لم يُعثر على متصفح Chrome/Edge/Supermium');
      return;
    }

    this._log(`✅ المتصفح: ${browserPath}`);

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.clientId || 'el-tarzy-whatsapp',
        dataPath: path.join(userDataPath, 'whatsapp-sessions'),
      }),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
      puppeteer: {
        headless: false,  // false لفتح المتصفح ليتمكن المستخدم من رؤية ما يحدث
        executablePath: browserPath,
        timeout: 120000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
        ],
      }
    });

    // ── Timeout: 3 دقائق للتهيئة ──
    const startTimeout = () => {
      clearTimeout(this.initTimeout);
      this.initTimeout = setTimeout(() => {
        if (!this.clientReady) {
          this._statusLabel = '⚠️ انتهت مهلة الاتصال\nجاري الاتصال... أو متوقف مؤقتاً';
          this._log('⚠️ انتهت مهلة الاتصال (3 دقائق) ولم يتم تسجيل الدخول بالكامل.');
        }
      }, 180000); // 3 دقائق
    };
    startTimeout();
    this._startTimeout = startTimeout;

    // ── ربط الأحداث ──
    this.client.on('loading_screen', (percent) => {
      this._statusLabel = `جاري تحميل واتساب... ${percent}%`;
      this._sendToRenderer('whatsapp:loading', percent);
    });

    this.client.on('qr', async (qr) => {
      if (this._startTimeout) this._startTimeout();
      this.currentQR = qr;
      this.clientReady = false;
      this._statusLabel = '📱 في انتظار مسح QR Code';
      this._log('📱 ظهر QR Code جديد');
      try {
        const qrImage = await qrcode.toDataURL(qr, { width: 256, margin: 2 });
        this._sendToRenderer('whatsapp:qr', qrImage);
      } catch (e) {
        this._sendToRenderer('whatsapp:qr', null);
      }
    });

    this.client.on('authenticated', () => {
      if (this._startTimeout) this._startTimeout();
      this.currentQR = null;
      this._statusLabel = 'جاري التحقق من الجلسة...';
      this._sendToRenderer('whatsapp:authenticated');
      this._log('✅ تم المصادقة — في انتظار حدث ready');

      // ── فحص احتياطي: التحقق الدوري من حالة الاتصال لضمان عدم التعليق ──
      if (this._stateCheckInterval) clearInterval(this._stateCheckInterval);
      this._stateCheckInterval = setInterval(async () => {
        if (this.clientReady) {
          clearInterval(this._stateCheckInterval);
          return;
        }
        try {
          if (this.client) {
            const state = await this.client.getState();
            this._log(`🔍 فحص الحالة الدوري: ${state}`);
            if (state === 'CONNECTED') {
              clearInterval(this._stateCheckInterval);
              this.clientReady = true;
              this._statusLabel = '✅ متصل — جلسة واتساب نشطة';
              this._sendToRenderer('whatsapp:ready');
              this._log('✅ تم التأكد من الاتصال بنجاح عبر getState()!');
              if (this.messageQueue.length > 0) {
                this._processQueue();
              }
            }
          }
        } catch (e) {}
      }, 4000);

      // إيقاف الفحص بعد دقيقتين تجنباً لاستنزاف الموارد
      setTimeout(() => {
        if (this._stateCheckInterval) clearInterval(this._stateCheckInterval);
      }, 120000);
    });

    this.client.on('auth_failure', (msg) => {
      this.clientReady = false;
      this._statusLabel = '❌ فشل التحقق من الجلسة';
      this._sendToRenderer('whatsapp:error', msg);
      this._log(`❌ auth_failure: ${msg}`);
    });

    this.client.on('ready', () => {
      this.clientReady = true;
      this.currentQR = null;
      this._statusLabel = '✅ متصل — جلسة واتساب نشطة';
      this._sendToRenderer('whatsapp:ready');
      this._log('✅ جاهز للإرسال — ready event fired');
      // لو في رسائل معلقة، ابدأ الإرسال
      if (this.messageQueue.length > 0) {
        this._processQueue();
      }
    });

    this.client.on('disconnected', (reason) => {
      this.clientReady = false;
      this._statusLabel = '🔴 غير متصل';
      this._sendToRenderer('whatsapp:disconnected', reason);
      this._log(`🔴 انقطع الاتصال: ${reason}`);
    });

    this.client.initialize().catch(err => {
      this._log(`❌ خطأ في التهيئة: ${err.message}`);
      this._statusLabel = `⚠️ خطأ: ${err.message}`;
      this._sendToRenderer('whatsapp:error', err.message);
    });
  }

  // ──────────────────────────────────────────────
  // حالة المزوّد
  // ──────────────────────────────────────────────
  async getStatus() {
    if (this.clientReady) {
      return {
        ready: true,
        statusType: 'connected',
        label: '✅ متصل — جلسة واتساب نشطة',
        needsQR: false,
        qrImage: null,
        provider: 'web_js',
      };
    }

    if (this.currentQR) {
      let qrImage = null;
      try {
        qrImage = await qrcode.toDataURL(this.currentQR, { width: 256, margin: 2 });
      } catch (e) {}
      return {
        ready: false,
        statusType: 'qr_pending',
        label: '📱 في انتظار مسح QR Code',
        needsQR: true,
        qrImage,
        provider: 'web_js',
      };
    }

    return {
      ready: false,
      statusType: 'disconnected',
      label: this._statusLabel || '🔴 غير متصل — جاري الاتصال...',
      needsQR: false,
      qrImage: null,
      provider: 'web_js',
    };
  }

  // ──────────────────────────────────────────────
  // إرسال رسالة
  // ──────────────────────────────────────────────
  async sendMessage({ type, phone, payload, settings }) {
    if (!this.clientReady || !this.client) {
      this._log(`⚠️ محاولة إرسال لـ ${phone} لكن clientReady=${this.clientReady}`);
      return { success: false, error: 'واتساب غير متصل — يرجى الانتظار أو ربط الواتساب من الإعدادات' };
    }
    if (!phone || phone.trim() === '') {
      return { success: false, error: 'رقم الهاتف غير موجود' };
    }

    this._log(`📤 طلب إرسال (${type}) لـ ${phone}`);
    this.messageQueue.push({ type, phone, payload, settings });
    this._processQueue();

    return { success: true, queued: true };
  }

  // ── معالجة الطابور ──────────────────────────────────────────────────────────
  async _processQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();

      // إعادة المحاولة لو الـ client انقطع في منتصف الطابور
      if (!this.clientReady || !this.client) {
        this._log(`⚠️ الـ client غير جاهز — تم تخطي رسالة لـ ${msg.phone}`);
        continue;
      }

      try {
        const formatted = this.formatEgyptianPhone(msg.phone);
        const chatId = `${formatted}@c.us`;
        const message = this._buildMessage(msg.type, msg.payload, msg.settings);

        if (!message) {
          this._log(`⚠️ لم يُبنَ نص الرسالة من النوع "${msg.type}" لـ ${msg.phone}`);
          continue;
        }

        this._log(`📨 جاري الإرسال لـ ${msg.phone} (${chatId})...`);
        
        // ── محاكاة الكتابة البشرية للحماية من الحظر ──
        try {
          await this.client.sendPresenceAvailable();
          const chat = await this.client.getChatById(chatId);
          if (chat) {
            await chat.sendStateTyping();
            // حساب وقت كتابة واقعي بناءً على طول الرسالة (بين 2 إلى 5 ثوانٍ)
            const typingTime = Math.min(Math.max(message.length * 50, 2000), 5000);
            await new Promise(r => setTimeout(r, typingTime));
            // clearState is usually automatic when message is sent
          } else {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (typingErr) {
          this._log(`⚠️ تعذر محاكاة الكتابة لـ ${chatId}: ${typingErr.message}`);
          await new Promise(r => setTimeout(r, 2000));
        }

        await this.client.sendMessage(chatId, message);
        this._log(`✅ تم الإرسال لـ ${msg.phone} بنجاح`);

      } catch (err) {
        this._log(`❌ فشل إرسال رسالة لـ ${msg.phone}: ${err.message}\n${err.stack}`);
      }

      // تأخير عشوائي طبيعي بين الرسائل (3 إلى 6 ثوانٍ) لمنع الحظر
      const delay = 3000 + Math.floor(Math.random() * 3000);
      await new Promise(r => setTimeout(r, delay));
    }

    this.isProcessingQueue = false;
  }

  async sendFile(phone, caption, filePath) {
    if (!this.clientReady || !this.client) return { success: false, error: 'Client not ready' };
    try {
      const { MessageMedia } = require('whatsapp-web.js');
      const formatted = this.formatEgyptianPhone(phone);
      const chatId = `${formatted}@c.us`;
      const media = MessageMedia.fromFilePath(filePath);
      await this.client.sendMessage(chatId, media, { caption });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ──────────────────────────────────────────────
  // تدمير المزوّد
  // ──────────────────────────────────────────────
  async destroy() {
    this.clientReady = false;
    this.currentQR = null;
    if (this.initTimeout) clearTimeout(this.initTimeout);

    if (this.client) {
      try {
        await this.client.destroy();
        this._log('✅ تم إغلاق Puppeteer بنجاح');
      } catch (e) {
        this._log(`⚠️ destroy() فشل: ${e.message}`);
        try { await this.client.logout(); } catch {}
        try { await this.client.destroy(); } catch {}
      }
      this.client = null;
    }
  }

  // ──────────────────────────────────────────────
  // بناء نص الرسالة
  // ──────────────────────────────────────────────
  _buildMessage(type, payload, settings) {
    const s = settings || {};
    const shopName = s.company_name || payload.shopName || 'المحل';
    const address = s.address || payload.address || '';
    const contactPhone = s.wa_phone1 || s.phone || payload.contactPhone || '';

    const applyTpl = (tpl, vars) => {
      let result = tpl;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? '');
      }
      return result;
    };

    const paymentMethodLabel = (method) =>
      method === 'فودافون كاش' ? 'تحويل' : 'نقدي';

    const commonVars = {
      customerName: this.formatCustomerName(payload.customerName),
      invoiceNumber: payload.invoiceNumber || '—',
      shopName, address, contactPhone,
    };

    switch (type) {
      case 'invoice_confirm': {
        const tpl = (s.wa_tpl_invoice_confirm) || DEFAULT_TEMPLATES.invoiceConfirm;
        return applyTpl(tpl, {
          ...commonVars,
          total:      payload.total ?? '',
          paid:       payload.paid ?? '',
          remaining:  payload.remaining ?? '',
          tailorName: payload.tailorName || 'غير محدد',
          date:       payload.date || '',
          time:       payload.time || '',
        });
      }

      case 'order_ready': {
        const tpl = (s.wa_tpl_order_ready) || DEFAULT_TEMPLATES.orderReady;
        return applyTpl(tpl, commonVars);
      }

      case 'order_delivered': {
        const tpl = (s.wa_tpl_delivered) || DEFAULT_TEMPLATES.delivered;
        return applyTpl(tpl, commonVars);
      }

      case 'full_payment': {
        const tpl = (s.wa_tpl_full_payment) || DEFAULT_TEMPLATES.fullPayment;
        return applyTpl(tpl, {
          ...commonVars,
          paid:          payload.paid || payload.paidNow || '0',
          paymentMethod: paymentMethodLabel(payload.paymentMethod),
        });
      }

      case 'partial_payment': {
        const tpl = (s.wa_tpl_partial_payment) || DEFAULT_TEMPLATES.partialPayment;
        return applyTpl(tpl, {
          ...commonVars,
          paidNow:       payload.paidNow ?? '',
          totalPaid:     payload.totalPaid ?? '',
          remaining:     payload.remaining ?? '',
          paymentMethod: paymentMethodLabel(payload.paymentMethod),
        });
      }

      case 'free_text':
        return payload.text || '';

      default:
        return null;
    }
  }

  // ──────────────────────────────────────────────
  // مساعدات داخلية
  // ──────────────────────────────────────────────
  _sendToRenderer(channel, data) {
    if (this.mainWindowRef && !this.mainWindowRef.isDestroyed()) {
      this.mainWindowRef.webContents.send(channel, data);
    }
  }

  _getBrowserPath() {
    const localAppData    = process.env.LOCALAPPDATA          || '';
    const programFiles    = process.env['ProgramFiles']       || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const paths = [
      path.join(programFiles,    'Supermium\\supermium.exe'),
      path.join(programFilesX86, 'Supermium\\supermium.exe'),
      path.join(programFiles,    'Supermium\\Application\\supermium.exe'),
      path.join(programFilesX86, 'Supermium\\Application\\supermium.exe'),
      path.join(programFiles,    'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      localAppData ? path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') : '',
      path.join(programFiles,    'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    ];

    for (const p of paths) {
      if (p && fs.existsSync(p)) {
        this._log(`المتصفح المستخدم: ${p}`);
        return p;
      }
    }
    return null;
  }
}

module.exports = WebJSProvider;


