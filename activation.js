'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  نظام التفعيل — activation.js
//  يتعامل مع: فترة التجربة، توليد كود الجهاز، كود التثبيت، التحقق من السيريال
// ═══════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const os     = require('os');
const fs     = require('fs');
const path   = require('path');

// ─── المفتاح السري (مقسم لمنع الاستخراج المباشر) ────────────────────────────
const _k = ['EL-TARZY', 'DEVBLUETECH', '2024', 'SECRET', 'X9K3M7P2'];
const SECRET_KEY = _k.join('-');

// ─── مدة التجربة المجانية (بالأيام) ──────────────────────────────────────────
const TRIAL_DAYS = 0;

// ─── مرجع لـ app ─────────────────────────────────────────────────────────────
let _app = null;
let _appDataPath = null;

function setAppDataPath(p, app) {
  _appDataPath = p;
  _app = app;
}

// ─── مسار ملف حالة التفعيل (AppData) ────────────────────────────────────────
function getActivationFilePath() {
  const dir = path.join(_appDataPath || os.tmpdir(), '.eltarzy');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, '.lic');
}

// ─── مسار كود التثبيت (في userData — مكتوب/مقروء بدون صلاحيات مرتفعة) ────────
function getInstallIdFilePath() {
  // نحفظ في userData دايماً: مكتوب بالإذن العادي، ويُحذف وقت الـ uninstall
  if (_appDataPath) {
    return path.join(_appDataPath, '.install.id');
  }
  // fallback وقت التطوير قبل ما يُضبط _appDataPath
  return path.join(__dirname, '.install.id');
}

// ─── الحصول على كود التثبيت (يُولد مرة واحدة ويُحفظ) ──────────────────────
function getInstallId() {
  const filePath = getInstallIdFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const id = fs.readFileSync(filePath, 'utf8').trim();
      if (id && id.length >= 8) return id;
    }
    // يولد UUID جديد ويحفظه
    const newId = crypto.randomUUID().replace(/-/g, '').toUpperCase().substring(0, 16);
    const formatted = `${newId.slice(0,4)}-${newId.slice(4,8)}-${newId.slice(8,12)}-${newId.slice(12,16)}`;
    fs.writeFileSync(filePath, formatted, 'utf8');
    return formatted;
  } catch (e) {
    console.error('[Activation] Failed to get/create install ID:', e);
    return 'INST-0000-0000-0001';
  }
}

// ─── توليد كود الجهاز الفريد (Hardware ID) ───────────────────────────────────
function getHardwareId() {
  try {
    const cpus      = os.cpus();
    const cpuModel  = cpus.length > 0 ? cpus[0].model : 'UNKNOWN';
    const totalMem  = os.totalmem().toString();
    const hostname  = os.hostname();
    const platform  = os.platform();
    const arch      = os.arch();

    const rawId = `${cpuModel}-${totalMem}-${hostname}-${platform}-${arch}`;
    const hash  = crypto.createHash('sha256').update(rawId).digest('hex');

    const short = hash.substring(0, 16).toUpperCase();
    return `${short.slice(0,4)}-${short.slice(4,8)}-${short.slice(8,12)}-${short.slice(12,16)}`;
  } catch (e) {
    console.error('[Activation] Failed to get hardware ID:', e);
    return 'UNKN-0000-0000-0000';
  }
}

// ─── قراءة ملف حالة التفعيل ──────────────────────────────────────────────────
function readActivationData() {
  try {
    const filePath = getActivationFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw       = fs.readFileSync(filePath, 'utf8').trim();
    const decrypted = decryptData(raw);
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

// ─── كتابة ملف حالة التفعيل ──────────────────────────────────────────────────
function writeActivationData(data) {
  try {
    const filePath  = getActivationFilePath();
    const encrypted = encryptData(JSON.stringify(data));
    fs.writeFileSync(filePath, encrypted, 'utf8');
    return true;
  } catch (e) {
    console.error('[Activation] Failed to write activation data:', e);
    return false;
  }
}

// ─── تشفير وفك تشفير البيانات ─────────────────────────────────────────────────
function encryptData(text) {
  const iv     = crypto.randomBytes(16);
  const key    = crypto.createHash('sha256').update(SECRET_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(text) {
  const [ivHex, encrypted] = text.split(':');
  const iv      = Buffer.from(ivHex, 'hex');
  const key     = crypto.createHash('sha256').update(SECRET_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted  = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── تسجيل أول تشغيل للبرنامج ────────────────────────────────────────────────
function ensureFirstRunRecorded() {
  const currentInstallId = getInstallId();
  let data = readActivationData();

  if (!data) {
    // أول مرة تشغيل — إنشاء سجل جديد
    data = {
      firstRun:    new Date().toISOString(),
      activated:   false,
      activatedAt: null,
      serialHash:  null,
      hwId:        getHardwareId(),
      installId:   currentInstallId,
    };
    writeActivationData(data);

  } else if (data.installId && data.installId !== currentInstallId) {
    // ⚠️ تم إعادة تثبيت البرنامج — كود التثبيت تغيّر → إلغاء التفعيل
    console.log('[Activation] Install ID changed — resetting activation (reinstall detected)');
    data = {
      firstRun:    data.firstRun, // لا تعطِ فترة تجربة جديدة
      activated:   false,
      activatedAt: null,
      serialHash:  null,
      hwId:        getHardwareId(),
      installId:   currentInstallId,
    };
    writeActivationData(data);

  } else if (!data.installId) {
    // ترخيص قديم بدون installId (نسخ قديمة) — نضيف installId بدون إلغاء التفعيل
    console.log('[Activation] Legacy license without installId — updating to include current installId');
    data.installId = currentInstallId;
    data.hwId = data.hwId || getHardwareId();
    writeActivationData(data);
  }
  return data;
}

// ─── الحصول على حالة التفعيل الكاملة ────────────────────────────────────────
function getActivationStatus() {
  const data      = ensureFirstRunRecorded();
  const hwId      = getHardwareId();
  const installId = getInstallId();

  if (data.activated && data.serialHash) {
    // تحقق صارم: لازم نفس الجهاز ونفس كود التثبيت بالضبط
    const hwMatch      = data.hwId      === hwId;
    const installMatch = data.installId === installId;

    if (!hwMatch || !installMatch) {
      console.log('[Activation] HW or Install ID mismatch — deactivating');
      return { activated: false, trialExpired: true, daysLeft: 0, hwId, installId };
    }

    // ─── تحقق من انتهاء التفعيل المؤقت ──────────────────────────────────
    if (data.expiresAt) {
      const expiresAt = new Date(data.expiresAt);
      const now       = new Date();
      if (now > expiresAt) {
        // التفعيل المؤقت انتهى
        return { activated: false, trialExpired: true, daysLeft: 0, hwId, installId };
      }
      const daysLeft = Math.max(1, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));
      return {
        activated: true, trialExpired: false, daysLeft,
        isTimed: true, activationExpiry: data.expiresAt,
        hwId, installId
      };
    }

    // ─── تفعيل دائم ──────────────────────────────────────────────────────
    return { activated: true, trialExpired: false, daysLeft: null, isTimed: false, hwId, installId };
  }

  // احسب أيام التجربة
  const firstRun     = new Date(data.firstRun);
  const now          = new Date();
  const diffDays     = Math.floor((now - firstRun) / (1000 * 60 * 60 * 24));
  const daysLeft     = Math.max(0, TRIAL_DAYS - diffDays);
  const trialExpired = daysLeft === 0;

  return { activated: false, trialExpired, daysLeft, hwId, installId };
}

// ─── التحقق من السيريال وتفعيل البرنامج ─────────────────────────────────────
function activateWithSerial(serial) {
  try {
    const hwId        = getHardwareId();
    const installId   = getInstallId();
    const cleanSerial = serial.trim().toUpperCase();
    const parts       = cleanSerial.split('-');

    let isValid      = false;
    let activatedDays = 0;   // 0 = دائم
    let expiresAt    = null;

    if (parts.length === 4) {
      // ─── Format قديم: تفعيل دائم ─────────────────────────────────────────
      const expected      = generateSerial(hwId, installId);
      const cleanInput    = cleanSerial.replace(/[^A-Z0-9]/g, '');
      const cleanExpected = expected.toUpperCase().replace(/[^A-Z0-9]/g, '');
      isValid = (cleanInput === cleanExpected);

    } else if (parts.length === 5) {
      // ─── Format جديد: تفعيل مؤقت ─────────────────────────────────────────
      const daysStr = parts[4];
      const days    = parseInt(daysStr, 10);
      if (isNaN(days) || days <= 0) {
        return { success: false, error: 'عدد أيام التفعيل غير صحيح في الكود' };
      }
      const expectedFull  = generateTimedSerial(hwId, installId, days);
      const cleanInput    = cleanSerial.replace(/[^A-Z0-9]/g, '');
      const cleanExpected = expectedFull.replace(/[^A-Z0-9]/g, '');
      isValid       = (cleanInput === cleanExpected);
      activatedDays = days;
      expiresAt     = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    } else {
      return { success: false, error: 'صيغة مفتاح التفعيل غير صحيحة' };
    }

    if (!isValid) {
      return { success: false, error: 'مفتاح التفعيل غير صحيح' };
    }

    const data         = readActivationData() || {};
    data.activated     = true;
    data.activatedAt   = new Date().toISOString();
    data.serialHash    = crypto.createHash('sha256').update(serial).digest('hex');
    data.hwId          = hwId;
    data.installId     = installId;
    data.activatedDays = activatedDays;
    data.expiresAt     = expiresAt;
    writeActivationData(data);

    return { success: true, activatedDays, expiresAt };
  } catch (e) {
    console.error('[Activation] Error during activation:', e);
    return { success: false, error: 'حدث خطأ أثناء التفعيل' };
  }
}

// ─── توليد السيريال الدائم من كود الجهاز + كود التثبيت ──────────────────────
function generateSerial(hwId, installId) {
  const cleanHw      = hwId.replace(/-/g, '').toUpperCase();
  const cleanInstall = installId.replace(/-/g, '').toUpperCase();
  const combined     = cleanHw + cleanInstall;

  const hmac = crypto.createHmac('sha256', SECRET_KEY)
                     .update(combined)
                     .digest('hex')
                     .toUpperCase();

  const part = hmac.substring(0, 20);
  return `${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10,15)}-${part.slice(15,20)}`;
}

// ─── توليد السيريال المؤقت (hwId + installId + days) ────────────────────────
function generateTimedSerial(hwId, installId, days) {
  const cleanHw      = hwId.replace(/-/g, '').toUpperCase();
  const cleanInstall = installId.replace(/-/g, '').toUpperCase();
  const daysStr      = String(parseInt(days, 10)).padStart(5, '0');
  const combined     = cleanHw + cleanInstall + ':' + daysStr;

  const hmac = crypto.createHmac('sha256', SECRET_KEY)
                     .update(combined)
                     .digest('hex')
                     .toUpperCase();

  const part = hmac.substring(0, 20);
  return `${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10,15)}-${part.slice(15,20)}-${daysStr}`;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupActivationIpc(ipcMain, app) {
  setAppDataPath(app.getPath('userData'), app);
  ensureFirstRunRecorded();

  ipcMain.handle('activation:getStatus',    () => getActivationStatus());
  ipcMain.handle('activation:activate', (_, serial) => activateWithSerial(serial));
  ipcMain.handle('activation:getHwId',      () => getHardwareId());
  ipcMain.handle('activation:getInstallId', () => getInstallId());
}

module.exports = { setupActivationIpc, getActivationStatus, getHardwareId, getInstallId, generateSerial, generateTimedSerial };
