'use strict';

/**
 * ============================================================
 * whatsapp-manager.js — المنسّق الرئيسي لخدمة الواتساب
 * ============================================================
 * هو نقطة الدخول الوحيدة التي يتعامل معها باقي النظام.
 * يقرأ إعدادات العميل من قاعدة البيانات ويحمّل المزوّد المناسب.
 *
 * آلية التبديل الآمن (Rollback):
 *   1. يحتفظ بالـ provider الحالي حتى يتأكد من نجاح الجديد
 *   2. إذا فشل تهيئة الجديد → يبقى القديم شغالاً
 *   3. إذا نجح → يُوقف القديم ويُشغّل الجديد
 */

const CloudAPIProvider = require('./providers/cloud-api-provider');
const WebJSProvider    = require('./providers/web-js-provider');

let activeProvider = null;
let mainWindowRef  = null;
let dbRef          = null;

// ──────────────────────────────────────────────
// تهيئة المدير عند بدء التطبيق
// ──────────────────────────────────────────────
async function initWhatsAppManager(db, mainWindow) {
  dbRef          = db;
  mainWindowRef  = mainWindow;

  const settings = getWhatsAppSettings(db);

  try {
    if (settings.provider === 'cloud_api') {
      const newProvider = new CloudAPIProvider();
      const templateMap = getTemplateMap(db);
      await newProvider.initialize({
        phoneNumberId:     settings.wa_phone_number_id,
        accessToken:       settings.wa_access_token_plain, // مفكوك مسبقاً
        businessAccountId: settings.wa_business_account_id,
        apiVersion:        settings.wa_api_version || 'v20.0',
        templateMap,
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ تم تشغيل Cloud API Provider');

    } else {
      // web_js هو الافتراضي (للعملاء الحاليين وعند عدم وجود إعدادات)
      const newProvider = new WebJSProvider();
      await newProvider.initialize({
        mainWindow,
        sessionPath: mainWindow.webContents.getOwnerBrowserWindow()
          ? require('electron').app.getPath('userData')
          : settings.web_session_path,
        clientId: settings.web_session_client_id || 'el-tarzy-whatsapp',
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ تم تشغيل Web.js Provider');
    }

  } catch (err) {
    console.error('[Manager] ❌ فشل تشغيل المزوّد:', err.message);
    // إذا كان Cloud API وفشل، لا نترك النظام بدون مزوّد
    // نُسجّل الخطأ ونُبقي activeProvider = null — الـ handlers ستُعيد خطأ واضح
    activeProvider = null;
    sendToRenderer('whatsapp:error', `فشل تشغيل مزوّد الواتساب: ${err.message}`);
  }

  return activeProvider;
}

// ──────────────────────────────────────────────
// تهيئة المدير لـ Web.js (مُبسَّطة — تُستدعى من main.js مع app)
// ──────────────────────────────────────────────
async function initWhatsAppManagerWithApp(db, mainWindow, app) {
  dbRef         = db;
  mainWindowRef = mainWindow;

  const settings = getWhatsAppSettings(db);

  try {
    if (settings.provider === 'cloud_api') {
      const newProvider = new CloudAPIProvider();
      const templateMap = getTemplateMap(db);
      await newProvider.initialize({
        phoneNumberId:     settings.wa_phone_number_id,
        accessToken:       settings.wa_access_token_plain,
        businessAccountId: settings.wa_business_account_id,
        apiVersion:        settings.wa_api_version || 'v20.0',
        templateMap,
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ Cloud API Provider نشط');

    } else {
      const newProvider = new WebJSProvider();
      await newProvider.initialize({
        mainWindow,
        sessionPath: app.getPath('userData'),
        clientId:    settings.web_session_client_id || 'el-tarzy-whatsapp',
      });
      activeProvider = newProvider;
      console.log('[Manager] ✅ Web.js Provider نشط');
    }

  } catch (err) {
    console.error('[Manager] ❌ فشل التشغيل:', err.message);
    activeProvider = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('whatsapp:error', `فشل تشغيل الواتساب: ${err.message}`);
    }
  }

  return activeProvider;
}

// ──────────────────────────────────────────────
// التبديل بين المزوّدين — مع Rollback آمن
// ──────────────────────────────────────────────
async function switchProvider(newProviderType, newConfig, db, app) {
  const oldProvider = activeProvider;
  const oldSettings = getWhatsAppSettings(db);

  console.log(`[Manager] 🔄 التبديل من "${oldSettings.provider}" إلى "${newProviderType}"`);

  let newProvider = null;

  try {
    if (newProviderType === 'cloud_api') {
      newProvider = new CloudAPIProvider();
      const templateMap = getTemplateMap(db);
      await newProvider.initialize({
        phoneNumberId:     newConfig.wa_phone_number_id,
        accessToken:       newConfig.wa_access_token_plain,
        businessAccountId: newConfig.wa_business_account_id,
        apiVersion:        newConfig.wa_api_version || 'v20.0',
        templateMap,
      });

    } else if (newProviderType === 'web_js') {
      newProvider = new WebJSProvider();
      await newProvider.initialize({
        mainWindow: mainWindowRef,
        sessionPath: app ? app.getPath('userData') : newConfig.web_session_path,
        clientId:    newConfig.web_session_client_id || 'el-tarzy-whatsapp',
      });

    } else {
      throw new Error(`نوع مزوّد غير معروف: ${newProviderType}`);
    }

    // ✅ نجح التهيئة — نُوقف القديم ونُشغّل الجديد
    if (oldProvider) {
      try {
        await oldProvider.destroy();
        console.log('[Manager] ✅ تم إيقاف المزوّد القديم');
      } catch (e) {
        console.warn('[Manager] تحذير: فشل إيقاف المزوّد القديم:', e.message);
      }
    }

    activeProvider = newProvider;
    console.log(`[Manager] ✅ تم التبديل بنجاح إلى "${newProviderType}"`);
    return { success: true };

  } catch (err) {
    console.error(`[Manager] ❌ فشل التبديل إلى "${newProviderType}":`, err.message);

    // ❌ فشل — نُبقي المزوّد القديم شغالاً
    if (newProvider) {
      try { await newProvider.destroy(); } catch {}
    }

    activeProvider = oldProvider; // Rollback
    return {
      success: false,
      error: `فشل التبديل إلى ${newProviderType === 'cloud_api' ? 'Meta Cloud API' : 'WhatsApp Web'}: ${err.message}`,
    };
  }
}

// ──────────────────────────────────────────────
// الحصول على المزوّد النشط
// ──────────────────────────────────────────────
async function enqueueMessage(phone, type, payload, manualPriority = false) {
  if (!activeProvider) return { success: false, error: 'Provider not initialized' };
  
  const settings = getWhatsAppSettings(dbRef);
  return await activeProvider.enqueue(phone, type, payload, settings, manualPriority);
}

async function sendFile(phone, caption, filePath) {
  if (!activeProvider) return { success: false, error: 'Provider not initialized' };
  if (typeof activeProvider.sendFile !== 'function') {
    return { success: false, error: 'Current provider does not support sending files directly' };
  }
  return await activeProvider.sendFile(phone, caption, filePath);
}

// ──────────────────────────────────────────────
// حالة الاتصال والـ QR
// ──────────────────────────────────────────────
function getActiveProvider() {
  if (!activeProvider) {
    throw new Error('خدمة الواتساب غير مهيأة — راجع إعدادات الواتساب');
  }
  return activeProvider;
}

function getActiveProviderSafe() {
  return activeProvider; // بدون رمي خطأ
}

// ──────────────────────────────────────────────
// قراءة وكتابة إعدادات الواتساب من DB
// ──────────────────────────────────────────────
function getWhatsAppSettings(db) {
  try {
    const row = db.prepare(`
      SELECT * FROM whatsapp_settings WHERE id = 1
    `).get();

    if (!row) {
      // قيمة افتراضية: web_js
      return { provider: 'web_js', web_session_client_id: 'el-tarzy-whatsapp' };
    }

    // فكّ تشفير الـ Access Token إن كان موجوداً
    let accessTokenPlain = null;
    if (row.wa_access_token) {
      try {
        const { safeStorage } = require('electron');
        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(row.wa_access_token, 'base64');
          accessTokenPlain = safeStorage.decryptString(buffer);
        }
      } catch (e) {
        console.warn('[Manager] فشل فكّ تشفير Access Token:', e.message);
      }
    }

    return { ...row, wa_access_token_plain: accessTokenPlain };
  } catch (e) {
    console.error('[Manager] خطأ في قراءة إعدادات الواتساب:', e.message);
    return { provider: 'web_js', web_session_client_id: 'el-tarzy-whatsapp' };
  }
}

function saveWhatsAppSettings(db, settings) {
  // تشفير الـ Access Token إن كان موجوداً
  let encryptedToken = null;
  if (settings.wa_access_token_plain) {
    try {
      const { safeStorage } = require('electron');
      if (safeStorage.isEncryptionAvailable()) {
        encryptedToken = safeStorage.encryptString(settings.wa_access_token_plain).toString('base64');
      } else {
        // fallback: تخزين بدون تشفير مع تحذير
        console.warn('[Manager] safeStorage غير متاح — الـ Token سيُخزَّن بدون تشفير');
        encryptedToken = Buffer.from(settings.wa_access_token_plain).toString('base64');
      }
    } catch (e) {
      console.error('[Manager] فشل تشفير Access Token:', e.message);
    }
  }

  const existing = db.prepare('SELECT id FROM whatsapp_settings WHERE id = 1').get();

  if (existing) {
    db.prepare(`
      UPDATE whatsapp_settings SET
        provider               = @provider,
        wa_phone_number_id     = @wa_phone_number_id,
        wa_access_token        = @wa_access_token,
        wa_business_account_id = @wa_business_account_id,
        wa_api_version         = @wa_api_version,
        web_session_client_id  = @web_session_client_id,
        web_session_path       = @web_session_path,
        updated_at             = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run({
      provider:               settings.provider || 'web_js',
      wa_phone_number_id:     settings.wa_phone_number_id || null,
      wa_access_token:        encryptedToken,
      wa_business_account_id: settings.wa_business_account_id || null,
      wa_api_version:         settings.wa_api_version || 'v20.0',
      web_session_client_id:  settings.web_session_client_id || 'el-tarzy-whatsapp',
      web_session_path:       settings.web_session_path || null,
    });
  } else {
    db.prepare(`
      INSERT INTO whatsapp_settings
        (id, provider, wa_phone_number_id, wa_access_token, wa_business_account_id,
         wa_api_version, web_session_client_id, web_session_path)
      VALUES
        (1, @provider, @wa_phone_number_id, @wa_access_token, @wa_business_account_id,
         @wa_api_version, @web_session_client_id, @web_session_path)
    `).run({
      provider:               settings.provider || 'web_js',
      wa_phone_number_id:     settings.wa_phone_number_id || null,
      wa_access_token:        encryptedToken,
      wa_business_account_id: settings.wa_business_account_id || null,
      wa_api_version:         settings.wa_api_version || 'v20.0',
      web_session_client_id:  settings.web_session_client_id || 'el-tarzy-whatsapp',
      web_session_path:       settings.web_session_path || null,
    });
  }
}

// ──────────────────────────────────────────────
// خريطة القوالب
// ──────────────────────────────────────────────
function getTemplateMap(db) {
  try {
    const rows = db.prepare('SELECT logical_key, actual_template_name, language_code FROM whatsapp_template_map').all();
    const map = {};
    for (const row of rows) {
      map[row.logical_key] = {
        actual_template_name: row.actual_template_name,
        language_code:        row.language_code || 'ar',
      };
    }
    return map;
  } catch (e) {
    console.error('[Manager] خطأ في قراءة خريطة القوالب:', e.message);
    return {};
  }
}

function saveTemplateMap(db, templateMap) {
  const upsert = db.prepare(`
    INSERT INTO whatsapp_template_map (logical_key, actual_template_name, language_code)
    VALUES (@logical_key, @actual_template_name, @language_code)
    ON CONFLICT(logical_key) DO UPDATE SET
      actual_template_name = excluded.actual_template_name,
      language_code        = excluded.language_code
  `);

  const tx = db.transaction((entries) => {
    for (const entry of entries) {
      upsert.run(entry);
    }
  });

  const entries = Object.entries(templateMap).map(([key, val]) => ({
    logical_key:          key,
    actual_template_name: typeof val === 'string' ? val : val.actual_template_name,
    language_code:        typeof val === 'object' ? (val.language_code || 'ar') : 'ar',
  }));

  tx(entries);
}

// ──────────────────────────────────────────────
// مساعد: إرسال للـ renderer
// ──────────────────────────────────────────────
function sendToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data);
  }
}

module.exports = {
  initWhatsAppManager,
  initWhatsAppManagerWithApp,
  switchProvider,
  getActiveProvider,
  getActiveProviderSafe,
  enqueueMessage,
  sendFile,
  getWhatsAppSettings,
  saveWhatsAppSettings,
  getTemplateMap,
  saveTemplateMap,
};
