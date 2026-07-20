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
  end: (shiftId, actualCash, actualVodafone, notes) => ipcRenderer.invoke('shift:end', shiftId, actualCash, actualVodafone, notes),
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

  // Invoice
  generateInvoiceNumber: () => ipcRenderer.invoke('db:previewInvoiceNumber'),
  saveInvoice: (invoiceData, items) => ipcRenderer.invoke('db:saveInvoice', invoiceData, items),
  updateInvoiceStatus: (invoiceId, status) => ipcRenderer.invoke('db:updateInvoiceStatus', invoiceId, status),
  payInvoiceRemaining: (invoiceId, amount, safeType) => ipcRenderer.invoke('db:payInvoiceRemaining', invoiceId, amount, safeType),
  reversePayment: (invoiceId, amount) => ipcRenderer.invoke('db:reversePayment', invoiceId, amount),

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

  // External
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  getLogoPath: (dbPath) => ipcRenderer.invoke('app:getLogoPath', dbPath),
  restart: () => ipcRenderer.invoke('app:restart'),
  factoryReset: () => ipcRenderer.invoke('app:factoryReset'),

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
  getStatus:                   () => ipcRenderer.invoke('whatsapp:getStatus'),
  getQR:                       () => ipcRenderer.invoke('whatsapp:getQR'),
  send:            (phone, msg) => ipcRenderer.invoke('whatsapp:send', phone, msg),
  sendInvoiceConfirm:       (d) => ipcRenderer.invoke('whatsapp:sendInvoiceConfirm', d),
  sendOrderReady:           (d) => ipcRenderer.invoke('whatsapp:sendOrderReady', d),
  sendDelivered:            (d) => ipcRenderer.invoke('whatsapp:sendDelivered', d),
  sendDeliveredWithFullPayment: (d) => ipcRenderer.invoke('whatsapp:sendDeliveredWithFullPayment', d),
  sendPartialPayment:       (d) => ipcRenderer.invoke('whatsapp:sendPartialPayment', d),
  sendFullPayment:          (d) => ipcRenderer.invoke('whatsapp:sendFullPayment', d),
  sendReminder:             (d) => ipcRenderer.invoke('whatsapp:sendReminder', d),
  disconnect:               () => ipcRenderer.invoke('whatsapp:disconnect'),

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
