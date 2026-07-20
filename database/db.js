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

  migrateSchema();
  initSchema();
  runSeed();

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
  if (currentSession.role !== 'admin') {
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
  const row = db.prepare('SELECT * FROM invoice_sequence WHERE id = 1').get();

  if (!row) {
    db.prepare('INSERT INTO invoice_sequence (id, last_number, year) VALUES (1, 1, ?)').run(year);
    return `INV-${year}-0001`;
  }

  let nextNum = row.year === year ? row.last_number + 1 : 1;
  db.prepare('UPDATE invoice_sequence SET last_number = ?, year = ? WHERE id = 1').run(nextNum, year);
  return `INV-${year}-${String(nextNum).padStart(4, '0')}`;
}

function previewInvoiceNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT * FROM invoice_sequence WHERE id = 1').get();
  if (!row) return `INV-${year}-0001`;
  let nextNum = row.year === year ? row.last_number + 1 : 1;
  return `INV-${year}-${String(nextNum).padStart(4, '0')}`;
}

// ─── Treasury helpers ─────────────────────────────────────────────────────────
function getTreasuryBalance(treasuryType = 'الخزينة') {
  const row = db.prepare(
    `SELECT balance_after FROM treasury WHERE treasury_type = ? ORDER BY id DESC LIMIT 1`
  ).get(treasuryType);
  return row ? row.balance_after : 0;
}

function addTreasuryEntry(type, description, amount, treasuryType = 'الخزينة') {
  const currentBalance = getTreasuryBalance(treasuryType);
  const newBalance = type === 'إيراد' ? currentBalance + amount : currentBalance - amount;
  db.prepare(
    `INSERT INTO treasury (type, description, amount, balance_after, treasury_type) VALUES (?, ?, ?, ?, ?)`
  ).run(type, description, amount, newBalance, treasuryType);
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

  const result = db.prepare(`
    INSERT INTO shifts (employee_id, user_id, opening_cash, status)
    VALUES (?, ?, ?, 'مفتوح')
  `).run(currentSession.employeeId, currentSession.userId, openingCash || 0);

  currentSession.shiftId = result.lastInsertRowid;
  return { success: true, data: { shiftId: result.lastInsertRowid, alreadyOpen: false } };
}

function getShiftSummary(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) return { success: false, error: 'الشيفت غير موجود' };

  // Total returns
  const returns = db.prepare(`
    SELECT COALESCE(SUM(total_returned), 0) as total
    FROM returns WHERE shift_id = ?
  `).get(shiftId);

  // Total expenses from treasury during shift
  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM expenses WHERE shift_id = ?
  `).get(shiftId);

  // Invoice count
  const invCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM invoices WHERE shift_id = ?
  `).get(shiftId);

  // Fetch detailed treasury movements for this shift accurately using date/time concatenation
  let treasuryDetails = [];
  try {
    if (shift.start_time) {
      if (shift.end_time) {
        treasuryDetails = db.prepare(`
          SELECT type, description, amount, treasury_type, time, date
          FROM treasury
          WHERE (date || ' ' || time) >= ? AND (date || ' ' || time) <= ?
          ORDER BY date ASC, time ASC
        `).all(shift.start_time, shift.end_time);
      } else {
        treasuryDetails = db.prepare(`
          SELECT type, description, amount, treasury_type, time, date
          FROM treasury
          WHERE (date || ' ' || time) >= ?
          ORDER BY date ASC, time ASC
        `).all(shift.start_time);
      }
    }
  } catch (err) {
    console.error('Error fetching treasuryDetails:', err);
  }

  let netTreasuryCash = 0;
  let netTreasuryVodafone = 0;
  let totalSalesCash = 0;
  let totalSalesVodafone = 0;
  let totalAdvances = 0;

  for (const t of treasuryDetails) {
    if (t.treasury_type === 'الخزينة') {
      if (t.type === 'إيراد') {
        netTreasuryCash += t.amount;
        if (t.description.startsWith('فاتورة رقم') || t.description.startsWith('سداد مديونية فاتورة')) {
          totalSalesCash += t.amount;
        }
      } else {
        netTreasuryCash -= t.amount;
        if (t.description.startsWith('سلفة موظف')) {
          totalAdvances += t.amount;
        }
      }
    } else if (t.treasury_type === 'فودافون كاش') {
      if (t.type === 'إيراد') {
        netTreasuryVodafone += t.amount;
        if (t.description.startsWith('فاتورة رقم') || t.description.startsWith('سداد مديونية فاتورة')) {
          totalSalesVodafone += t.amount;
        }
      } else {
        netTreasuryVodafone -= t.amount;
        if (t.description.startsWith('سلفة موظف')) {
          totalAdvances += t.amount;
        }
      }
    }
  }

  const totalReturns = returns.total || 0;
  const totalExpenses = expenses.total || 0;
  
  // Real expected cash is purely Opening Cash + Net Treasury Movements for Cash
  const expectedCash = (shift.opening_cash || 0) + netTreasuryCash;
  const expectedVodafone = netTreasuryVodafone;

  return {
    success: true,
    data: {
      shift,
      totalSalesCash,
      totalSalesVodafone,
      totalSales: totalSalesCash + totalSalesVodafone,
      totalReturns,
      totalExpenses,
      totalAdvances,
      expectedCash,
      expectedVodafone,
      invoiceCount: invCount.cnt || 0,
      treasuryDetails
    }
  };
}

function endShift(shiftId, actualCash, actualVodafone, notes) {
  const summary = getShiftSummary(shiftId);
  if (!summary.success) return summary;

  const { expectedCash, expectedVodafone, totalSalesCash, totalSalesVodafone, totalReturns, totalExpenses, invoiceCount } = summary.data;

  const cashDifference = (actualCash || 0) - expectedCash;
  const vodafoneDiff = (actualVodafone || 0) - expectedVodafone;

  db.prepare(`
    UPDATE shifts SET
      end_time = datetime('now'),
      expected_cash = ?,
      actual_cash_counted = ?,
      cash_difference = ?,
      vodafone_cash_expected = ?,
      vodafone_cash_actual = ?,
      total_sales = ?,
      total_returns = ?,
      total_expenses = ?,
      invoice_count = ?,
      status = 'مغلق',
      notes = ?,
      closed_by_user_id = ?
    WHERE id = ?
  `).run(
    expectedCash, actualCash, cashDifference,
    expectedVodafone, actualVodafone || 0,
    totalSalesCash + totalSalesVodafone, totalReturns, totalExpenses,
    invoiceCount, notes || null,
    currentSession.userId, shiftId
  );

  currentSession.shiftId = null;
  return { success: true, data: { cashDifference, vodafoneDifference: vodafoneDiff } };
}

// ─── Backup helpers ───────────────────────────────────────────────────────────
function createBackup(backupType = 'يدوي', customDir = null) {
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
    // Use better-sqlite3's backup API
    db.backup(destPath)
      .then(() => {
        const stats = fs.statSync(destPath);
        const sizeKb = (stats.size / 1024).toFixed(2);

        db.prepare(`
          INSERT INTO backups (file_name, file_path, file_size_kb, backup_type)
          VALUES (?, ?, ?, ?)
        `).run(fileName, destPath, sizeKb, backupType);
      })
      .catch(err => console.error('Backup error:', err));

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
      `).run(fileName, destPath, sizeKb, backupType);

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

// ─── IPC Handler Map ──────────────────────────────────────────────────────────
function setupIpcHandlers(ipcMain, app) {
  getDb(app);

  // ─── Auth ─────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', (_, username, password) => {
    try {
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

  ipcMain.handle('shift:end', (_, shiftId, actualCash, actualVodafone, notes) => {
    try {
      return endShift(shiftId, actualCash, actualVodafone, notes);
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
        const invStmt = db.prepare(`
          INSERT INTO invoices (invoice_number, customer_id, employee_id, tailor_id, invoice_date,
            payment_method, invoice_type, treasury_type, subtotal, discount_percent,
            discount_amount, net_total, amount_paid, remaining, notes, shift_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const invInfo = invStmt.run(
          invNum,
          invoiceData.customer_id || null,
          invoiceData.employee_id || null,
          invoiceData.tailor_id || null,
          invoiceData.invoice_date || new Date().toISOString().split('T')[0],
          invoiceData.payment_method || 'نقدي',
          invoiceData.invoice_type || null,
          invoiceData.treasury_type || 'الخزينة',
          invoiceData.subtotal || 0,
          invoiceData.discount_percent || 0,
          invoiceData.discount_amount || 0,
          invoiceData.net_total || 0,
          invoiceData.amount_paid || 0,
          invoiceData.remaining || 0,
          invoiceData.notes || null,
          currentSession.shiftId || invoiceData.shift_id || null
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

        // Update customer balance if credit (أجل)
        if (invoiceData.customer_id && invoiceData.payment_method === 'أجل') {
          db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`)
            .run(invoiceData.remaining || 0, invoiceData.customer_id);
        }

        // Add treasury entry for cash payment
        if (invoiceData.amount_paid > 0) {
          addTreasuryEntry('إيراد', `فاتورة رقم ${invNum}`,
            invoiceData.amount_paid, invoiceData.treasury_type || 'الخزينة');
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
          new Date().toISOString().split('T')[0],
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
  ipcMain.handle('db:updateInvoiceStatus', (_, invoiceId, status) => {
    try {
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invoiceId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
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
      requireAdmin();
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
          wa_tpl_full_payment = ?, wa_tpl_partial_payment = ?
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
        data.wa_tpl_partial_payment || ''
      );
      logAudit('update_settings', 'company_settings', 1, null, data);
      return { success: true };
    } catch (err) {
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
  ipcMain.handle('backup:create', (_, backupType) => {
    try {
      const result = createBackup(backupType || 'يدوي');
      // Copy to external path if configured
      if (result.success && result.data && result.data.filePath) {
        setTimeout(() => copyBackupToExternal(result.data.filePath), 2000);
      }
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
}

module.exports = { getDb, setupIpcHandlers, generateInvoiceNumber, addTreasuryEntry, getTreasuryBalance, createBackup, copyBackupToExternal, getExternalBackupPath };
