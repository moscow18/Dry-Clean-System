const Database = require('better-sqlite3');
const db = new Database('C:/Users/lenovo/AppData/Roaming/el-tarzy/database.sqlite', { fileMustExist: false });

const date = '2026-08-12';
const dateLike = date + '%';

try {
  const invoices = db.prepare(`SELECT * FROM invoices WHERE invoice_date LIKE ?`).all(dateLike);
  console.log('invoices:', invoices.length);

  const expenses = db.prepare(`SELECT * FROM expenses WHERE date LIKE ?`).all(dateLike);
  console.log('expenses:', expenses.length);

  const advances = db.prepare(`SELECT * FROM advances WHERE date LIKE ?`).all(dateLike);
  console.log('advances:', advances.length);

  const attendance = db.prepare(`SELECT * FROM attendance WHERE date LIKE ?`).all(dateLike);
  console.log('attendance:', attendance.length);

  const returns = db.prepare(`SELECT * FROM returns WHERE return_date LIKE ?`).all(dateLike);
  console.log('returns:', returns.length);

  const treasury = db.prepare(`SELECT * FROM treasury WHERE date LIKE ? ORDER BY time ASC`).all(dateLike);
  console.log('treasury:', treasury.length);

  const salaries = db.prepare(`SELECT * FROM salary_payments WHERE paid_date LIKE ?`).all(dateLike);
  console.log('salaries:', salaries.length);

  const revenues = db.prepare(`SELECT * FROM revenues WHERE date LIKE ?`).all(dateLike);
  console.log('revenues:', revenues.length);

  const allTypes = ['الخزينة', 'فودافون كاش', 'إنستا باي', 'البنك'];
  const treasuryBalances = allTypes.map(t => {
    const row = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date LIKE ? AND treasury_type = ?`
    ).get(dateLike, t);
    return { treasury_type: t, balance: row ? row.net : 0 };
  });
  console.log('treasuryBalances:', treasuryBalances);

} catch (err) {
  console.error('ERROR THROWN:', err.message);
}
