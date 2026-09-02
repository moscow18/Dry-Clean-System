'use strict';
const fs = require('fs');
const os = require('os');
const logPath = require('path').join(os.homedir(), 'Desktop', 'eltarzy-error.txt');
function logError(msg) {
  try { fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] ${msg}`); } catch(e){}
}
process.on('uncaughtException', (err) => {
  logError('UNCAUGHT EXCEPTION: ' + err.stack);
});
process.on('unhandledRejection', (err) => {
  logError('UNHANDLED REJECTION: ' + (err ? err.stack : err));
});
logError('=== APP STARTING ===');

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { setupIpcHandlers, createBackup, copyBackupToExternal } = require('./database/db');
const {
  initWhatsAppManagerWithApp,
  switchProvider,
  getActiveProvider,
  getActiveProviderSafe,
  getWhatsAppSettings,
  saveWhatsAppSettings,
  getTemplateMap,
  saveTemplateMap,
} = require('./whatsapp/whatsapp-manager');
const { setupActivationIpc, getActivationStatus } = require('./activation');
const { startPerformanceManager, stopPerformanceManager } = require('./performance-manager');

let mainWindow = null;
let allowQuit = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#F0F2F7',  // المطابقة التامة للون خلفية التطبيق لمحو أي وميض
    title: 'الترزي — نظام إدارة محل الترزي',
    ...(fs.existsSync(path.join(__dirname, 'assets', 'icon.png')) ? { icon: path.join(__dirname, 'assets', 'icon.png') } : {}),
    show: false  // نخفيها حتى تكتمل لمنع الوميض
  });
  logError('BrowserWindow created.');

  // دائماً افتح صفحة الدخول — الداشبورد يتحكم في وضع التجربة/القراءة فقط
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));

  let windowShown = false;
  mainWindow.once('ready-to-show', () => {
    if (!windowShown) {
      windowShown = true;
      mainWindow.show();
      mainWindow.maximize();
    }
  });

  // Fallback for Windows 7: الإجبار على إظهار النافذة إذا لم يُطلق الحدث
  setTimeout(() => {
    if (!windowShown && mainWindow) {
      windowShown = true;
      mainWindow.show();
      mainWindow.maximize();
    }
  }, 1500);

  mainWindow.webContents.once('did-finish-load', () => {
    // تأخير 5 ثوانٍ فقط — وقت كافٍ لتسجيل الدخول
    setTimeout(() => {
      const { getDb } = require('./database/db');
      const db = getDb(app);
      initWhatsAppManagerWithApp(db, mainWindow, app).catch(err => {
        logError('[Main] فشل تشغيل WhatsApp Manager: ' + err.message);
      });
    }, 5000);
  });

  // ─── Graceful Shutdown — Backup Confirmation ────────────────────────────────
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  mainWindow.on('close', (e) => {
    if (!allowQuit) {
      e.preventDefault();
      mainWindow.webContents.send('confirm-backup-before-quit');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
// إعادة تفعيل disableHardwareAcceleration لمنع ظهور وميض الديسكتوب عند التنقل في ويندوز
app.disableHardwareAcceleration();

// ─── إعدادات الأداء + Windows 10 ────────────────────────────────────────────
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

app.whenReady().then(() => {
  setupIpcHandlers(ipcMain, app);
  setupActivationIpc(ipcMain, app);  // ← نظام التفعيل
  createWindow();

  // بدء Performance Manager بعد إنشاء النافذة
  startPerformanceManager(__dirname);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopPerformanceManager();
  if (process.platform !== 'darwin') app.quit();
});

// ─── Quit flow IPC handlers ───────────────────────────────────────────────────
ipcMain.on('quit-with-backup', async () => {
  try {
    await createBackup('تلقائي عند الخروج');
  } catch (e) {
    logError('Backup before quit failed: ' + e.message);
  }
  allowQuit = true;
  app.quit();
});

ipcMain.on('quit-without-backup', () => {
  allowQuit = true;
  app.quit();
});

ipcMain.on('cancel-quit', () => {
  // Do nothing — the quit was already prevented
});

// ─── Navigation IPC ────────────────────────────────────────────────────────────
ipcMain.handle('navigate', async (_, page) => {
  if (!mainWindow) return;
  const pagePath = path.join(__dirname, 'renderer', page);
  mainWindow.loadFile(pagePath);
});

// ─── Focus Recovery IPC (Windows keyboard fix) ────────────────────────────────
ipcMain.handle('window:requestFocus', () => {
  if (!mainWindow) return;
  if (process.platform === 'win32') {
    // الطريقة الأكثر فعالية لفك تعليق الكيبورد في ويندوز
    mainWindow.blur();
    mainWindow.focus();
  } else {
    mainWindow.focus();
  }
  mainWindow.webContents.focus();
});

// ─── Print IPC ─────────────────────────────────────────────────────────────────
ipcMain.handle('print', async (_, options) => {
  if (!mainWindow) return false;
  
  const printOptions = {
    silent: true,
    printBackground: true,
    color: false,
    margins: { marginType: 'none' },
    ...options
  };

  return new Promise((resolve) => {
    mainWindow.webContents.print(printOptions, (success, errorType) => {
      resolve(success);
    });
  });
});

// ─── File Dialog IPC ───────────────────────────────────────────────────────────
ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

// ─── Print to PDF ───────────────────────────────────────────────────────────────
ipcMain.handle('app:printToPDF', async (event, savePath) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      marginsType: 1  // 0=default, 1=no margin, 2=minimum
    });
    fs.writeFileSync(savePath, pdfBuffer);
    return { success: true, path: savePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('app:selectFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'اختر مجلد حفظ التقارير'
  });
  if (res.canceled || !res.filePaths.length) return { success: false };
  return { success: true, path: res.filePaths[0] };
});

// ─── Open External Link ────────────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', (_, url) => {
  shell.openExternal(url);
});

// ─── Generate Daily Report PDF in hidden window & send via WhatsApp ────────────
ipcMain.handle('app:generateAndSendReport', async (_, { date, savePath, phone }) => {
  return new Promise((resolve) => {
    try {
      const reportWin = new BrowserWindow({
        width: 1200,
        height: 900,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      });

      const reportUrl = path.join(__dirname, 'renderer', 'daily-report.html');
      reportWin.loadFile(reportUrl);

      // انتظر اكتمال التحميل وتحديد التاريخ
      reportWin.webContents.on('did-finish-load', () => {
        // أرسل للـ renderer التاريخ المطلوب ثم انتظر علامة "جاهز للـ PDF"
        reportWin.webContents.executeJavaScript(`
          (async () => {
            try {
              document.getElementById('reportDate').value = '${date}';
              await loadDailyReport();
              enablePrintMode();
              await new Promise(r => setTimeout(r, 600));
              return 'ready';
            } catch(e) {
              return 'error:' + e.message;
            }
          })()
        `).then(async (result) => {
          if (result && result.startsWith('error:')) {
            reportWin.destroy();
            return resolve({ success: false, error: result });
          }

          try {
            const pdfBuffer = await reportWin.webContents.printToPDF({
              printBackground: true,
              pageSize: 'A4',
              landscape: false,
              marginsType: 1
            });
            fs.writeFileSync(savePath, pdfBuffer);
            reportWin.destroy();
            resolve({ success: true, path: savePath });
          } catch (pdfErr) {
            reportWin.destroy();
            resolve({ success: false, error: pdfErr.message });
          }
        }).catch((err) => {
          reportWin.destroy();
          resolve({ success: false, error: err.message });
        });
      });

      reportWin.webContents.on('did-fail-load', (e, code, desc) => {
        reportWin.destroy();
        resolve({ success: false, error: 'فشل تحميل صفحة التقرير: ' + desc });
      });

      // حد أقصى 30 ثانية
      setTimeout(() => {
        if (!reportWin.isDestroyed()) {
          reportWin.destroy();
          resolve({ success: false, error: 'انتهت مهلة توليد التقرير' });
        }
      }, 30000);

    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
});

// ─── App info ──────────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));

// ─── Restart app (for backup restore) ──────────────────────────────────────────
ipcMain.handle('app:restart', () => {
  app.relaunch();
  allowQuit = true;
  app.quit();
});

// ─── Get logo as file:// URL ───────────────────────────────────────────────────
ipcMain.handle('app:getLogoPath', (_, logoDbPath) => {
  if (!logoDbPath) return null;
  if (fs.existsSync(logoDbPath)) {
    return `file://${logoDbPath.replace(/\\/g, '/')}`;
  }
  return null;
});

// ─── Helper: جلب إعدادات المحل من قاعدة البيانات ─────────────────────────────
function getShopSettings() {
  try {
    const { getDb } = require('./database/db');
    const db  = getDb(app);
    const row = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    return row || {};
  } catch (e) {
    return {};
  }
}

function getAppDb() {
  const { getDb } = require('./database/db');
  return getDb(app);
}

// ─── WhatsApp IPC ──────────────────────────────────────────────────────────────

// حالة المزوّد النشط
ipcMain.handle('whatsapp:getStatus', async () => {
  try {
    const provider = getActiveProviderSafe();
    if (!provider) return { ready: false, statusType: 'disconnected', label: 'غير مهيأ', hasQR: false };
    const status = await provider.getStatus();
    return { ...status, hasQR: status.needsQR || false };
  } catch (e) {
    return { ready: false, statusType: 'disconnected', label: e.message, hasQR: false };
  }
});

// جلب QR (للتوافق مع الكود القديم في preload)
ipcMain.handle('whatsapp:getQR', async () => {
  try {
    const provider = getActiveProviderSafe();
    if (!provider) return { success: false, qr: null };
    const status = await provider.getStatus();
    if (status.needsQR && status.qrImage) {
      return { success: true, qr: status.qrImage };
    }
    return { success: false, qr: null };
  } catch {
    return { success: false, qr: null };
  }
});

// إرسال نصي حر (legacy — للتوافق مع الكود القديم)
ipcMain.handle('whatsapp:send', async (_, phone, message) => {
  const manager = require('./whatsapp/whatsapp-manager');
  return await manager.enqueueMessage(phone, 'custom', { customText: message }, true);
});

ipcMain.handle('whatsapp:sendFile', async (_, phone, caption, filePath) => {
  const manager = require('./whatsapp/whatsapp-manager');
  return await manager.sendFile(phone, caption, filePath);
});

// تأكيد الفاتورة عند الحفظ
ipcMain.handle('whatsapp:sendInvoiceConfirm', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  try {
    return await getActiveProvider().sendMessage({
      type: 'invoice_confirm', phone: data.phone, payload: data, settings: getShopSettings(),
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// الطلب جاهز للاستلام
ipcMain.handle('whatsapp:sendOrderReady', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  try {
    return await getActiveProvider().sendMessage({
      type: 'order_ready', phone: data.phone, payload: data, settings: getShopSettings(),
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// تم التسليم
ipcMain.handle('whatsapp:sendDelivered', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  try {
    return await getActiveProvider().sendMessage({
      type: 'order_delivered', phone: data.phone, payload: data, settings: getShopSettings(),
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// تسديد كامل + تسليم
ipcMain.handle('whatsapp:sendDeliveredWithFullPayment', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  try {
    return await getActiveProvider().sendMessage({
      type: 'full_payment', phone: data.phone, payload: data, settings: getShopSettings(),
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// دفعة جزئية
ipcMain.handle('whatsapp:sendPartialPayment', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  try {
    return await getActiveProvider().sendMessage({
      type: 'partial_payment', phone: data.phone, payload: data, settings: getShopSettings(),
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// سداد كامل بدون تسليم (نفس نوع full_payment)
ipcMain.handle('whatsapp:sendFullPayment', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  try {
    return await getActiveProvider().sendMessage({
      type: 'full_payment', phone: data.phone, payload: data, settings: getShopSettings(),
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// قطع اتصال Web.js (للتوافق مع الكود القديم)
ipcMain.handle('whatsapp:disconnect', async () => {
  try {
    const provider = getActiveProviderSafe();
    if (!provider) return { success: false, error: 'لا يوجد مزوّد نشط' };
    await provider.destroy();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── إعدادات الواتساب (Multi-Provider) ────────────────────────────────────────

// جلب إعدادات المزوّد الحالية
ipcMain.handle('whatsapp:getSettings', () => {
  try {
    const db = getAppDb();
    const settings = getWhatsAppSettings(db);
    // لا نُرجع الـ Token المفكوك للـ renderer (أمان)
    const { wa_access_token_plain, wa_access_token, ...safeSettings } = settings;
    return { success: true, data: safeSettings };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// حفظ الإعدادات والتبديل بين المزوّدين
ipcMain.handle('whatsapp:saveSettings', async (_, newSettings) => {
  try {
    const db = getAppDb();
    // حفظ الإعدادات في DB أولاً
    saveWhatsAppSettings(db, newSettings);
    // التبديل للمزوّد الجديد مع Rollback تلقائي عند الفشل
    const result = await switchProvider(newSettings.provider, newSettings, db, app);
    if (!result.success) {
      // أعِد الإعدادات القديمة في DB
      const oldSettings = getWhatsAppSettings(db);
      saveWhatsAppSettings(db, oldSettings);
    }
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// اختبار الاتصال بـ Cloud API — GET فقط، بدون رسالة
ipcMain.handle('whatsapp:testConnection', async (_, cfg) => {
  try {
    const CloudAPIProvider = require('./whatsapp/providers/cloud-api-provider');
    const tempProvider = new CloudAPIProvider();
    return await tempProvider.testConnection({
      phoneNumberId: cfg.wa_phone_number_id,
      accessToken:   cfg.wa_access_token_plain,
      apiVersion:    cfg.wa_api_version || 'v20.0',
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// جلب خريطة القوالب
ipcMain.handle('whatsapp:getTemplates', () => {
  try {
    const db = getAppDb();
    const map = getTemplateMap(db);
    return { success: true, data: map };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// حفظ خريطة القوالب
ipcMain.handle('whatsapp:saveTemplates', (_, templateMap) => {
  try {
    const db = getAppDb();
    saveTemplateMap(db, templateMap);
    // تحديث الـ provider النشط بخريطة القوالب الجديدة
    const provider = getActiveProviderSafe();
    if (provider && typeof provider.updateTemplateMap === 'function') {
      provider.updateTemplateMap(getTemplateMap(db));
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// التحقق من القوالب: جلب القوالب الفعلية من Meta ومقارنتها بالإعدادات المحلية
ipcMain.handle('whatsapp:verifyTemplates', async (_, cfg) => {
  try {
    const CloudAPIProvider = require('./whatsapp/providers/cloud-api-provider');
    const tempProvider = new CloudAPIProvider();

    // بناء الـ config — نستخدم Access Token المُمرَّر أو المُخزَّن
    const db = getAppDb();
    const saved = getWhatsAppSettings(db);
    const accessToken = cfg?.wa_access_token_plain || saved?.wa_access_token_plain;
    const businessAccountId = cfg?.wa_business_account_id || saved?.wa_business_account_id;
    const phoneNumberId = cfg?.wa_phone_number_id || saved?.wa_phone_number_id;
    const apiVersion = cfg?.wa_api_version || saved?.wa_api_version || 'v20.0';

    if (!accessToken) {
      return { success: false, error: 'يرجى حفظ إعدادات الواتساب أولاً (Access Token مطلوب)' };
    }
    if (!businessAccountId) {
      return { success: false, error: 'يرجى إدخال WhatsApp Business Account ID في الإعدادات لاستخدام هذه الميزة' };
    }

    // جلب القوالب الفعلية من Meta
    const metaTemplates = await tempProvider.fetchAccountTemplates({
      accessToken, businessAccountId, phoneNumberId, apiVersion,
    });

    // بناء خريطة للبحث السريع: { "template_name_ar": ["ar_EG", ...] }
    const metaMap = {};
    for (const tpl of metaTemplates) {
      const name = tpl.name.toLowerCase();
      if (!metaMap[name]) metaMap[name] = [];
      metaMap[name].push({ language: tpl.language, status: tpl.status });
    }

    // مقارنة مع الإعدادات المحلية
    const localTemplates = getTemplateMap(db);
    const results = [];

    for (const [logicalKey, localInfo] of Object.entries(localTemplates)) {
      if (!localInfo.actual_template_name) {
        results.push({ logicalKey, status: 'empty', message: 'لم يتم ربط هذا القالب بعد' });
        continue;
      }

      const localName = localInfo.actual_template_name.trim().toLowerCase();
      const localLang = (localInfo.language_code || 'ar_EG').trim().toLowerCase();

      const metaVersions = metaMap[localName];

      if (!metaVersions) {
        results.push({
          logicalKey,
          actual_template_name: localInfo.actual_template_name,
          language_code: localInfo.language_code,
          status: 'name_not_found',
          message: `❌ اسم القالب "${localInfo.actual_template_name}" غير موجود على حساب Meta`,
        });
      } else {
        // الاسم موجود — نتحقق من اللغة
        const langMatch = metaVersions.find(v => v.language.toLowerCase() === localLang);
        if (!langMatch) {
          const availableLangs = metaVersions.map(v => v.language).join(', ');
          results.push({
            logicalKey,
            actual_template_name: localInfo.actual_template_name,
            language_code: localInfo.language_code,
            status: 'lang_mismatch',
            message: `⚠️ اسم القالب "${localInfo.actual_template_name}" موجود لكن كود اللغة المُدخَل "${localInfo.language_code}" غير صحيح — الأكواد المتاحة على Meta: ${availableLangs}`,
            availableLangs,
          });
        } else {
          results.push({
            logicalKey,
            actual_template_name: localInfo.actual_template_name,
            language_code: localInfo.language_code,
            status: langMatch.status === 'APPROVED' ? 'ok' : 'not_approved',
            message: langMatch.status === 'APPROVED'
              ? `✅ القالب "${localInfo.actual_template_name}" مطابق ومعتمد`
              : `⚠️ القالب "${localInfo.actual_template_name}" موجود لكن حالته "${langMatch.status}" (غير معتمد بعد)`,
          });
        }
      }
    }

    return {
      success: true,
      data: {
        results,
        metaTemplatesCount: metaTemplates.length,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

