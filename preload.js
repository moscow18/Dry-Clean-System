'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Fix Windows focus issue by requesting the main process to natively refocus
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    ipcRenderer.invoke('window:requestFocus').catch(() => {});
  }, 100);
});


contextBridge.exposeInMainWorld('auth', {
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
});

contextBridge.exposeInMainWorld('shift', {
  start: (openingCash) => ipcRenderer.invoke('shift:start', openingCash),
  end: (shiftId, actualCash, actualVodafone, actualInstapay, notes) => ipcRenderer.invoke('shift:end', shiftId, actualCash, actualVodafone, actualInstapay, notes),
  getSummary: (shiftId) => ipcRenderer.invoke('shift:getSummary', shiftId),
  getCurrent: () => ipcRenderer.invoke('shift:getCurrent'),
});

contextBridge.exposeInMainWorld('users', {
  list: () => ipcRenderer.invoke('users:list'),
  create: (userData) => ipcRenderer.invoke('users:create', userData),
  toggleActive: (userId) => ipcRenderer.invoke('users:toggleActive', userId),
  resetPassword: (userId, newPassword) => ipcRenderer.invoke('users:resetPassword', userId, newPassword),
});

contextBridge.exposeInMainWorld('backup', {
  create: (type) => ipcRenderer.invoke('backup:create', type),
  list: () => ipcRenderer.invoke('backup:list'),
  restore: (filePath) => ipcRenderer.invoke('backup:restore', filePath),
  getExternalPath: () => ipcRenderer.invoke('backup:getExternalPath'),
  setExternalPath: (dir) => ipcRenderer.invoke('backup:setExternalPath', dir),
  clearExternalPath: () => ipcRenderer.invoke('backup:clearExternalPath'),
});

contextBridge.exposeInMainWorld('db', {
  // Generic SQL operations
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  queryOne: (sql, params) => ipcRenderer.invoke('db:queryOne', sql, params),
  run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  getDailyReport: (date) => ipcRenderer.invoke('db:getDailyReport', date),

  // Invoice
  generateInvoiceNumber: () => ipcRenderer.invoke('db:previewInvoiceNumber'),
  saveInvoice: (invoiceData, items) => ipcRenderer.invoke('db:saveInvoice', invoiceData, items),
  updateInvoiceStatus: (invoiceId, status, driverId) => ipcRenderer.invoke('db:updateInvoiceStatus', invoiceId, status, driverId),
  updateDeliveryDriver: (invoiceId, driverId) => ipcRenderer.invoke('db:updateDeliveryDriver', invoiceId, driverId),
  payInvoiceRemaining: (invoiceId, amount, safeType) => ipcRenderer.invoke('db:payInvoiceRemaining', invoiceId, amount, safeType),
  reversePayment: (invoiceId, amount) => ipcRenderer.invoke('db:reversePayment', invoiceId, amount),

  // Bag Tracking
  setBagCount: (invoiceId, bagCount) => ipcRenderer.invoke('db:setBagCount', invoiceId, bagCount),
  confirmBagScan: (qrCode) => ipcRenderer.invoke('db:confirmBagScan', qrCode),
  getInvoiceBags: (invoiceId) => ipcRenderer.invoke('db:getInvoiceBags', invoiceId),
  getUnprintedBags: () => ipcRenderer.invoke('db:getUnprintedBags'),
  markBagsPrinted: (bagIds) => ipcRenderer.invoke('db:markBagsPrinted', bagIds),

  // Returns
  saveReturn: (returnData, items) => ipcRenderer.invoke('db:saveReturn', returnData, items),

  // Treasury
  getTreasuryBalance: (type) => ipcRenderer.invoke('db:getTreasuryBalance', type),
  addTreasuryEntry: (type, desc, amount, tType) => ipcRenderer.invoke('db:addTreasuryEntry', type, desc, amount, tType),

  // Salary
  paySalary: (data) => ipcRenderer.invoke('db:paySalary', data),
  reverseSalaryPayment: (employeeId, month) => ipcRenderer.invoke('db:reverseSalaryPayment', employeeId, month),

  // Settings
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  updateSettings: (data) => ipcRenderer.invoke('db:updateSettings', data),
  copyLogo: (sourcePath) => ipcRenderer.invoke('settings:copyLogo', sourcePath),

  // Backup (legacy)
  backup: (destPath) => ipcRenderer.invoke('db:backup', destPath),

  // Selective Reset
  selectiveReset: (options) => ipcRenderer.invoke('db:selectiveReset', options),

  // Truncate Operations
  truncateInvoices: () => ipcRenderer.invoke('db:truncateInvoices'),
  truncateFinance: () => ipcRenderer.invoke('db:truncateFinance'),

  // Batch Upsert Customers (Excel Import)
  batchUpsertCustomers: (list) => ipcRenderer.invoke('db:batchUpsertCustomers', list),

  // Auto Absence
  applyAutoAbsence: (date) => ipcRenderer.invoke('hr:applyAutoAbsence', date),
});

contextBridge.exposeInMainWorld('electron', {
  // Navigation
  navigate: (page) => ipcRenderer.invoke('navigate', page),

  // Request keyboard focus back (fix Windows focus loss)
  requestFocus: () => ipcRenderer.invoke('window:requestFocus'),

  // Printing
  print: (options) => ipcRenderer.invoke('print', options),

  // Dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),

  // Filesystem helpers
  writeFile: (filePath, base64Data) => ipcRenderer.invoke('fs:writeFile', filePath, base64Data),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),

  // External
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  getLocalIp: () => ipcRenderer.invoke('app:getLocalIp'),
  getNetworkDetails: () => ipcRenderer.invoke('app:getNetworkDetails'),
  openFirewallPort: () => ipcRenderer.invoke('app:openFirewallPort'),
  getLogoPath: (dbPath) => ipcRenderer.invoke('app:getLogoPath', dbPath),
  restart: () => ipcRenderer.invoke('app:restart'),
  factoryReset: () => ipcRenderer.invoke('app:factoryReset'),
  printToPDF: (path) => ipcRenderer.invoke('app:printToPDF', path),
  selectFolder: () => ipcRenderer.invoke('app:selectFolder'),
  generateAndSendReport: (opts) => ipcRenderer.invoke('app:generateAndSendReport', opts),
  getPrinters: () => ipcRenderer.invoke('app:getPrinters'),
  printLabel: (opts) => ipcRenderer.invoke('app:printLabel', opts),

  // Quit flow — listen for backup confirmation from main process
  onConfirmBackupBeforeQuit: (callback) => {
    ipcRenderer.on('confirm-backup-before-quit', () => callback());
  },
  quitWithBackup: () => ipcRenderer.send('quit-with-backup'),
  quitWithoutBackup: () => ipcRenderer.send('quit-without-backup'),
  cancelQuit: () => ipcRenderer.send('cancel-quit'),
});

// ─── WhatsApp API ──────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('whatsapp', {
  // الحالة والـ QR
  getStatus:                   () => ipcRenderer.invoke('whatsapp:getStatus'),
  getQR:                       () => ipcRenderer.invoke('whatsapp:getQR'),

  // إرسال الرسائل (الـ channels القديمة — لا تتغير)
  send:            (phone, msg) => ipcRenderer.invoke('whatsapp:send', phone, msg),
  sendInvoiceConfirm:       (d) => ipcRenderer.invoke('whatsapp:sendInvoiceConfirm', d),
  sendOrderReady:           (d) => ipcRenderer.invoke('whatsapp:sendOrderReady', d),
  sendOutForDelivery:       (d) => ipcRenderer.invoke('whatsapp:sendOutForDelivery', d),
  sendDelivered:            (d) => ipcRenderer.invoke('whatsapp:sendDelivered', d),
  sendDeliveredWithFullPayment: (d) => ipcRenderer.invoke('whatsapp:sendDeliveredWithFullPayment', d),
  sendPartialPayment:       (d) => ipcRenderer.invoke('whatsapp:sendPartialPayment', d),
  sendFullPayment:          (d) => ipcRenderer.invoke('whatsapp:sendFullPayment', d),
  sendReminder:             (d) => ipcRenderer.invoke('whatsapp:sendReminder', d),
  disconnect:               () => ipcRenderer.invoke('whatsapp:disconnect'),

  // ─── إدارة المزوّدين (Multi-Provider) ───────────────────────────────────────
  getProviderSettings: ()    => ipcRenderer.invoke('whatsapp:getSettings'),
  saveProviderSettings: (s)  => ipcRenderer.invoke('whatsapp:saveSettings', s),
  testConnection: (cfg)      => ipcRenderer.invoke('whatsapp:testConnection', cfg),
  getTemplateMap: ()         => ipcRenderer.invoke('whatsapp:getTemplates'),
  saveTemplateMap: (map)     => ipcRenderer.invoke('whatsapp:saveTemplates', map),
  verifyTemplates: (cfg)     => ipcRenderer.invoke('whatsapp:verifyTemplates', cfg),

  // إرسال حر لرقم محدد (for admin report etc.)
  sendMessage:     (phone, msg)              => ipcRenderer.invoke('whatsapp:send', phone, msg),
  sendFile:        (phone, caption, filePath) => ipcRenderer.invoke('whatsapp:sendFile', phone, caption, filePath),

  // أحداث واتساب من Main → Renderer
  onQR:           (cb) => ipcRenderer.on('whatsapp:qr',            (_, data)   => cb(data)),
  onReady:        (cb) => ipcRenderer.on('whatsapp:ready',          ()         => cb()),
  onAuthenticated:(cb) => ipcRenderer.on('whatsapp:authenticated',  ()         => cb()),
  onDisconnected: (cb) => ipcRenderer.on('whatsapp:disconnected',   (_, reason)=> cb(reason)),
  onLoading:      (cb) => ipcRenderer.on('whatsapp:loading',        (_, pct)   => cb(pct)),
  onError:        (cb) => ipcRenderer.on('whatsapp:error',          (_, msg)   => cb(msg)),
});

// ─── Activation API ────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('activation', {
  getStatus:     ()       => ipcRenderer.invoke('activation:getStatus'),
  activate:      (serial) => ipcRenderer.invoke('activation:activate', serial),
  getHwId:       ()       => ipcRenderer.invoke('activation:getHwId'),
  getInstallId:  ()       => ipcRenderer.invoke('activation:getInstallId'),
});

// ─── Excel API (xlsx) ─────────────────────────────────────────────────────────
let _xlsxModule = null;
try {
  _xlsxModule = require('xlsx');
} catch (e) {
  console.error('Failed to require xlsx in preload:', e);
}

contextBridge.exposeInMainWorld('excel', {
  exportToBuffer: (jsonData, sheetName = 'Sheet1') => {
    if (!_xlsxModule) throw new Error('مكتبة Excel غير متوفرة');
    const ws = _xlsxModule.utils.json_to_sheet(jsonData);
    const wb = _xlsxModule.utils.book_new();
    _xlsxModule.utils.book_append_sheet(wb, ws, sheetName);
    return _xlsxModule.write(wb, { type: 'base64', bookType: 'xlsx' });
  },
  parseFileBuffer: (base64Data) => {
    if (!_xlsxModule) throw new Error('مكتبة Excel غير متوفرة');
    const wb = _xlsxModule.read(base64Data, { type: 'base64' });
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    return _xlsxModule.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }
});
