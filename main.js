'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers, createBackup, copyBackupToExternal } = require('./database/db');
const { initWhatsApp, sendWhatsApp, disconnectWhatsApp, isReady, getCurrentQR, MESSAGES } = require('./whatsapp/whatsapp-service');
const { setupActivationIpc, getActivationStatus } = require('./activation');

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
    title: 'الترزي — نظام إدارة محل الترزي',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  // دائماً افتح صفحة الدخول — الداشبورد يتحكم في وضع التجربة/القراءة فقط
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    // تهيئة واتساب بعد اكتمال تحميل الصفحة لتجنب التأخير العشوائي
    initWhatsApp(mainWindow, app.getPath('userData'));
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
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady().then(() => {
  setupIpcHandlers(ipcMain, app);
  setupActivationIpc(ipcMain, app);  // ← نظام التفعيل
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Quit flow IPC handlers ───────────────────────────────────────────────────
ipcMain.on('quit-with-backup', () => {
  try {
    const result = createBackup('تلقائي عند الإغلاق');
    // نسخ فوري للمسار الخارجي لو كان محدد
    if (result.success && result.data && result.data.filePath) {
      copyBackupToExternal(result.data.filePath);
    }
  } catch (e) {
    console.error('Backup on quit failed:', e);
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
ipcMain.handle('navigate', (_, page) => {
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

// ─── Open External Link ────────────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', (_, url) => {
  shell.openExternal(url);
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

// ─── WhatsApp IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('whatsapp:getStatus', () => {
  return { ready: isReady(), hasQR: !!getCurrentQR() };
});

ipcMain.handle('whatsapp:getQR', async () => {
  const qr = getCurrentQR();
  if (!qr) return { success: false, qr: null };
  try {
    const qrcode = require('qrcode');
    const dataUrl = await qrcode.toDataURL(qr, { width: 256, margin: 2 });
    return { success: true, qr: dataUrl };
  } catch {
    return { success: false, qr: null };
  }
});

ipcMain.handle('whatsapp:send', async (_, phone, message) => {
  return await sendWhatsApp(phone, message);
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

// تأكيد الفاتورة عند الحفظ
ipcMain.handle('whatsapp:sendInvoiceConfirm', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  const s   = getShopSettings();
  const msg = MESSAGES.invoiceConfirm({
    ...data,
    shopName:     s.company_name || data.shopName || 'المحل',
    address:      s.address || '',
    contactPhone: s.wa_phone1 || s.phone || '',
    settings:     s,
  });
  return await sendWhatsApp(data.phone, msg);
});

// الطلب جاهز للاستلام
ipcMain.handle('whatsapp:sendOrderReady', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  const s   = getShopSettings();
  const msg = MESSAGES.orderReady({
    ...data,
    shopName:     s.company_name || data.shopName || 'المحل',
    address:      s.address || '',
    contactPhone: s.wa_phone1 || s.phone || '',
    settings:     s,
  });
  return await sendWhatsApp(data.phone, msg);
});

// تم التسليم
ipcMain.handle('whatsapp:sendDelivered', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  const s   = getShopSettings();
  const msg = MESSAGES.delivered({
    ...data,
    shopName:     s.company_name || data.shopName || 'المحل',
    address:      s.address || '',
    contactPhone: s.wa_phone1 || s.phone || '',
    settings:     s,
  });
  return await sendWhatsApp(data.phone, msg);
});

// تسديد كامل + تسليم
ipcMain.handle('whatsapp:sendDeliveredWithFullPayment', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  const s   = getShopSettings();
  const msg = MESSAGES.deliveredWithFullPayment({
    ...data,
    shopName:     s.company_name || data.shopName || 'المحل',
    address:      s.address || '',
    contactPhone: s.wa_phone1 || s.phone || '',
    settings:     s,
  });
  return await sendWhatsApp(data.phone, msg);
});

// دفعة جزئية
ipcMain.handle('whatsapp:sendPartialPayment', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  const s   = getShopSettings();
  const msg = MESSAGES.partialPayment({
    ...data,
    shopName:     s.company_name || data.shopName || 'المحل',
    address:      s.address || '',
    contactPhone: s.wa_phone1 || s.phone || '',
    settings:     s,
  });
  return await sendWhatsApp(data.phone, msg);
});

// سداد كامل بدون تسليم
ipcMain.handle('whatsapp:sendFullPayment', async (_, data) => {
  if (!data.phone) return { success: false, error: 'لا يوجد رقم هاتف للعميل' };
  const s   = getShopSettings();
  const msg = MESSAGES.deliveredWithFullPayment({
    ...data,
    shopName:     s.company_name || data.shopName || 'المحل',
    address:      s.address || '',
    contactPhone: s.wa_phone1 || s.phone || '',
    settings:     s,
  });
  return await sendWhatsApp(data.phone, msg);
});

ipcMain.handle('whatsapp:disconnect', async () => {
  return await disconnectWhatsApp();
});

