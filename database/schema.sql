-- ============================================================
-- EL-TARZY — نظام إدارة محل الترزي
-- SQLite Schema — Full Database Definition
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- الموظفين
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER,
  phone TEXT,
  monthly_salary REAL DEFAULT 0,
  work_hours_per_day REAL DEFAULT 8,
  job_title TEXT,
  hire_date TEXT,
  employee_type TEXT DEFAULT 'موظف عادي',
  username TEXT UNIQUE,
  password TEXT,
  is_active INTEGER DEFAULT 1,
  commission_percent REAL DEFAULT 0,
  salary_type TEXT DEFAULT 'ثابت',
  monthly_leave_days INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now'))
);

-- العملاء
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- الموردين
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- أقسام الخدمات
CREATE TABLE IF NOT EXISTS service_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- الخدمات / الأصناف
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES service_categories(id),
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  sell_price REAL DEFAULT 0,
  cost_price REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- المستخدمين (تسجيل الدخول)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- سجل تسجيل الدخول/الخروج
CREATE TABLE IF NOT EXISTS login_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  login_time TEXT DEFAULT (datetime('now')),
  logout_time TEXT,
  ip_or_device TEXT
);

-- سجل تتبع التعديلات الحساسة
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT,
  table_name TEXT,
  record_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- الشيفتات (كامل مع تسوية العهدة)
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  user_id INTEGER REFERENCES users(id),
  start_time TEXT DEFAULT (datetime('now')),
  opening_cash REAL DEFAULT 0,
  end_time TEXT,
  expected_cash REAL,
  actual_cash_counted REAL,
  cash_difference REAL,
  vodafone_cash_expected REAL DEFAULT 0,
  vodafone_cash_actual REAL DEFAULT 0,
  total_sales REAL DEFAULT 0,
  total_returns REAL DEFAULT 0,
  total_expenses REAL DEFAULT 0,
  invoice_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'مفتوح',
  notes TEXT,
  closed_by_user_id INTEGER REFERENCES users(id)
);

-- الفواتير
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  employee_id INTEGER REFERENCES employees(id),
  tailor_id INTEGER REFERENCES employees(id),
  invoice_date TEXT DEFAULT (date('now')),
  payment_method TEXT DEFAULT 'نقدي',
  invoice_type TEXT,
  treasury_type TEXT DEFAULT 'الخزينة',
  subtotal REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  net_total REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  remaining REAL DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'تحت الشغل',
  is_returned INTEGER DEFAULT 0,
  shift_id INTEGER REFERENCES shifts(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- عناصر الفاتورة
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id),
  category_name TEXT,
  service_name TEXT,
  barcode TEXT,
  sell_price REAL,
  quantity INTEGER DEFAULT 1,
  item_discount REAL DEFAULT 0,
  total REAL
);

-- المرتجعات
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_invoice_id INTEGER REFERENCES invoices(id),
  employee_id INTEGER REFERENCES employees(id),
  return_date TEXT DEFAULT (date('now')),
  total_returned REAL DEFAULT 0,
  notes TEXT,
  shift_id INTEGER REFERENCES shifts(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- عناصر المرتجع
CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
  invoice_item_id INTEGER REFERENCES invoice_items(id),
  product_name TEXT,
  quantity_returned INTEGER DEFAULT 1,
  price_before_discount REAL,
  item_discount REAL DEFAULT 0,
  price_after_discount REAL,
  total REAL
);

-- الحضور والانصراف
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  check_in TEXT,
  check_out TEXT,
  date TEXT DEFAULT (date('now')),
  late_minutes REAL DEFAULT 0,
  extra_minutes REAL DEFAULT 0,
  shift_id INTEGER REFERENCES shifts(id)
);

-- الإجازات
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  leave_date TEXT,
  reason TEXT,
  approved_by INTEGER REFERENCES employees(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- السلف
CREATE TABLE IF NOT EXISTS advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  amount REAL NOT NULL,
  date TEXT DEFAULT (date('now')),
  notes TEXT,
  paid_back INTEGER DEFAULT 0
);

-- الخصومات
CREATE TABLE IF NOT EXISTS deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  amount REAL NOT NULL,
  reason TEXT,
  date TEXT DEFAULT (date('now'))
);

-- الحوافز
CREATE TABLE IF NOT EXISTS incentives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  amount REAL NOT NULL,
  reason TEXT,
  date TEXT DEFAULT (date('now'))
);

-- صرف الرواتب
CREATE TABLE IF NOT EXISTS salary_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  month TEXT,
  gross_salary REAL,
  total_advances REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  incentives REAL DEFAULT 0,
  net_salary REAL,
  paid_date TEXT DEFAULT (date('now')),
  paid_by INTEGER REFERENCES employees(id)
);

-- العهد
CREATE TABLE IF NOT EXISTS custody (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  item_name TEXT,
  quantity INTEGER DEFAULT 1,
  date_given TEXT DEFAULT (date('now')),
  date_returned TEXT,
  notes TEXT
);

-- أنواع المصروفات
CREATE TABLE IF NOT EXISTS expense_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- المصروفات
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id INTEGER REFERENCES expense_types(id),
  type_name TEXT,
  amount REAL NOT NULL,
  description TEXT,
  employee_id INTEGER REFERENCES employees(id),
  payment_source TEXT DEFAULT 'الخزينة',
  date TEXT DEFAULT (date('now')),
  time TEXT DEFAULT (time('now')),
  shift_id INTEGER REFERENCES shifts(id)
);

-- الإيرادات الأخرى
CREATE TABLE IF NOT EXISTS revenues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT,
  amount REAL,
  date TEXT DEFAULT (date('now')),
  employee_id INTEGER REFERENCES employees(id)
);

-- حركات الخزينة
CREATE TABLE IF NOT EXISTS treasury (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  description TEXT,
  amount REAL,
  balance_after REAL,
  date TEXT DEFAULT (date('now')),
  time TEXT DEFAULT (time('now')),
  treasury_type TEXT DEFAULT 'الخزينة'
);

-- المشتريات
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  employee_id INTEGER REFERENCES employees(id),
  purchase_date TEXT DEFAULT (date('now')),
  total REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  remaining REAL DEFAULT 0,
  notes TEXT
);

-- عناصر المشتريات
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id),
  item_name TEXT,
  quantity INTEGER,
  unit_cost REAL,
  total REAL
);

-- الشركاء
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  share_percent REAL DEFAULT 0,
  phone TEXT,
  opening_balance REAL DEFAULT 0,
  notes TEXT
);

-- إعدادات الشركة (كاملة — كل حقل يُطبع على الفاتورة ديناميكياً)
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name TEXT DEFAULT 'EL-Tarzy',
  address TEXT,
  phone TEXT,
  logo_path TEXT,
  tax_number TEXT,
  receipt_footer TEXT DEFAULT 'شكراً لزيارتكم',
  receipt_notes TEXT,
  show_tailor_name INTEGER DEFAULT 1,
  show_customer_phone INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'جنيه',
  prevent_cashier_price_edit INTEGER DEFAULT 0,
  cashier_hide_reports INTEGER DEFAULT 0,
  cashier_hide_hr INTEGER DEFAULT 0,
  cashier_prevent_returns INTEGER DEFAULT 0,
  cashier_hide_finance INTEGER DEFAULT 0,
  cashier_prevent_discount INTEGER DEFAULT 0,
  cashier_prevent_settings INTEGER DEFAULT 0,
  wa_phone1 TEXT DEFAULT '',
  wa_phone2 TEXT DEFAULT '',
  wa_tpl_invoice_confirm TEXT DEFAULT '',
  wa_tpl_order_ready TEXT DEFAULT '',
  wa_tpl_delivered TEXT DEFAULT '',
  wa_tpl_full_payment TEXT DEFAULT '',
  wa_tpl_partial_payment TEXT DEFAULT ''
);

-- invoice sequence counter
CREATE TABLE IF NOT EXISTS invoice_sequence (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_number INTEGER DEFAULT 0,
  year INTEGER DEFAULT 2026
);

-- سجل النسخ الاحتياطية
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_kb REAL,
  backup_type TEXT DEFAULT 'يدوي',
  created_at TEXT DEFAULT (datetime('now'))
);

-- إعدادات الواتساب (Multi-Provider)
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
);

-- خريطة قوالب الواتساب
CREATE TABLE IF NOT EXISTS whatsapp_template_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  logical_key TEXT NOT NULL UNIQUE,
  actual_template_name TEXT NOT NULL,
  language_code TEXT DEFAULT 'ar'
);

-- جدول تتبع الـ migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY
);
