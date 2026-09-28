'use strict';

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db = null;
let appRef = null;

// ─── Current session state (per-process) ──────────────────────────────────────
let currentSession = {
  userId: null,
  employeeId: null,
  username: null,
  role: null,
  shiftId: null,
  loginSessionId: null
};

function getDb(app) {
  if (db) return db;
  appRef = app;

  const Database = require('better-sqlite3');
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'el-tarzy.db');

  db = new Database(dbPath, { verbose: null });
  
  // ─── Core & High-Performance Pragmas ───
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');     // Faster writes in WAL mode
  db.pragma('cache_size = -64000');      // 64MB Cache (negative = KB)
  db.pragma('temp_store = MEMORY');      // Use memory for temporary tables
  db.pragma('mmap_size = 300000000');    // Memory-mapped I/O (~300MB)

  initSchema();     // أولاً: أنشئ الجداول لو مش موجودة
  migrateSchema();  // ثانياً: طبّق الـ migrations (ALTER TABLE وغيرها)
  runSeed();

  // استعادة الشيفت المفتوح تلقائياً في الجلسة الحالية عند إعادة تشغيل البرنامج
  try {
    const activeShift = db.prepare("SELECT id FROM shifts WHERE status = 'مفتوح' ORDER BY id DESC LIMIT 1").get();
    if (activeShift) {
      currentSession.shiftId = activeShift.id;
      console.log(`[Shift] Restored active shift ID: ${activeShift.id}`);
    }
  } catch (e) {
    console.error('[Shift] Failed to restore active shift ID:', e);
  }

  return db;
}

function getDbPath() {
  if (!appRef) return null;
  return path.join(appRef.getPath('userData'), 'el-tarzy.db');
}

// ─── External Backup Path (حفظ مسار النسخ الخارجية) ─────────────────────────
function getExternalBackupSettingsPath() {
  if (!appRef) return null;
  return path.join(appRef.getPath('userData'), 'external-backup.json');
}

function getExternalBackupPath() {
  try {
    const p = getExternalBackupSettingsPath();
    if (!p || !fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.externalBackupDir || null;
  } catch {
    return null;
  }
}

function setExternalBackupPath(dir) {
  try {
    const p = getExternalBackupSettingsPath();
    if (!p) return { success: false, error: 'لم يتم تهيئة التطبيق' };
    fs.writeFileSync(p, JSON.stringify({ externalBackupDir: dir }), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function migrateSchema() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
  const row = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get();
  let currentVersion = row ? (row.v || 0) : 0;

  const runSafe = (sql) => {
    try { db.exec(sql); } catch (e) { /* ignore if already applied */ }
  };

  const migrations = [
    {
      version: 1,
      run: () => {
        runSafe("ALTER TABLE shifts ADD COLUMN status TEXT DEFAULT 'مفتوح'");
        runSafe("ALTER TABLE shifts ADD COLUMN user_id INTEGER REFERENCES users(id)");
        runSafe("ALTER TABLE shifts ADD COLUMN opening_cash REAL DEFAULT 0");
        runSafe("ALTER TABLE shifts ADD COLUMN expected_cash REAL");
        runSafe("ALTER TABLE shifts ADD COLUMN actual_cash_counted REAL");
        runSafe("ALTER TABLE shifts ADD COLUMN cash_difference REAL");
        runSafe("ALTER TABLE shifts ADD COLUMN vodafone_cash_expected REAL DEFAULT 0");
        runSafe("ALTER TABLE shifts ADD COLUMN vodafone_cash_actual REAL DEFAULT 0");
        runSafe("ALTER TABLE shifts ADD COLUMN total_returns REAL DEFAULT 0");
        runSafe("ALTER TABLE shifts ADD COLUMN invoice_count INTEGER DEFAULT 0");
        runSafe("ALTER TABLE shifts ADD COLUMN closed_by_user_id INTEGER REFERENCES users(id)");
      }
    },
    {
      version: 2,
      run: () => {
        runSafe("ALTER TABLE employees ADD COLUMN commission_percent REAL DEFAULT 0");
        runSafe("ALTER TABLE employees ADD COLUMN salary_type TEXT DEFAULT 'ثابت'");
        runSafe("ALTER TABLE employees ADD COLUMN monthly_leave_days INTEGER DEFAULT 2");
      }
    },
    {
      version: 3,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN receipt_notes TEXT");
        runSafe("ALTER TABLE company_settings ADD COLUMN show_tailor_name INTEGER DEFAULT 1");
        runSafe("ALTER TABLE company_settings ADD COLUMN show_customer_phone INTEGER DEFAULT 1");
        runSafe("ALTER TABLE company_settings ADD COLUMN logo_path TEXT");
        runSafe("ALTER TABLE company_settings ADD COLUMN prevent_cashier_price_edit INTEGER DEFAULT 0");
      }
    },
    {
      version: 4,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN cashier_hide_reports INTEGER DEFAULT 0");
        runSafe("ALTER TABLE company_settings ADD COLUMN cashier_hide_hr INTEGER DEFAULT 0");
        runSafe("ALTER TABLE company_settings ADD COLUMN cashier_prevent_returns INTEGER DEFAULT 0");
        runSafe("ALTER TABLE company_settings ADD COLUMN cashier_hide_finance INTEGER DEFAULT 0");
        runSafe("ALTER TABLE company_settings ADD COLUMN cashier_prevent_discount INTEGER DEFAULT 0");
        runSafe("ALTER TABLE company_settings ADD COLUMN cashier_prevent_settings INTEGER DEFAULT 0");
      }
    },
    {
      version: 5,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_phone1 TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_phone2 TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_tpl_invoice_confirm TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_tpl_order_ready TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_tpl_delivered TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_tpl_full_payment TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_tpl_partial_payment TEXT DEFAULT ''");
      }
    },
    {
      version: 6,
      run: () => {
        runSafe("ALTER TABLE invoices ADD COLUMN tailor_id INTEGER REFERENCES employees(id)");
        runSafe("ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'تحت الشغل'");
      }
    },
    {
      version: 7,
      run: () => {
        runSafe("ALTER TABLE returns ADD COLUMN shift_id INTEGER REFERENCES shifts(id)");
      }
    },
    {
      version: 8,
      run: () => {
        runSafe("DROP TABLE IF EXISTS shifts_old");
      }
    },
    {
      version: 9,
      run: () => {
        runSafe("UPDATE expenses SET payment_source = 'الخزينة' WHERE payment_source = 'خزينة'");
      }
    },
    {
      version: 10,
      run: () => {
        // High Performance Indexes
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoices_shift_id ON invoices(shift_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoices_employee_id ON invoices(employee_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_returns_shift_id ON returns(shift_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_attendance_shift_id ON attendance(shift_id)");
      }
    },
    {
      version: 11,
      run: () => {
        // جدول إعدادات مزوّد الواتساب — Multi-Provider Support
        runSafe(`
          CREATE TABLE IF NOT EXISTS whatsapp_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL DEFAULT 'web_js',
            wa_phone_number_id TEXT,
            wa_access_token TEXT,
            wa_business_account_id TEXT,
            wa_api_version TEXT DEFAULT 'v20.0',
            web_session_client_id TEXT DEFAULT 'el-tarzy-whatsapp',
            web_session_path TEXT,
            is_active INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // إدخال صف افتراضي بـ web_js للعملاء الحاليين (backward compatible)
        runSafe(`
          INSERT OR IGNORE INTO whatsapp_settings (id, provider, web_session_client_id)
          VALUES (1, 'web_js', 'el-tarzy-whatsapp')
        `);

        // جدول خريطة القوالب المنطقية → الأسماء الفعلية على Meta
        runSafe(`
          CREATE TABLE IF NOT EXISTS whatsapp_template_map (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            logical_key TEXT NOT NULL UNIQUE,
            actual_template_name TEXT NOT NULL,
            language_code TEXT DEFAULT 'ar'
          )
        `);
      }
    },
    {
      version: 12,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN admin_wa_phone TEXT DEFAULT ''");
      }
    },
    {
      version: 13,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN report_save_path TEXT DEFAULT ''");
      }
    },
    {
      version: 14,
      run: () => {
        runSafe("ALTER TABLE treasury ADD COLUMN shift_id INTEGER REFERENCES shifts(id)");
        runSafe("ALTER TABLE advances ADD COLUMN shift_id INTEGER REFERENCES shifts(id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_treasury_shift_id ON treasury(shift_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_advances_shift_id ON advances(shift_id)");
      }
    },
    {
      version: 15,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN day_cutoff_hour INTEGER DEFAULT 0");
      }
    },
    {
      version: 16,
      run: () => {
        runSafe("ALTER TABLE shifts ADD COLUMN instapay_cash_expected REAL DEFAULT 0");
        runSafe("ALTER TABLE shifts ADD COLUMN instapay_cash_actual REAL DEFAULT 0");
      }
    },
    {
      version: 17,
      run: () => {
        // إضافة إعداد عرض عنوان العميل على الفاتورة
        runSafe("ALTER TABLE company_settings ADD COLUMN show_customer_address INTEGER DEFAULT 0");
      }
    },
    {
      version: 18,
      run: () => {
        // إضافة حقل التوصيل على الفواتير
        runSafe("ALTER TABLE invoices ADD COLUMN is_delivery INTEGER DEFAULT 0");
      }
    },
    {
      version: 19,
      run: () => {
        // إضافة طريقة دفع السلف
        runSafe("ALTER TABLE advances ADD COLUMN payment_method TEXT DEFAULT 'الخزينة'");
      }
    },
    {
      version: 20,
      run: () => {
        // Express service (price x2) + driver on delivery invoices
        runSafe("ALTER TABLE invoices ADD COLUMN is_express INTEGER DEFAULT 0");
        runSafe("ALTER TABLE invoices ADD COLUMN driver_id INTEGER REFERENCES employees(id)");
        runSafe("ALTER TABLE invoices ADD COLUMN delivered_at DATETIME");
        // WhatsApp template for out-for-delivery
        runSafe("ALTER TABLE company_settings ADD COLUMN wa_tpl_out_for_delivery TEXT DEFAULT ''");
      }
    },
    {
      version: 21,
      run: () => {
        // Track out for delivery timestamp
        runSafe("ALTER TABLE invoices ADD COLUMN out_for_delivery_at DATETIME");
      }
    },
    {
      version: 22,
      run: () => {
        // Label printer: garment info per invoice
        runSafe("ALTER TABLE invoices ADD COLUMN pieces_count INTEGER DEFAULT 1");
        runSafe("ALTER TABLE invoices ADD COLUMN garment_type TEXT DEFAULT ''");
        runSafe("ALTER TABLE invoices ADD COLUMN has_iron_mark INTEGER DEFAULT 0");
        // Printer selection settings
        runSafe("ALTER TABLE company_settings ADD COLUMN invoice_printer TEXT DEFAULT ''");
        runSafe("ALTER TABLE company_settings ADD COLUMN label_printer TEXT DEFAULT ''");
      }
    },
    {
      version: 23,
      run: () => {
        runSafe("ALTER TABLE company_settings ADD COLUMN label_width INTEGER DEFAULT 38");
        runSafe("ALTER TABLE company_settings ADD COLUMN label_height INTEGER DEFAULT 35");
      }
    },
    {
      version: 24,
      run: () => {
        // Bag tracking: count per invoice
        runSafe("ALTER TABLE invoices ADD COLUMN bag_count INTEGER DEFAULT 0");
        // Individual bag records with QR codes and print tracking
        runSafe(`CREATE TABLE IF NOT EXISTS invoice_bags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id),
          bag_number INTEGER NOT NULL,
          qr_code TEXT NOT NULL UNIQUE,
          is_printed INTEGER DEFAULT 0,
          printed_at DATETIME,
          scanned_at DATETIME,
          created_at DATETIME DEFAULT (datetime('now'))
        )`);
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_bags_invoice ON invoice_bags(invoice_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_bags_qr ON invoice_bags(qr_code)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_bags_unprinted ON invoice_bags(is_printed) WHERE is_printed = 0");
        // Bag printer setting
        runSafe("ALTER TABLE company_settings ADD COLUMN bag_printer TEXT DEFAULT ''");
      }
    },
    {
      version: 25,
      run: () => {
        // Rebuild invoice_bags with ON DELETE CASCADE
        runSafe(`
          CREATE TABLE IF NOT EXISTS invoice_bags_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            bag_number INTEGER NOT NULL,
            qr_code TEXT NOT NULL UNIQUE,
            is_printed INTEGER DEFAULT 0,
            printed_at DATETIME,
            scanned_at DATETIME,
            created_at DATETIME DEFAULT (datetime('now'))
          )
        `);
        runSafe(`
          INSERT INTO invoice_bags_new (id, invoice_id, bag_number, qr_code, is_printed, printed_at, scanned_at, created_at)
          SELECT id, invoice_id, bag_number, qr_code, is_printed, printed_at, scanned_at, created_at FROM invoice_bags
        `);
        runSafe("DROP TABLE IF EXISTS invoice_bags");
        runSafe("ALTER TABLE invoice_bags_new RENAME TO invoice_bags");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_bags_invoice ON invoice_bags(invoice_id)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_bags_qr ON invoice_bags(qr_code)");
        runSafe("CREATE INDEX IF NOT EXISTS idx_invoice_bags_unprinted ON invoice_bags(is_printed) WHERE is_printed = 0");

        // Rebuild returns with ON DELETE CASCADE
        runSafe(`
          CREATE TABLE IF NOT EXISTS returns_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
            employee_id INTEGER REFERENCES employees(id),
            return_date TEXT DEFAULT (date('now')),
            total_returned REAL DEFAULT 0,
            notes TEXT,
            shift_id INTEGER REFERENCES shifts(id),
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
        runSafe(`
          INSERT INTO returns_new (id, original_invoice_id, employee_id, return_date, total_returned, notes, shift_id, created_at)
          SELECT id, original_invoice_id, employee_id, return_date, total_returned, notes, shift_id, created_at FROM returns
        `);
        runSafe("DROP TABLE IF EXISTS returns");
        runSafe("ALTER TABLE returns_new RENAME TO returns");
      }
    },
    {
      version: 26,
      description: 'Add notes column to customers table for customer details and Excel import',
      run: () => {
        runSafe("ALTER TABLE customers ADD COLUMN notes TEXT DEFAULT ''");
      }
    }
  ];

  for (const m of migrations) {
    if (m.version > currentVersion) {
      console.log(`[DB] Running migration v${m.version}...`);
      m.run();
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(m.version);
    }
  }
}

function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

function runSeed() {
  const { seedData } = require('./seed');
  seedData(db);
}

// ─── Role checking helper ─────────────────────────────────────────────────────
function requireAdmin() {
  if (currentSession.role === 'cashier') {
    throw new Error('ACCESS_DENIED: هذه العملية متاحة للمدير فقط');
  }
}

// ─── Audit log helper ─────────────────────────────────────────────────────────
function logAudit(action, tableName, recordId, oldValue, newValue) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_value, new_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(currentSession.userId, action, tableName, recordId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// ─── Generic query helpers ────────────────────────────────────────────────────
function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    return { success: true, data: stmt.all(...params) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function queryOne(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    return { success: true, data: stmt.get(...params) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function run(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { success: true, lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Invoice Number Generator ─────────────────────────────────────────────────
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  let row = db.prepare('SELECT * FROM invoice_sequence WHERE id = 1').get();

  if (!row) {
    db.prepare('INSERT INTO invoice_sequence (id, last_number, year) VALUES (1, 0, ?)').run(year);
    row = { last_number: 0, year: year };
  }

  let nextNum = row.year === year ? row.last_number : 0;
  let candidateStr = '';
  
  const checkStmt = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?');
  
  while (true) {
    nextNum++;
    candidateStr = `INV-${year}-${String(nextNum).padStart(4, '0')}`;
    const exists = checkStmt.get(candidateStr);
    if (!exists) {
      break;
    }
  }

  db.prepare('UPDATE invoice_sequence SET last_number = ?, year = ? WHERE id = 1').run(nextNum, year);
  return candidateStr;
}

function previewInvoiceNumber() {
  const year = new Date().getFullYear();
  let row = db.prepare('SELECT * FROM invoice_sequence WHERE id = 1').get();
  
  let nextNum = (row && row.year === year) ? row.last_number : 0;
  let candidateStr = '';
  
  const checkStmt = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?');
  
  while (true) {
    nextNum++;
    candidateStr = `INV-${year}-${String(nextNum).padStart(4, '0')}`;
    const exists = checkStmt.get(candidateStr);
    if (!exists) {
      return candidateStr;
    }
  }
}

// ─── Local Time Helper ───────────────────────────────────────────────────────
function getLocalISOString(d = new Date()) {
  const offset = d.getTimezoneOffset() * 60000;
  const localD = new Date(d.getTime() - offset);
  return localD.toISOString().replace('T', ' ').substring(0, 19);
}

// ─── Business Date (يراعي قلب اليوم / day_cutoff_hour) ─────────────────────
// لو الساعة الحالية أقل من ساعة القلب، نرجع تاريخ أمس (نفس اليوم التجاري السابق)
function getBusinessDate(d = new Date()) {
  const offset = d.getTimezoneOffset() * 60000;
  const localD = new Date(d.getTime() - offset);
  try {
    const settings = db.prepare('SELECT day_cutoff_hour FROM company_settings WHERE id = 1').get();
    const cutoffHour = (settings && settings.day_cutoff_hour) ? parseInt(settings.day_cutoff_hour, 10) : 0;
    if (cutoffHour > 0 && localD.getUTCHours() < cutoffHour) {
      // بعد منتصف الليل وقبل ساعة القلب → نحسبها على اليوم السابق
      localD.setUTCDate(localD.getUTCDate() - 1);
    }
  } catch (e) {
    // لو فشل الاستعلام، نرجع التاريخ الطبيعي بدون تعديل
  }
  return localD.toISOString().split('T')[0];
}

// ─── Treasury helpers ─────────────────────────────────────────────────────────
function getTreasuryBalance(treasuryType = 'الخزينة') {
  const row = db.prepare(
    `SELECT balance_after FROM treasury WHERE treasury_type = ? ORDER BY id DESC LIMIT 1`
  ).get(treasuryType);
  return row ? row.balance_after : 0;
}

function addTreasuryEntry(type, description, amount, treasuryType = 'الخزينة', shiftId = null) {
  const currentBalance = getTreasuryBalance(treasuryType);
  const newBalance = type === 'إيراد' ? currentBalance + amount : currentBalance - amount;
  
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const localD = new Date(d.getTime() - offset);
  const localDate = getBusinessDate(d);     // ← يراعي قلب اليوم
  const localTime = localD.toISOString().split('T')[1].substring(0, 8);

  const activeShiftId = shiftId || currentSession.shiftId || null;

  db.prepare(
    `INSERT INTO treasury (type, description, amount, balance_after, treasury_type, date, time, shift_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(type, description, amount, newBalance, treasuryType, localDate, localTime, activeShiftId);
  
  return newBalance;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function authenticateUser(username, password) {
  const user = db.prepare(`
    SELECT u.*, e.name as employee_name
    FROM users u
    LEFT JOIN employees e ON u.employee_id = e.id
    WHERE u.username = ? AND u.is_active = 1
  `).get(username);

  if (!user) {
    return { success: false, error: 'اسم المستخدم غير موجود' };
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return { success: false, error: 'كلمة المرور غير صحيحة' };
  }

  // Update last_login
  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

  // Create login session
  const session = db.prepare(`
    INSERT INTO login_sessions (user_id, login_time) VALUES (?, datetime('now'))
  `).run(user.id);

  // Update current session state
  currentSession = {
    userId: user.id,
    employeeId: user.employee_id,
    username: user.username,
    role: user.role,
    shiftId: null,
    loginSessionId: session.lastInsertRowid
  };

  // Check for open shift
  const openShift = db.prepare(`SELECT id FROM shifts WHERE user_id = ? AND status = 'مفتوح' ORDER BY id DESC LIMIT 1`).get(user.id);
  if (openShift) {
    currentSession.shiftId = openShift.id;
  }

  return {
    success: true,
    data: {
      userId: user.id,
      employeeId: user.employee_id,
      employeeName: user.employee_name || user.username,
      username: user.username,
      role: user.role,
      shiftId: currentSession.shiftId
    }
  };
}

function logoutUser() {
  if (currentSession.loginSessionId) {
    db.prepare(`UPDATE login_sessions SET logout_time = datetime('now') WHERE id = ?`)
      .run(currentSession.loginSessionId);
  }
  const prev = { ...currentSession };
  currentSession = { userId: null, employeeId: null, username: null, role: null, shiftId: null, loginSessionId: null };
  return { success: true, data: prev };
}

// ─── Shift helpers ────────────────────────────────────────────────────────────
function startShift(openingCash) {
  if (!currentSession.userId) {
    return { success: false, error: 'يجب تسجيل الدخول أولاً' };
  }

  // Check for existing open shift
  const existing = db.prepare(`SELECT id FROM shifts WHERE user_id = ? AND status = 'مفتوح'`).get(currentSession.userId);
  if (existing) {
    currentSession.shiftId = existing.id;
    return { success: true, data: { shiftId: existing.id, alreadyOpen: true } };
  }

  const startTime = getLocalISOString();

  const result = db.prepare(`
    INSERT INTO shifts (employee_id, user_id, opening_cash, status, start_time)
    VALUES (?, ?, ?, 'مفتوح', ?)
  `).run(currentSession.employeeId, currentSession.userId, openingCash || 0, startTime);

  currentSession.shiftId = result.lastInsertRowid;
  return { success: true, data: { shiftId: result.lastInsertRowid, alreadyOpen: false } };
}

function getShiftSummary(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) return { success: false, error: 'الشيفت غير موجود' };

  const shiftStartTimeStr = shift.start_time ? shift.start_time.substring(0, 19) : '';
  const shiftEndTimeStr = shift.end_time ? shift.end_time.substring(0, 19) : '';

  // Invoice count during this shift
  const invCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM invoices WHERE shift_id = ? OR (
      created_at >= ? AND (? = '' OR created_at <= ?)
    )
  `).get(shiftId, shiftStartTimeStr, shiftEndTimeStr, shiftEndTimeStr);

  // Fetch detailed treasury movements for this shift
  let treasuryDetails = [];
  try {
    if (shiftEndTimeStr) {
      treasuryDetails = db.prepare(`
        SELECT type, description, amount, treasury_type, time, date, shift_id
        FROM treasury
        WHERE shift_id = ? OR (
          (date || ' ' || time) >= ? AND (date || ' ' || time) <= ?
        )
        ORDER BY date ASC, time ASC, id ASC
      `).all(shiftId, shiftStartTimeStr, shiftEndTimeStr);
    } else if (shiftStartTimeStr) {
      treasuryDetails = db.prepare(`
        SELECT type, description, amount, treasury_type, time, date, shift_id
        FROM treasury
        WHERE shift_id = ? OR (
          (date || ' ' || time) >= ?
        )
        ORDER BY date ASC, time ASC, id ASC
      `).all(shiftId, shiftStartTimeStr);
    } else {
      treasuryDetails = db.prepare(`
        SELECT type, description, amount, treasury_type, time, date, shift_id
        FROM treasury
        WHERE shift_id = ?
        ORDER BY date ASC, time ASC, id ASC
      `).all(shiftId);
    }
  } catch (err) {
    console.error('Error fetching treasuryDetails:', err);
  }

  // حساب كروت ملخص الشيفت بناءً على حركات الخزينة الفعلية (الداخل والخارج)
  // لضمان تطابق المعادلة المعروضة: المتوقع = العهدة + مبيعات نقدي - مرتجعات - مصروفات - سلف
  let totalSalesCash = 0;
  let totalSalesVodafone = 0;
  let totalReturns = 0;   // مرتجعات نقدي
  let totalExpenses = 0;  // مصروفات نقدي
  let totalAdvances = 0;  // سلف ورواتب نقدي

  let expectedVodafone = 0;
  let totalReturnsVodafone = 0;
  let totalExpensesVodafone = 0;
  let totalAdvancesVodafone = 0;

  let expectedInstapay = 0;
  let totalSalesInstapay = 0;

  for (const t of treasuryDetails) {
    const isRevenue = t.type === 'إيراد';
    const desc = t.description || '';
    const isReturn = desc.includes('مرتجع') || desc.includes('إرجاع');
    const isAdvanceOrSalary = desc.includes('سلفة') || desc.includes('راتب');

    if (t.treasury_type === 'الخزينة') {
      if (isRevenue) {
        totalSalesCash += t.amount;
      } else {
        if (isReturn) {
          totalReturns += t.amount;
        } else if (isAdvanceOrSalary) {
          totalAdvances += t.amount;
        } else {
          totalExpenses += t.amount;
        }
      }
    } else if (t.treasury_type === 'فودافون كاش') {
      if (isRevenue) {
        totalSalesVodafone += t.amount;
      } else {
        if (isReturn) {
          totalReturnsVodafone += t.amount;
        } else if (isAdvanceOrSalary) {
          totalAdvancesVodafone += t.amount;
        } else {
          totalExpensesVodafone += t.amount;
        }
      }
    } else if (t.treasury_type === 'إنستا باي') {
      if (isRevenue) {
        totalSalesInstapay += t.amount;
      }
    }
  }

  const expectedCash = (shift.opening_cash || 0) + totalSalesCash - totalReturns - totalExpenses - totalAdvances;
  expectedVodafone = totalSalesVodafone - totalReturnsVodafone - totalExpensesVodafone - totalAdvancesVodafone;
  expectedInstapay = totalSalesInstapay;

  return {
    success: true,
    data: {
      shift,
      totalSalesCash,
      totalSalesVodafone,
      totalSales: totalSalesCash + totalSalesVodafone + totalSalesInstapay,
      totalReturns,
      totalExpenses,
      totalAdvances,
      expectedCash,
      expectedVodafone,
      expectedInstapay,
      invoiceCount: invCount.cnt || 0,
      treasuryDetails
    }
  };
}

function endShift(shiftId, actualCash, actualVodafone, actualInstapay, notes) {
  const summary = getShiftSummary(shiftId);
  if (!summary.success) return summary;

  const { expectedCash, expectedVodafone, expectedInstapay, totalSalesCash, totalSalesVodafone, totalSales, totalReturns, totalExpenses, invoiceCount } = summary.data;

  const cashDifference = (actualCash || 0) - expectedCash;
  const vodafoneDiff = (actualVodafone || 0) - expectedVodafone;
  const instapayDiff = (actualInstapay || 0) - (expectedInstapay || 0);
  const endTime = getLocalISOString();

  db.prepare(`
    UPDATE shifts SET
      end_time = ?,
      expected_cash = ?,
      actual_cash_counted = ?,
      cash_difference = ?,
      vodafone_cash_expected = ?,
      vodafone_cash_actual = ?,
      instapay_cash_expected = ?,
      instapay_cash_actual = ?,
      total_sales = ?,
      total_returns = ?,
      total_expenses = ?,
      invoice_count = ?,
      status = 'مغلق',
      notes = ?,
      closed_by_user_id = ?
    WHERE id = ?
  `).run(
    endTime,
    expectedCash, actualCash, cashDifference,
    expectedVodafone, actualVodafone || 0,
    expectedInstapay || 0, actualInstapay || 0,
    totalSales, totalReturns, totalExpenses,
    invoiceCount, notes || null,
    currentSession.userId, shiftId
  );

  currentSession.shiftId = null;
  return { success: true, data: { cashDifference, vodafoneDifference: vodafoneDiff, instapayDifference: instapayDiff } };
}

// ─── Truncate Invoices & Finance Functions (Called from Reports) ──────────────
function truncateInvoices() {
  try {
    const tx = db.transaction(() => {
      // With ON DELETE CASCADE (migration v25), deleting invoices cascades to:
      // invoice_bags, invoice_items, returns, return_items.
      // We also explicitly delete children as bulletproof safeguard:
      db.prepare('DELETE FROM return_items').run();
      db.prepare('DELETE FROM returns').run();
      db.prepare('DELETE FROM invoice_bags').run();
      db.prepare('DELETE FROM invoice_items').run();
      db.prepare('DELETE FROM invoices').run();
      db.prepare('DELETE FROM invoice_sequence').run();
      db.prepare("INSERT OR REPLACE INTO invoice_sequence (id, last_number, year) VALUES (1, 0, strftime('%Y', 'now'))").run();
    });
    tx();
    return { success: true };
  } catch (err) {
    console.error('Error in truncateInvoices:', err);
    return { success: false, error: err.message };
  }
}

function truncateFinance() {
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM expenses').run();
      db.prepare('DELETE FROM revenues').run();
      db.prepare('DELETE FROM salary_payments').run();
      db.prepare('DELETE FROM treasury').run();
      db.prepare(`INSERT INTO treasury (type, description, amount, balance_after, treasury_type) VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, 'الخزينة')`).run();
    });
    tx();
    return { success: true };
  } catch (err) {
    console.error('Error in truncateFinance:', err);
    return { success: false, error: err.message };
  }
}

function batchUpsertCustomers(customersList) {
  try {
    let created = 0;
    let updated = 0;
    const findStmt = db.prepare('SELECT id, name, address, notes FROM customers WHERE phone = ? LIMIT 1');
    const insertStmt = db.prepare('INSERT INTO customers (name, phone, address, opening_balance, current_balance, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const updateStmt = db.prepare('UPDATE customers SET name = ?, address = ?, notes = ? WHERE id = ?');

    const tx = db.transaction((list) => {
      for (const c of list) {
        const existing = findStmt.get(c.phone);
        if (existing) {
          const updateAddress = c.address || existing.address;
          const updateNotes = c.notes ? (existing.notes ? `${existing.notes} | ${c.notes}` : c.notes) : (existing.notes || '');
          updateStmt.run(c.name, updateAddress, updateNotes, existing.id);
          updated++;
        } else {
          insertStmt.run(c.name, c.phone, c.address, c.opening_balance || 0, c.current_balance || c.opening_balance || 0, c.notes || '');
          created++;
        }
      }
    });

    tx(customersList);
    return { success: true, created, updated };
  } catch (err) {
    console.error('Error in batchUpsertCustomers:', err);
    return { success: false, error: err.message };
  }
}

// ─── Selective Reset ──────────────────────────────────────────────────────────
// options: { keepCustomers, keepServices, keepEmployees, keepSettings }
function selectiveReset(options = {}) {
  try {
    requireAdmin();
    const { keepCustomers = false, keepServices = false, keepEmployees = false, keepSettings = false } = options;
    const errors = [];

    // ── تعطيل FK constraints أولاً لتجنب مشاكل الترابط بين الجداول ──────────
    db.pragma('foreign_keys = OFF');

    try {
      const resetTx = db.transaction(() => {
        const alwaysDelete = [
          'audit_log', 'login_sessions',
          'return_items', 'returns',
          'invoice_bags', 'invoice_items', 'invoices',
          'attendance', 'leaves', 'advances', 'deductions',
          'incentives', 'custody', 'salary_payments',
          'expenses', 'revenues', 'treasury',
          'purchase_items', 'purchases',
          'shifts', 'partners', 'suppliers', 'backups'
        ];

        for (const tbl of alwaysDelete) {
          try {
            db.prepare(`DELETE FROM ${tbl}`).run();
          } catch (e) {
            errors.push(`فشل مسح جدول ${tbl}: ${e.message}`);
          }
        }

        // إعادة تسلسل الفواتير
        try {
          db.prepare('DELETE FROM invoice_sequence').run();
          db.prepare("INSERT OR REPLACE INTO invoice_sequence (id, last_number, year) VALUES (1, 0, strftime('%Y', 'now'))").run();
        } catch (e) {
          errors.push(`فشل إعادة تسلسل الفواتير: ${e.message}`);
        }

        // ─── مسح العملاء ──────────────────────────────────────────────────────
        if (!keepCustomers) {
          try { db.prepare('DELETE FROM customers').run(); }
          catch (e) { errors.push(`فشل مسح العملاء: ${e.message}`); }
        }

        // ─── مسح الأصناف والخدمات ─────────────────────────────────────────────
        if (!keepServices) {
          try { db.prepare('DELETE FROM services').run(); }
          catch (e) { errors.push(`فشل مسح الخدمات: ${e.message}`); }
          try { db.prepare('DELETE FROM service_categories').run(); }
          catch (e) { errors.push(`فشل مسح الفئات: ${e.message}`); }
        }

        // ─── مسح الموظفين والمستخدمين ─────────────────────────────────────────
        if (!keepEmployees) {
          const currentUserId = currentSession.userId;
          try {
            if (currentUserId) {
              db.prepare('DELETE FROM users WHERE id != ?').run(currentUserId);
            } else {
              const adminUser = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
              if (adminUser) {
                db.prepare('DELETE FROM users WHERE id != ?').run(adminUser.id);
              }
            }
          } catch (e) { errors.push(`فشل مسح المستخدمين: ${e.message}`); }

          try {
            const adminEmpId = currentSession.employeeId;
            if (adminEmpId) {
              db.prepare('DELETE FROM employees WHERE id != ?').run(adminEmpId);
            } else {
              db.prepare('DELETE FROM employees').run();
            }
          } catch (e) { errors.push(`فشل مسح الموظفين: ${e.message}`); }
        }

        // ─── إعادة الإعدادات ──────────────────────────────────────────────────
        if (!keepSettings) {
          try {
            db.prepare(`UPDATE company_settings SET
              company_name='Dry Clean', address='', phone='', logo_path=NULL,
              tax_number='', receipt_footer='شكراً لزيارتكم', receipt_notes='',
              show_tailor_name=1, show_customer_phone=1, currency='جنيه',
              prevent_cashier_price_edit=0,
              cashier_hide_reports=0, cashier_hide_hr=0, cashier_prevent_returns=0,
              cashier_hide_finance=0, cashier_prevent_discount=0, cashier_prevent_settings=0,
              wa_phone1='', wa_phone2='',
              wa_tpl_invoice_confirm='', wa_tpl_order_ready='', wa_tpl_delivered='',
              wa_tpl_full_payment='', wa_tpl_partial_payment=''
              WHERE id=1`).run();
          } catch (e) { errors.push(`فشل إعادة الإعدادات: ${e.message}`); }
          try { db.prepare('DELETE FROM whatsapp_settings').run(); } catch (e) {}
          try { db.prepare('DELETE FROM whatsapp_template_map').run(); } catch (e) {}
        }
      });

      resetTx();
    } finally {
      // ── إعادة تفعيل FK constraints دائماً حتى لو حدث خطأ ─────────────────
      db.pragma('foreign_keys = ON');
    }

    if (errors.length > 0) {
      return { success: false, error: 'أخطاء أثناء المسح:\n' + errors.join('\n') };
    }
    return { success: true };

  } catch (err) {
    try { db.pragma('foreign_keys = ON'); } catch(e) {}
    return { success: false, error: err.message };
  }
}

// ─── Backup helpers ───────────────────────────────────────────────────────────
async function createBackup(backupType = 'يدوي', customDir = null) {
  const bType = typeof backupType === 'string' ? backupType : 'يدوي';
  const dbPath = getDbPath();
  if (!dbPath) return { success: false, error: 'لم يتم العثور على مسار قاعدة البيانات' };

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `backup_${dateStr}.db`;

  let backupDir;
  if (customDir) {
    backupDir = customDir;
  } else {
    backupDir = path.join(path.dirname(dbPath), 'backups');
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const destPath = path.join(backupDir, fileName);

  try {
    // Use better-sqlite3's backup API synchronously / awaited
    await db.backup(destPath);
    const stats = fs.statSync(destPath);
    const sizeKb = (stats.size / 1024).toFixed(2);

    db.prepare(`
      INSERT INTO backups (file_name, file_path, file_size_kb, backup_type)
      VALUES (?, ?, ?, ?)
    `).run(fileName, destPath, sizeKb, bType);

    copyBackupToExternal(destPath);

    return { success: true, data: { fileName, filePath: destPath } };
  } catch (err) {
    // Fallback: copy file directly
    try {
      fs.copyFileSync(dbPath, destPath);
      const stats = fs.statSync(destPath);
      const sizeKb = (stats.size / 1024).toFixed(2);

      db.prepare(`
        INSERT INTO backups (file_name, file_path, file_size_kb, backup_type)
        VALUES (?, ?, ?, ?)
      `).run(fileName, destPath, sizeKb, bType);

      copyBackupToExternal(destPath);

      return { success: true, data: { fileName, filePath: destPath } };
    } catch (copyErr) {
      return { success: false, error: copyErr.message };
    }
  }
}

// ─── Copy latest backup to external path ────────────────────────────────────
function copyBackupToExternal(srcFilePath) {
  try {
    const extDir = getExternalBackupPath();
    if (!extDir) return; // No external path configured
    if (!fs.existsSync(extDir)) {
      fs.mkdirSync(extDir, { recursive: true });
    }
    const destFile = path.join(extDir, path.basename(srcFilePath));
    fs.copyFileSync(srcFilePath, destFile);
    console.log('[Backup] Copied to external path:', destFile);
  } catch (err) {
    console.error('[Backup] Failed to copy to external path:', err.message);
  }
}

function listBackups() {
  try {
    const rows = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
    // Verify files still exist
    return {
      success: true,
      data: rows.map(r => ({
        ...r,
        exists: fs.existsSync(r.file_path)
      }))
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Daily Report ───────────────────────────────────────────────────────────────
function getDailyReport(date) {
  try {
    const dateLike = date + '%';

    // ── 1. Invoices created today ───────────────────────────────────────────────
    const invoices = db.prepare(`
      SELECT i.*, c.name as customer_name, d.name as driver_name,
             COALESCE(i.amount_paid,0) as paid,
             COALESCE(i.remaining,0) as remaining_amount
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN employees d ON i.driver_id = d.id
      WHERE i.invoice_date LIKE ?
    `).all(dateLike);

    // ── 2. Today's treasury movements on OLD invoices (تسديد/استلام اليوم لفواتير قديمة) ──
    // كل حركة خزينة اليوم نوعها "إيراد" ومرتبطة بفاتورة من تاريخ مختلف
    const todayTreasury = db.prepare(`SELECT * FROM treasury WHERE date LIKE ? AND type='إيراد' ORDER BY time ASC`).all(dateLike);
    
    // رابط الوصف بالفاتورة: نبحث عن فواتير مذكورة في الـ treasury اليوم لكنها ليست من اليوم
    const todayInvoiceNumbers = new Set(invoices.map(i => i.invoice_number));
    const todayPaymentsOnOldInvoices = [];
    
    for (const tr of todayTreasury) {
      // استخراج رقم الفاتورة من الوصف
      if (!tr.description) continue;
      const m = tr.description.match(/(?:فاتورة|invoice)\s*([\w-]+)/i);
      if (!m) continue;
      const invNum = m[1];
      // لو الفاتورة مش من تقرير اليوم — يعني فاتورة قديمة
      if (!todayInvoiceNumbers.has(invNum)) {
        // نجيب بيانات الفاتورة نفسها
        const oldInv = db.prepare(`
          SELECT i.*, c.name as customer_name, c.phone as customer_phone
          FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
          WHERE i.invoice_number = ?
        `).get(invNum);
        todayPaymentsOnOldInvoices.push({
          treasury_row: tr,
          invoice: oldInv || null,
          invoice_number: invNum
        });
      }
    }

    const expenses = db.prepare(`SELECT * FROM expenses WHERE date LIKE ?`).all(dateLike);

    const advances = db.prepare(`
      SELECT a.*, e.name as emp_name 
      FROM advances a 
      LEFT JOIN employees e ON a.employee_id = e.id 
      WHERE a.date LIKE ?
    `).all(dateLike);

    const attendance = db.prepare(`
      SELECT a.*, e.name as emp_name, e.salary_type 
      FROM attendance a 
      LEFT JOIN employees e ON a.employee_id = e.id 
      WHERE a.date LIKE ?
    `).all(dateLike);

    const returns = db.prepare(`
      SELECT r.*, i.invoice_number, c.name as customer_name
      FROM returns r
      LEFT JOIN invoices i ON r.original_invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE r.return_date LIKE ?
    `).all(dateLike);

    const treasury = db.prepare(`SELECT * FROM treasury WHERE date LIKE ? ORDER BY time ASC`).all(dateLike);

    const salaries = db.prepare(`
      SELECT s.*, e.name as emp_name
      FROM salary_payments s
      LEFT JOIN employees e ON s.employee_id = e.id
      WHERE s.paid_date LIKE ?
    `).all(dateLike);

    const revenues = (() => {
      try { return db.prepare(`SELECT * FROM revenues WHERE date LIKE ?`).all(dateLike); }
      catch(e) { return []; }
    })();

    // Summary totals
    // دفعات اليوم على فواتير قديمة تُحتسب ضمن الإيرادات
    const todayOldPaymentsTotal = todayPaymentsOnOldInvoices.reduce((s, p) => s + (p.treasury_row.amount || 0), 0);
    const invoicesPaid   = invoices.reduce((s, i) => s + (i.paid || 0), 0);
    const revenuesTotal  = revenues.reduce ? revenues.reduce((s, r) => s + (r.amount || 0), 0) : 0;
    const expensesTotal  = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const returnsTotal   = returns.reduce((s, r) => s + (r.total_returned || 0), 0);
    const advancesTotal  = advances.reduce((s, a) => s + (a.amount || 0), 0);
    const salariesTotal  = salaries.reduce((s, s2) => s + (s2.net_salary || 0), 0);

    const summary = {
      invoices_paid: invoicesPaid + todayOldPaymentsTotal,
      revenues: revenuesTotal,
      expenses: expensesTotal,
      returns: returnsTotal,
      advances: advancesTotal,
      salaries: salariesTotal
    };

    // Treasury daily net — بدون "البنك"
    const allTypes = ['الخزينة', 'فودافون كاش', 'إنستا باي'];
    const treasuryBalances = allTypes.map(t => {
      const row = db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date LIKE ? AND treasury_type = ?`
      ).get(dateLike, t);
      return { treasury_type: t, balance: row ? row.net : 0 };
    });

    return {
      success: true,
      data: { summary, treasuryBalances, invoices, expenses, advances, attendance, returns, treasury, salaries, revenues, todayPaymentsOnOldInvoices }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Bag Tracking helpers ─────────────────────────────────────────────────────
function setBagCount(invoiceId, bagCount) {
  const inv = db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return { success: false, error: 'الفاتورة غير موجودة' };

  const setBagTx = db.transaction(() => {
    // Remove any existing bags for this invoice (in case of re-count)
    db.prepare('DELETE FROM invoice_bags WHERE invoice_id = ?').run(invoiceId);
    // Update bag count on invoice
    db.prepare('UPDATE invoices SET bag_count = ? WHERE id = ?').run(bagCount, invoiceId);

    const bags = [];
    const insertStmt = db.prepare(`
      INSERT INTO invoice_bags (invoice_id, bag_number, qr_code)
      VALUES (?, ?, ?)
    `);

    // Extract year & sequence for pure numeric barcode
    let yr = '26';
    let seq = String(invoiceId).padStart(4, '0');
    const invMatch = (inv.invoice_number || '').match(/(\d{4})[^\d]*(\d+)/);
    if (invMatch) {
      yr = invMatch[1].slice(-2);
      seq = invMatch[2].padStart(4, '0');
    } else {
      const d = (inv.invoice_number || '').replace(/\D/g, '');
      if (d.length >= 4) {
        yr = d.slice(-4, -2) || '26';
        seq = d.slice(-4).padStart(4, '0');
      }
    }

    for (let i = 1; i <= bagCount; i++) {
      // توليد رقم عشوائي بالكامل ومستقل لكل كيس على حدة (مختلف تماماً وغير متسلسل إطلاقاً)
      let numBarcode;
      while (true) {
        numBarcode = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 أرقام عشوائية تماماً
        const exists = db.prepare('SELECT id FROM invoice_bags WHERE qr_code = ?').get(numBarcode);
        if (!exists) break;
      }
      const info = insertStmt.run(invoiceId, i, numBarcode);
      bags.push({ id: Number(info.lastInsertRowid), bagNumber: i, qrCode: numBarcode });
    }
    return bags;
  });

  try {
    const bags = setBagTx();
    return { success: true, data: { invoiceId, invoiceNumber: inv.invoice_number, bagCount, bags } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function normalizeScannerCode(raw) {
  if (!raw) return '';
  let code = String(raw).trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Shifted & unshifted Arabic keyboard mapping -> English QWERTY
  const map = {
    // Shifted Arabic keys (when Shift / CapsLock is active on Arabic layout)
    '÷': 'I', 'آ': 'N', '{': 'V', '}': 'V',
    'لآ': 'B', 'ِ': 'A', 'ٍ': 'S', 'لأ': 'G', 'أ': 'H', 'ـ': 'J', '،': 'K',
    '‘': 'Q', '”': 'W', 'ُ': 'E', 'إ': 'T',
    // Unshifted Arabic keys
    'ض':'Q','ص':'W','ث':'E','ق':'R','ف':'T','غ':'Y','ع':'U','ه':'I','خ':'O','ح':'P','ج':'[','د':']',
    'ش':'A','س':'S','ي':'D','ب':'F','ل':'G','ا':'H','ت':'J','ن':'K','م':'L','ك':';','ط':"'",
    'ئ':'Z','ء':'X','ؤ':'C','ر':'V','لا':'B','ى':'N','ة':'M','و':',','ز':'.','ظ':'/'
  };

  let out = '';
  for (let i = 0; i < code.length; i++) {
    const two = code.substr(i, 2);
    if (map[two]) {
      out += map[two];
      i++;
    } else if (map[code[i]]) {
      out += map[code[i]];
    } else {
      out += code[i];
    }
  }

  return out.toUpperCase().trim();
}

function confirmBagScan(qrCode) {
  try {
    const raw = String(qrCode || '').trim();
    if (!raw) return { success: false, error: 'الرمز المدخل فارغ' };

    const normalized = normalizeScannerCode(raw);

    // 1) المطابقة المباشرة للكود الخام أو الكود المعالج
    let bag = db.prepare('SELECT * FROM invoice_bags WHERE qr_code = ? OR UPPER(qr_code) = ?').get(raw, normalized);

    // 2) مطابقة الأرقام النقية المكونة من 10 أرقام (سنة + رقم فاتورة + رقم كيس: مثال 2026001502)
    if (!bag) {
      const m1 = normalized.match(/^(\d{4})[-]?(\d{4})[-]?(\d{2})$/);
      if (m1) {
        const seq = m1[2];
        const bgNum = parseInt(m1[3], 10);
        bag = db.prepare(`
          SELECT b.* FROM invoice_bags b
          JOIN invoices i ON b.invoice_id = i.id
          WHERE i.invoice_number LIKE ? AND b.bag_number = ?
        `).get(`%${seq}%`, bgNum);
      }
    }

    // 3) مطابقة الإدخال اليدوي المختصر السريع (رقم الفاتورة - رقم الكيس: مثال 15-2 أو 0015-2)
    if (!bag) {
      const m2 = normalized.match(/^(\d+)[-](\d+)$/);
      if (m2) {
        const seq = m2[1].padStart(4, '0');
        const bgNum = parseInt(m2[2], 10);
        bag = db.prepare(`
          SELECT b.* FROM invoice_bags b
          JOIN invoices i ON b.invoice_id = i.id
          WHERE (i.invoice_number LIKE ? OR i.id = ?) AND b.bag_number = ?
        `).get(`%${seq}%`, parseInt(m2[1], 10), bgNum);
      }
    }

    // 4) المطابقة مع تجاهل الفواصل والشرطات
    if (!bag) {
      const stripped = normalized.replace(/[-_\s]/g, '');
      bag = db.prepare(`
        SELECT * FROM invoice_bags
        WHERE REPLACE(REPLACE(REPLACE(UPPER(qr_code), '-', ''), '_', ''), ' ', '') = ?
      `).get(stripped);
    }

    // 5) لو أدخل رقم الفاتورة فقط وكانت الفاتورة تحتوي على كيس واحد فقط (مثال: 15 أو INV-2026-0015)
    if (!bag) {
      const invMatch = normalized.match(/(?:INV-)?(\d{4}-\d+|\d+)/i);
      if (invMatch) {
        const term = invMatch[1].padStart(4, '0');
        bag = db.prepare(`
          SELECT b.* FROM invoice_bags b
          JOIN invoices i ON b.invoice_id = i.id
          WHERE (i.invoice_number LIKE ? OR i.id = ?) AND i.bag_count = 1
        `).get(`%${term}%`, parseInt(invMatch[1], 10) || 0);
      }
    }

    if (!bag) {
      return {
        success: false,
        error: `رمز الباركود (${raw}) غير مسجل في أكياس النظام — يمكنك كتابة رقم الفاتورة والكيس يدوياً (مثال: 15-1)`
      };
    }

    if (bag.scanned_at) {
      // Already scanned — return info but flag it
      const inv = db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').get(bag.invoice_id);
      return { success: true, data: { alreadyScanned: true, invoiceId: bag.invoice_id, invoiceNumber: inv?.invoice_number, bagNumber: bag.bag_number } };
    }

    const now = getLocalISOString();
    db.prepare('UPDATE invoice_bags SET scanned_at = ? WHERE id = ?').run(now, bag.id);

    const inv = db.prepare('SELECT invoice_number, bag_count FROM invoices WHERE id = ?').get(bag.invoice_id);
    const scannedCount = db.prepare('SELECT COUNT(*) as cnt FROM invoice_bags WHERE invoice_id = ? AND scanned_at IS NOT NULL').get(bag.invoice_id).cnt;

    return {
      success: true,
      data: {
        alreadyScanned: false,
        invoiceId: bag.invoice_id,
        invoiceNumber: inv?.invoice_number,
        bagNumber: bag.bag_number,
        totalBags: inv?.bag_count || 0,
        scannedCount
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getInvoiceBags(invoiceId) {
  try {
    const bags = db.prepare('SELECT * FROM invoice_bags WHERE invoice_id = ? ORDER BY bag_number').all(invoiceId);
    return { success: true, data: bags };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getUnprintedBags() {
  try {
    const bags = db.prepare(`
      SELECT b.id, b.invoice_id, b.bag_number, b.qr_code, b.created_at,
             i.invoice_number, i.bag_count, i.pieces_count, i.garment_type, i.is_delivery, i.is_express,
             c.name as customer_name
      FROM invoice_bags b
      JOIN invoices i ON b.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE b.is_printed = 0
      ORDER BY b.invoice_id ASC, b.bag_number ASC
    `).all();
    return { success: true, data: bags };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function markBagsPrinted(bagIds = []) {
  try {
    if (!bagIds || bagIds.length === 0) return { success: true, count: 0 };
    const now = getLocalISOString();
    const placeholders = bagIds.map(() => '?').join(',');
    const info = db.prepare(`
      UPDATE invoice_bags
      SET is_printed = 1, printed_at = ?
      WHERE id IN (${placeholders})
    `).run(now, ...bagIds);
    return { success: true, count: info.changes };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function markInvoiceBagsPrinted(invoiceId) {
  try {
    if (!invoiceId) return { success: true, count: 0 };
    const now = getLocalISOString();
    const info = db.prepare(`
      UPDATE invoice_bags
      SET is_printed = 1, printed_at = ?
      WHERE invoice_id = ?
    `).run(now, invoiceId);
    return { success: true, count: info.changes };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── IPC Handler Map ──────────────────────────────────────────────────────────
function setupIpcHandlers(ipcMain, app) {
  getDb(app);

  // ─── Auth ─────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', (_, username, password) => {
    try {
      const { getActivationStatus } = require('../activation');
      const act = getActivationStatus();
      if (!act.activated) {
        return { success: false, error: 'النظام غير مفعّل. يرجى تفعيل البرنامج أولاً للاستخدام.' };
      }
      return authenticateUser(username, password);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:logout', () => {
    try {
      return logoutUser();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:getSession', () => {
    if (!currentSession.userId) {
      return { success: false, error: 'غير مسجل دخول' };
    }
    // Fetch employee name
    let employeeName = currentSession.username;
    if (currentSession.employeeId) {
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(currentSession.employeeId);
      if (emp) employeeName = emp.name;
    }
    return {
      success: true,
      data: {
        ...currentSession,
        employeeName
      }
    };
  });

  // ─── Shift ────────────────────────────────────────────────────────────────
  ipcMain.handle('shift:start', (_, openingCash) => {
    try {
      return startShift(openingCash);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('shift:end', (_, shiftId, actualCash, actualVodafone, actualInstapay, notes) => {
    try {
      return endShift(shiftId, actualCash, actualVodafone, actualInstapay, notes);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('shift:getSummary', (_, shiftId) => {
    try {
      return getShiftSummary(shiftId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('shift:getCurrent', () => {
    if (!currentSession.shiftId) {
      return { success: false, error: 'لا يوجد شيفت مفتوح' };
    }
    return getShiftSummary(currentSession.shiftId);
  });

  // ─── Generic query ────────────────────────────────────────────────────────
  ipcMain.handle('db:query', (_, sql, params) => query(sql, params || []));
  ipcMain.handle('db:queryOne', (_, sql, params) => queryOne(sql, params || []));
  ipcMain.handle('db:run', (_, sql, params) => {
    const sqlLower = (sql || '').toLowerCase().trim();

    // ─── Cashier restrictions ──────────────────────────────────────────────
    if (currentSession.role === 'cashier') {
      // Block destructive operations
      if (sqlLower.startsWith('delete') || sqlLower.startsWith('drop') || sqlLower.startsWith('alter')) {
        return { success: false, error: 'ACCESS_DENIED: هذه العملية متاحة للمدير فقط' };
      }
      // Block price edits
      if (sqlLower.includes('update services') && sqlLower.includes('sell_price')) {
        return { success: false, error: 'ACCESS_DENIED: لا يمكنك تعديل الأسعار' };
      }
      // Block salary/settings/user table modifications
      const protectedTables = ['salary_payments', 'company_settings', 'users', 'audit_log'];
      for (const t of protectedTables) {
        if ((sqlLower.startsWith('insert') || sqlLower.startsWith('update')) && sqlLower.includes(t)) {
          return { success: false, error: 'ACCESS_DENIED: هذه العملية متاحة للمدير فقط' };
        }
      }
    }

    // ─── Audit logging for write operations ────────────────────────────────
    if (sqlLower.startsWith('insert') || sqlLower.startsWith('update') || sqlLower.startsWith('delete')) {
      try {
        logAudit('db:run', 'raw_sql', null, null, { sql: sql.substring(0, 200) });
      } catch (e) { /* ignore audit errors */ }
    }

    return run(sql, params || []);
  });

  // ─── Invoice number ───────────────────────────────────────────────────────
  ipcMain.handle('db:previewInvoiceNumber', () => {
    try {
      return { success: true, data: previewInvoiceNumber() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Treasury ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:getTreasuryBalance', (_, treasuryType) => {
    try {
      return { success: true, data: getTreasuryBalance(treasuryType) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:addTreasuryEntry', (_, type, description, amount, treasuryType) => {
    try {
      const balance = addTreasuryEntry(type, description, amount, treasuryType);
      return { success: true, data: balance };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Factory Reset ────────────────────────────────────────────────────────
  ipcMain.handle('app:factoryReset', () => {
    try {
      requireAdmin();
      const dbPath = getDbPath();
      db.close();
      
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
      
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  // ─── Save full invoice (transaction) ──────────────────────────────────────
  ipcMain.handle('db:saveInvoice', (_, invoiceData, items) => {
    try {
      const saveInvoiceTx = db.transaction(() => {
        let invNum;
        if (invoiceData.invoiceNumber) {
          // Check if this number already exists in DB
          const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceData.invoiceNumber);
          if (existing) {
            // Already used → generate fresh number
            invNum = generateInvoiceNumber();
          } else {
            // Not used → use it as-is (don't increment counter again)
            invNum = invoiceData.invoiceNumber;
          }
        } else {
          invNum = generateInvoiceNumber();
        }
        // ── تحديد payment_method الصحيح من treasury_type ──────────────────────
        // الأولوية: لو payment_method مرسل وقيمته صحيحة نستخدمه
        // وإلا نشتق من treasury_type
        let resolvedPaymentMethod;
        const isDeferred = (invoiceData.remaining || 0) > 0 && (invoiceData.amount_paid || 0) === 0;
        const treasuryTyp = invoiceData.treasury_type || 'الخزينة';
        if (isDeferred) {
          resolvedPaymentMethod = 'آجل';
        } else if (treasuryTyp === 'فودافون كاش') {
          resolvedPaymentMethod = 'فودافون كاش';
        } else if (treasuryTyp === 'إنستا باي') {
          resolvedPaymentMethod = 'إنستا باي';
        } else {
          resolvedPaymentMethod = 'نقدي';
        }

        // ── تحديد حالة الفاتورة ────────────────────────────────────────────────
        const invoiceStatus = invoiceData.status || 'تحت الشغل';

        const invStmt = db.prepare(`
          INSERT INTO invoices (invoice_number, customer_id, employee_id, tailor_id, invoice_date,
            payment_method, invoice_type, treasury_type, subtotal, discount_percent,
            discount_amount, net_total, amount_paid, remaining, notes, shift_id, status, is_delivery,
            is_express, driver_id, pieces_count, garment_type, has_iron_mark)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const invInfo = invStmt.run(
          invNum,
          invoiceData.customer_id || null,
          invoiceData.employee_id || null,
          null, // tailor_id removed
          invoiceData.invoice_date || getBusinessDate(),
          resolvedPaymentMethod,
          invoiceData.invoice_type || null,
          treasuryTyp,
          invoiceData.subtotal || 0,
          invoiceData.discount_percent || 0,
          invoiceData.discount_amount || 0,
          invoiceData.net_total || 0,
          invoiceData.amount_paid || 0,
          invoiceData.remaining || 0,
          invoiceData.notes || null,
          currentSession.shiftId || invoiceData.shift_id || null,
          invoiceStatus,
          invoiceData.is_delivery ? 1 : 0,
          invoiceData.is_express ? 1 : 0,
          invoiceData.driver_id || null,
          invoiceData.pieces_count || 1,
          invoiceData.garment_type || '',
          invoiceData.has_iron_mark ? 1 : 0
        );
        const invoiceId = invInfo.lastInsertRowid;

        const itemStmt = db.prepare(`
          INSERT INTO invoice_items (invoice_id, service_id, category_name, service_name,
            barcode, sell_price, quantity, item_discount, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          itemStmt.run(
            invoiceId,
            item.service_id || null,
            item.category_name || '',
            item.service_name || '',
            item.barcode || null,
            item.sell_price || 0,
            item.quantity || 1,
            item.item_discount || 0,
            item.total || 0
          );
        }

        // Update customer balance if credit (آجل)
        if (invoiceData.customer_id && resolvedPaymentMethod === 'آجل') {
          db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`)
            .run(invoiceData.remaining || 0, invoiceData.customer_id);
        }

        // Add treasury entry for cash payment
        if ((invoiceData.amount_paid || 0) > 0) {
          addTreasuryEntry('إيراد', `فاتورة رقم ${invNum}`,
            invoiceData.amount_paid, treasuryTyp);
        }

        return { invoiceId, invoiceNumber: invNum };
      });

      const result = saveInvoiceTx();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Save return (transaction) ────────────────────────────────────────────
  ipcMain.handle('db:saveReturn', (_, returnData, returnItems) => {
    try {
      const saveReturnTx = db.transaction(() => {
        const retStmt = db.prepare(`
          INSERT INTO returns (original_invoice_id, employee_id, return_date, total_returned, notes, shift_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const retInfo = retStmt.run(
          returnData.original_invoice_id,
          returnData.employee_id || currentSession.employeeId || null,
          getBusinessDate(),
          returnData.total_returned || 0,
          returnData.notes || null,
          currentSession.shiftId || null
        );
        const returnId = retInfo.lastInsertRowid;

        // Calculate return ratio from original invoice to ensure accuracy
        const invStmt = db.prepare(`SELECT subtotal, net_total, remaining, amount_paid, treasury_type FROM invoices WHERE id = ?`);
        const invInfo = invStmt.get(returnData.original_invoice_id);
        if (!invInfo) throw new Error('Original invoice not found');

        let ratio = 1;
        if (invInfo.subtotal > 0) {
          ratio = invInfo.net_total / invInfo.subtotal;
        }

        let calculatedTotalReturned = 0;

        const itemStmt = db.prepare(`
          INSERT INTO return_items (return_id, invoice_item_id, product_name, quantity_returned,
            price_before_discount, item_discount, price_after_discount, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of returnItems) {
          // Calculate item total using ratio
          const unitPrice = item.price_before_discount - (item.item_discount || 0);
          const itemTotal = (unitPrice * item.quantity_returned) * ratio;
          calculatedTotalReturned += itemTotal;

          itemStmt.run(
            returnId,
            item.invoice_item_id || null,
            item.product_name || '',
            item.quantity_returned || 1,
            item.price_before_discount || 0,
            item.item_discount || 0,
            unitPrice,
            itemTotal
          );
        }

        // Update total_returned in returns table
        db.prepare('UPDATE returns SET total_returned = ? WHERE id = ?').run(calculatedTotalReturned, returnId);

        // Update original invoice's remaining and is_returned flag only
        const remainingDebt = invInfo ? (invInfo.remaining || 0) : 0;
        const originalTreasury = invInfo ? (invInfo.treasury_type || 'الخزينة') : 'الخزينة';
        
        let cashRefund = calculatedTotalReturned;
        let newRemaining = remainingDebt;
        
        if (remainingDebt > 0) {
          cashRefund = Math.max(0, calculatedTotalReturned - remainingDebt);
          newRemaining = Math.max(0, remainingDebt - calculatedTotalReturned);
        }

        const qtyCheck = db.prepare(`
          SELECT 
            (SELECT SUM(quantity) FROM invoice_items WHERE invoice_id = ?) as total_orig,
            (SELECT SUM(ri.quantity_returned) 
             FROM return_items ri 
             JOIN returns r ON ri.return_id = r.id 
             WHERE r.original_invoice_id = ?) as total_ret
        `).get(returnData.original_invoice_id, returnData.original_invoice_id);
        
        const isFullyReturned = (qtyCheck.total_orig > 0 && qtyCheck.total_orig <= qtyCheck.total_ret) ? 1 : 0;

        db.prepare(`UPDATE invoices SET is_returned = ?, remaining = ? WHERE id = ?`)
          .run(isFullyReturned, newRemaining, returnData.original_invoice_id);

        // Refund to treasury ONLY for cash refund
        // Use user-selected treasury_type if provided, otherwise fall back to original invoice treasury
        const refundTreasury = returnData.treasury_type || originalTreasury;
        if (cashRefund > 0) {
          addTreasuryEntry('مصروف', `مرتجع نقدي لفاتورة رقم ${returnData.original_invoice_id}`,
            cashRefund, refundTreasury);
        }

        return returnId;
      });

      const result = saveReturnTx();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Pay Invoice Remaining ────────────────────────────────────────────────
  ipcMain.handle('db:payInvoiceRemaining', (_, invoiceId, amount, safeType) => {
    try {
      const payTx = db.transaction(() => {
        db.prepare(`
          UPDATE invoices
          SET amount_paid = amount_paid + ?, remaining = MAX(0, remaining - ?)
          WHERE id = ?
        `).run(amount, amount, invoiceId);

        const inv = db.prepare('SELECT invoice_number, customer_id, remaining FROM invoices WHERE id = ?').get(invoiceId);

        addTreasuryEntry('إيراد', `سداد مديونية فاتورة ${inv.invoice_number}`, amount, safeType || 'الخزينة');

        if (inv.customer_id) {
          db.prepare('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?').run(amount, inv.customer_id);
        }

        return true;
      });
      payTx();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Reverse Payment (Admin) ────────────────────────────────────────────────
  ipcMain.handle('db:reversePayment', (_, invoiceId, amountToReverse) => {
    try {
      requireAdmin();
      const reverseTx = db.transaction(() => {
        const inv = db.prepare('SELECT invoice_number, customer_id, remaining, amount_paid, treasury_type FROM invoices WHERE id = ?').get(invoiceId);
        if (!inv) throw new Error('الفاتورة غير موجودة');

        const newPaid = Math.max(0, inv.amount_paid - amountToReverse);
        const newRemaining = inv.remaining + amountToReverse;

        db.prepare(`
          UPDATE invoices
          SET amount_paid = ?, remaining = ?
          WHERE id = ?
        `).run(newPaid, newRemaining, invoiceId);

        addTreasuryEntry('مصروف', `إرجاع تسديد خاطئ لفاتورة ${inv.invoice_number}`, amountToReverse, inv.treasury_type || 'الخزينة');

        if (inv.customer_id) {
          db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(amountToReverse, inv.customer_id);
        }

        return true;
      });
      reverseTx();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Update Invoice Status ──────────────────────────────────────────────────
  ipcMain.handle('db:updateInvoiceStatus', (_, invoiceId, status, driverId = null) => {
    try {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localNow = new Date(now.getTime() - offset).toISOString().slice(0, 19);

      if (status === 'تم التسليم') {
        db.prepare('UPDATE invoices SET status = ?, delivered_at = ? WHERE id = ?').run(status, localNow, invoiceId);
      } else if (status === 'خرج للتوصيل') {
        if (driverId) {
          db.prepare('UPDATE invoices SET status = ?, is_delivery = 1, driver_id = ?, out_for_delivery_at = ? WHERE id = ?').run(status, driverId, localNow, invoiceId);
        } else {
          db.prepare('UPDATE invoices SET status = ?, is_delivery = 1, out_for_delivery_at = ? WHERE id = ?').run(status, localNow, invoiceId);
        }
      } else {
        db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invoiceId);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Bag Tracking ───────────────────────────────────────────────────────────
  ipcMain.handle('db:setBagCount', (_, invoiceId, bagCount) => {
    return setBagCount(invoiceId, bagCount);
  });

  ipcMain.handle('db:confirmBagScan', (_, qrCode) => {
    return confirmBagScan(qrCode);
  });

  ipcMain.handle('db:getInvoiceBags', (_, invoiceId) => {
    return getInvoiceBags(invoiceId);
  });

  ipcMain.handle('db:getUnprintedBags', () => {
    return getUnprintedBags();
  });

  ipcMain.handle('db:markBagsPrinted', (_, bagIds) => {
    return markBagsPrinted(bagIds);
  });

  // ─── Salary payment (transaction) ─────────────────────────────────────────
  ipcMain.handle('db:paySalary', (_, salaryData) => {
    try {
      requireAdmin();
      const payTx = db.transaction(() => {
        const stmt = db.prepare(`
          INSERT INTO salary_payments (employee_id, month, gross_salary, total_advances,
            deductions, incentives, net_salary, paid_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          salaryData.employee_id,
          salaryData.month,
          salaryData.gross_salary,
          salaryData.total_advances || 0,
          salaryData.deductions || 0,
          salaryData.incentives || 0,
          salaryData.net_salary,
          currentSession.employeeId || salaryData.paid_by || null
        );

        // Mark advances for this month as paid
        db.prepare(`
          UPDATE advances 
          SET paid_back = 1 
          WHERE employee_id = ? AND strftime('%Y-%m', date) = ? AND paid_back = 0
        `).run(salaryData.employee_id, salaryData.month);

        // دعم تقسيم الصرف بين خزنتين
        const cashAmount = salaryData.cash_amount || 0;
        const vodafoneAmount = salaryData.vodafone_amount || 0;

        if (cashAmount > 0) {
          addTreasuryEntry('مصروف', `راتب موظف - ${salaryData.month}`, cashAmount, 'الخزينة');
        }
        if (vodafoneAmount > 0) {
          addTreasuryEntry('مصروف', `راتب موظف - ${salaryData.month}`, vodafoneAmount, 'فودافون كاش');
        }
        // fallback لو مفيش تقسيم
        if (cashAmount === 0 && vodafoneAmount === 0) {
          addTreasuryEntry('مصروف', `راتب موظف - ${salaryData.month}`, salaryData.net_salary, salaryData.treasury_type || 'الخزينة');
        }

        logAudit('pay_salary', 'salary_payments', info.lastInsertRowid, null, salaryData);

        return info.lastInsertRowid;
      });

      const result = payTx();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Reverse Salary payment (transaction) ─────────────────────────────────
  ipcMain.handle('db:reverseSalaryPayment', (_, employeeId, month) => {
    try {
      requireAdmin();
      const reverseTx = db.transaction(() => {
        const payments = db.prepare('SELECT * FROM salary_payments WHERE employee_id = ? AND month = ?').all(employeeId, month);
        if (!payments || payments.length === 0) {
          throw new Error('لا يوجد صرف راتب مسجل لهذا الموظف في هذا الشهر');
        }

        for (const p of payments) {
          // Look up audit log to find exact cash/vodafone split
          const audit = db.prepare(`SELECT new_value FROM audit_log WHERE action = 'pay_salary' AND table_name = 'salary_payments' AND record_id = ?`).get(p.id);
          let cashAmount = 0;
          let vodafoneAmount = 0;
          let fallbackNet = p.net_salary;
          let hasAudit = false;

          if (audit && audit.new_value) {
            try {
              const salaryData = JSON.parse(audit.new_value);
              cashAmount = salaryData.cash_amount || 0;
              vodafoneAmount = salaryData.vodafone_amount || 0;
              hasAudit = true;
            } catch (e) {}
          }

          if (hasAudit && (cashAmount > 0 || vodafoneAmount > 0)) {
            if (cashAmount > 0) addTreasuryEntry('إيراد', `إلغاء صرف راتب موظف - ${month}`, cashAmount, 'الخزينة');
            if (vodafoneAmount > 0) addTreasuryEntry('إيراد', `إلغاء صرف راتب موظف - ${month}`, vodafoneAmount, 'فودافون كاش');
          } else {
            // Fallback if no specific split recorded
            addTreasuryEntry('إيراد', `إلغاء صرف راتب موظف - ${month}`, fallbackNet, 'الخزينة');
          }

          // Revert advances
          db.prepare(`
            UPDATE advances 
            SET paid_back = 0 
            WHERE employee_id = ? AND strftime('%Y-%m', date) = ? AND paid_back = 1
          `).run(employeeId, month);

          // Delete the payment record
          db.prepare('DELETE FROM salary_payments WHERE id = ?').run(p.id);
          logAudit('reverse_salary', 'salary_payments', p.id, p, null);
        }
        return true;
      });

      reverseTx();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Company settings ─────────────────────────────────────────────────────
  ipcMain.handle('db:getSettings', () => {
    try {
      const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
      return { success: true, data: settings };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:updateSettings', (_, data) => {
    try {
      try { db.exec("ALTER TABLE company_settings ADD COLUMN label_width INTEGER DEFAULT 38"); } catch (_) {}
      try { db.exec("ALTER TABLE company_settings ADD COLUMN label_height INTEGER DEFAULT 35"); } catch (_) {}
      db.prepare(`
        UPDATE company_settings SET
          company_name = ?, address = ?, phone = ?, logo_path = ?,
          tax_number = ?, receipt_footer = ?, receipt_notes = ?,
          show_tailor_name = ?, show_customer_phone = ?, currency = ?,
          prevent_cashier_price_edit = ?,
          cashier_hide_reports = ?, cashier_hide_hr = ?, cashier_prevent_returns = ?,
          cashier_hide_finance = ?, cashier_prevent_discount = ?, cashier_prevent_settings = ?,
          wa_phone1 = ?, wa_phone2 = ?,
          wa_tpl_invoice_confirm = ?, wa_tpl_order_ready = ?, wa_tpl_delivered = ?,
          wa_tpl_full_payment = ?, wa_tpl_partial_payment = ?,
          admin_wa_phone = ?,
          report_save_path = ?,
          day_cutoff_hour = ?,
          show_customer_address = ?,
          wa_tpl_out_for_delivery = ?,
          invoice_printer = ?,
          label_printer = ?,
          label_width = ?,
          label_height = ?,
          bag_printer = ?
        WHERE id = 1
      `).run(
        data.company_name, data.address, data.phone, data.logo_path || null,
        data.tax_number, data.receipt_footer, data.receipt_notes || '',
        data.show_tailor_name ? 1 : 0, data.show_customer_phone ? 1 : 0,
        data.currency || 'جنيه',
        data.prevent_cashier_price_edit ? 1 : 0,
        data.cashier_hide_reports ? 1 : 0,
        data.cashier_hide_hr ? 1 : 0,
        data.cashier_prevent_returns ? 1 : 0,
        data.cashier_hide_finance ? 1 : 0,
        data.cashier_prevent_discount ? 1 : 0,
        data.cashier_prevent_settings ? 1 : 0,
        data.wa_phone1 || '',
        data.wa_phone2 || '',
        data.wa_tpl_invoice_confirm || '',
        data.wa_tpl_order_ready || '',
        data.wa_tpl_delivered || '',
        data.wa_tpl_full_payment || '',
        data.wa_tpl_partial_payment || '',
        data.admin_wa_phone || '',
        data.report_save_path || '',
        parseInt(data.day_cutoff_hour || 0, 10),
        data.show_customer_address ? 1 : 0,
        data.wa_tpl_out_for_delivery || '',
        data.invoice_printer || '',
        data.label_printer || '',
        parseInt(data.label_width, 10) || 38,
        parseInt(data.label_height, 10) || 35,
        data.bag_printer || ''
      );
      logAudit('update_settings', 'company_settings', 1, null, data);
      return { success: true };
    } catch (err) {
      console.error('[DB] updateSettings error:', err);
      return { success: false, error: err.message };
    }
  });

  // ─── User management (admin only) ─────────────────────────────────────────
  ipcMain.handle('users:list', () => {
    try {
      requireAdmin();
      const users = db.prepare(`
        SELECT u.id, u.employee_id, u.username, u.role, u.is_active, u.last_login, u.created_at,
               e.name as employee_name
        FROM users u
        LEFT JOIN employees e ON u.employee_id = e.id
        ORDER BY u.id
      `).all();
      return { success: true, data: users };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('users:create', (_, userData) => {
    try {
      requireAdmin();
      const hash = bcrypt.hashSync(userData.password, 10);
      const result = db.prepare(`
        INSERT INTO users (employee_id, username, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(userData.employee_id || null, userData.username, hash, userData.role || 'cashier');
      logAudit('create_user', 'users', result.lastInsertRowid, null, { username: userData.username, role: userData.role });
      return { success: true, data: result.lastInsertRowid };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('users:toggleActive', (_, userId) => {
    try {
      requireAdmin();
      const user = db.prepare('SELECT is_active, username FROM users WHERE id = ?').get(userId);
      if (!user) return { success: false, error: 'المستخدم غير موجود' };
      const newStatus = user.is_active ? 0 : 1;
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, userId);
      logAudit('toggle_user', 'users', userId, { is_active: user.is_active }, { is_active: newStatus });
      return { success: true, data: newStatus };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('users:resetPassword', (_, userId, newPassword) => {
    try {
      requireAdmin();
      const hash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
      logAudit('reset_password', 'users', userId, null, null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Backup ───────────────────────────────────────────────────────────────
  ipcMain.handle('backup:create', async (_, backupType) => {
    try {
      const result = await createBackup(backupType || 'يدوي');
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backup:getExternalPath', () => {
    return { success: true, data: getExternalBackupPath() };
  });

  ipcMain.handle('backup:setExternalPath', (_, dir) => {
    return setExternalBackupPath(dir);
  });

  ipcMain.handle('backup:clearExternalPath', () => {
    return setExternalBackupPath(null);
  });

  ipcMain.handle('backup:list', () => {
    try {
      return listBackups();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restore', (_, filePath) => {
    try {
      requireAdmin();
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'ملف النسخة الاحتياطية غير موجود' };
      }
      // Create safety backup first
      createBackup('تلقائي قبل الاسترجاع');

      const dbPath = getDbPath();
      // Close current db
      db.close();
      db = null;

      // Copy backup over current db
      fs.copyFileSync(filePath, dbPath);

      return { success: true, data: { requiresRestart: true } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Logo file copy ───────────────────────────────────────────────────────
  ipcMain.handle('settings:copyLogo', (_, sourcePath) => {
    try {
      const logoDir = path.join(appRef.getPath('userData'), 'assets', 'logo');
      if (!fs.existsSync(logoDir)) {
        fs.mkdirSync(logoDir, { recursive: true });
      }
      const ext = path.extname(sourcePath);
      const destPath = path.join(logoDir, `shop_logo${ext}`);
      fs.copyFileSync(sourcePath, destPath);
      return { success: true, data: destPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Batch Upsert Customers (Excel Import) ────────────────────────────────
  ipcMain.handle('db:batchUpsertCustomers', (_, list) => {
    try {
      return batchUpsertCustomers(list);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Truncate Operations (from Reports) ──────────────────────────────────
  ipcMain.handle('db:truncateInvoices', () => {
    try {
      requireAdmin();
      return truncateInvoices();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:truncateFinance', () => {
    try {
      requireAdmin();
      return truncateFinance();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Selective Reset ──────────────────────────────────────────────────────
  ipcMain.handle('db:selectiveReset', (_, options) => {
    try {
      requireAdmin();
      return selectiveReset(options);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Daily Report ─────────────────────────────────────────────────────────
  ipcMain.handle('db:getDailyReport', (_, date) => {
    return getDailyReport(date);
  });

  // ─── DB backup (legacy — kept for backward compatibility) ─────────────────
  ipcMain.handle('db:backup', async (_, destPath) => {
    try {
      await db.backup(destPath);
      return { success: true };
    } catch (err) {
      // Fallback to file copy
      try {
        const dbPath = getDbPath();
        fs.copyFileSync(dbPath, destPath);
        return { success: true };
      } catch (copyErr) {
        return { success: false, error: copyErr.message };
      }
    }
  });

  // ─── Auto Absence ─────────────────────────────────────────────────────────
  // يُطبَّق غياب تلقائي لكل موظف نشط ليس له حضور أو إجازة في التاريخ المحدد
  ipcMain.handle('hr:applyAutoAbsence', (_, date) => {
    try {
      const targetDate = date || getBusinessDate();
      const employees = db.prepare(`SELECT id FROM employees WHERE is_active = 1`).all();
      let count = 0;
      for (const emp of employees) {
        // تحقق من وجود حضور
        const att = db.prepare(
          `SELECT id FROM attendance WHERE employee_id = ? AND date = ?`
        ).get(emp.id, targetDate);
        // تحقق من وجود إجازة
        const lv = db.prepare(
          `SELECT id FROM leaves WHERE employee_id = ? AND leave_date = ?`
        ).get(emp.id, targetDate);

        if (!att && !lv) {
          // لا يوجد حضور ولا إجازة → غياب
          db.prepare(`
            INSERT OR IGNORE INTO attendance (employee_id, date, status)
            VALUES (?, ?, 'غياب')
          `).run(emp.id, targetDate);
          count++;
        }
      }
      return { success: true, data: { date: targetDate, absencesInserted: count } };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  getDb,
  setupIpcHandlers,
  generateInvoiceNumber,
  addTreasuryEntry,
  getTreasuryBalance,
  createBackup,
  copyBackupToExternal,
  getExternalBackupPath,
  selectiveReset,
  truncateInvoices,
  truncateFinance,
  setBagCount,
  confirmBagScan,
  getInvoiceBags,
  getUnprintedBags,
  markBagsPrinted,
  markInvoiceBagsPrinted,
  batchUpsertCustomers
};
