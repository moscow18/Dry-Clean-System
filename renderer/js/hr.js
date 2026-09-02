let employees = [];
let editingEmployeeId = null;
const sectionTitles = {
  employees:'الموظفون', 'new-employee':'موظف جديد',
  attendance:'الحضور والانصراف', leaves:'الإجازات',
  advances:'السلف', deductions:'الخصومات', incentives:'الحوافز',
  custody:'العهد', salary:'الرواتب', 'emp-sales':'مبيعات الموظف'
};



window.hrCache = window.hrCache || {};

function showSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.hr-nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('section-'+name).classList.add('active');
  document.querySelectorAll('.hr-nav-btn').forEach(b=>{
    if(b.onclick && b.onclick.toString().includes(`'${name}'`)) b.classList.add('active');
  });
  document.getElementById('sectionTitle').textContent = sectionTitles[name]||name;
  
  // Always reload data on section switch (no caching — prevents stale/empty data)
  if(name==='employees') loadEmployees();
  if(name==='attendance'){
    populateEmpSelect('att_emp');
    populateEmpSelect('co_emp');
    populateEmpSelect('attFilterEmp', true);
    loadAttendance();
    const today = getLocalISODate();
    document.getElementById('att_date').value = today;
    document.getElementById('co_date').value  = today;
  }
  if(name==='leaves'){ populateEmpSelect('lv_emp'); loadLeaves(); document.getElementById('lv_date').value=getLocalISODate(); }
  if(name==='advances'){ 
    populateEmpSelect('adv_emp'); 
    populateEmpSelect('advFilterEmp', true);
    loadAdvances(); 
  }
  if(name==='deductions'){ populateEmpSelect('ded_emp'); loadDeductions(); }
  if(name==='incentives'){ populateEmpSelect('inc_emp'); loadIncentives(); }
  if(name==='custody'){ populateEmpSelect('cus_emp'); loadCustody(); }
  if(name==='salary'){ loadSalaryMonths(); loadSalaryReport(); }
  if(name==='emp-sales'){ populateEmpSelect('empSalesEmp',true);
    const d=new Date(); document.getElementById('empSalesFrom').value=d.getFullYear()+'-01-01';
    document.getElementById('empSalesTo').value=d.toISOString().split('T')[0]; loadEmpSales(); }
}


function onGlobalSearch(){
  const term = document.getElementById('globalSearch').value.toLowerCase();
  if(!employees.length) return;
  const filtered = employees.filter(e => 
    (e.name && e.name.toLowerCase().includes(term)) || 
    (e.job_title && e.job_title.toLowerCase().includes(term)) || 
    (e.phone && e.phone.includes(term))
  );
  renderEmployeesList(filtered);
}

async function populateEmpSelect(selId, addAll=false){
  const res = await window.db.query('SELECT id,name FROM employees WHERE is_active=1 ORDER BY name',[]);
  const sel = document.getElementById(selId);
  sel.innerHTML = addAll?'<option value="">كل الموظفين</option>':'<option value="">اختر الموظف</option>';
  if(res.success) res.data.forEach(e=>sel.innerHTML+=`<option value="${e.id}">${e.name}</option>`);
}

// ─── Load Employees ───────────────────────────────────────────────────────────
async function loadEmployees(){
  const res = await window.db.query('SELECT * FROM employees ORDER BY name',[]);
  const container = document.getElementById('employeesList');
  if(!res.success||!res.data.length){
    container.innerHTML='<div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-title">لا يوجد موظفون</div></div>';
    return;
  }
  employees = res.data;
  container.innerHTML = res.data.map(e=>`
    <div class="emp-card">
      <div class="emp-avatar">${e.name.charAt(0)}</div>
      <div class="emp-info">
        <div class="name">${e.name}</div>
        <div class="meta">${e.job_title||'—'} | ${e.phone||'—'} | ${e.is_active?'<span class="badge badge-success">نشط</span>':'<span class="badge badge-danger">غير نشط</span>'}</div>
        <div class="meta">الراتب: ${fmt(e.monthly_salary)} جنيه | ساعات: ${e.work_hours_per_day} | إجازة شهرية: ${e.monthly_leave_days != null ? e.monthly_leave_days : 2} يوم</div>
      </div>
      <div class="emp-card-actions">
        <button class="btn btn-sm btn-info" onclick="openEmpDetails(${e.id})">تفاصيل</button>
        <button class="btn btn-sm btn-outline" onclick="editEmployee(${e.id})">تعديل</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${e.id})">حذف</button>
      </div>
    </div>
  `).join('');
}

// ─── New / Edit Employee ──────────────────────────────────────────────────────
async function saveEmployee(){
  const name=document.getElementById('ne_name').value.trim();
  if(!name){showToast('يرجى إدخال اسم الموظف','error');return;}
  const username=document.getElementById('ne_username').value.trim()||null;
  const password=document.getElementById('ne_password').value||null;
  const isActive=parseInt(document.getElementById('ne_active').value);
  let leaveDays=parseInt(document.getElementById('ne_leave_days').value);
  if(isNaN(leaveDays)) leaveDays = 2;

  if(editingEmployeeId){
    // ── وضع التعديل ──
    const data=[
      name,
      parseInt(document.getElementById('ne_age').value)||null,
      document.getElementById('ne_phone').value.trim(),
      parseFloat(document.getElementById('ne_salary').value)||0,
      parseFloat(document.getElementById('ne_hours').value)||8,
      document.getElementById('ne_jobtitle').value.trim(),
      document.getElementById('ne_hiredate').value,
      document.getElementById('ne_type').value,
      username,
      isActive,
      parseFloat(document.getElementById('ne_commission').value)||0,
      leaveDays,
      editingEmployeeId
    ];
    // إذا أدخل كلمة مرور جديدة نحدّثها، وإلا نتركها كما هي
    const salaryType=document.getElementById('ne_salary_type')?.value||'ثابت';
    let sql, params;
    if(password){
      sql=`UPDATE employees SET name=?,age=?,phone=?,monthly_salary=?,work_hours_per_day=?,job_title=?,hire_date=?,employee_type=?,username=?,password=?,is_active=?,commission_percent=?,monthly_leave_days=?,salary_type=? WHERE id=?`;
      params=[...data.slice(0,9), password, ...data.slice(9,-1), salaryType, editingEmployeeId];
    } else {
      sql=`UPDATE employees SET name=?,age=?,phone=?,monthly_salary=?,work_hours_per_day=?,job_title=?,hire_date=?,employee_type=?,username=?,is_active=?,commission_percent=?,monthly_leave_days=?,salary_type=? WHERE id=?`;
      params=[...data.slice(0,-1), salaryType, editingEmployeeId];
    }
    const res=await window.db.run(sql,params);
    if(res.success){showToast('تم تعديل بيانات الموظف بنجاح ✏️','success');clearNewEmployee();showSection('employees');}
    else showToast('خطأ في التعديل: '+res.error,'error');
  } else {
    // ── وضع الإضافة ──
    const salaryType=document.getElementById('ne_salary_type')?.value||'ثابت';
    const data=[name,parseInt(document.getElementById('ne_age').value)||null,
      document.getElementById('ne_phone').value.trim(),
      parseFloat(document.getElementById('ne_salary').value)||0,
      parseFloat(document.getElementById('ne_hours').value)||8,
      document.getElementById('ne_jobtitle').value.trim(),
      document.getElementById('ne_hiredate').value,
      document.getElementById('ne_type').value,
      username,
      password,
      isActive,
      parseFloat(document.getElementById('ne_commission').value)||0,
      leaveDays,
      salaryType];
    const res=await window.db.run(
      `INSERT INTO employees (name,age,phone,monthly_salary,work_hours_per_day,job_title,hire_date,employee_type,username,password,is_active,commission_percent,monthly_leave_days,salary_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,data);
    if(res.success){showToast('تم إضافة الموظف بنجاح ','success');clearNewEmployee();showSection('employees');}
    else showToast('خطأ: '+res.error,'error');
  }
}

function clearNewEmployee(){
  editingEmployeeId=null;
  document.querySelector('#section-new-employee .card-title').textContent='إضافة موظف جديد';
  ['ne_name','ne_age','ne_phone','ne_salary','ne_hours','ne_jobtitle','ne_hiredate','ne_username','ne_password','ne_commission','ne_leave_days'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ne_hours').value='8';
  document.getElementById('ne_commission').value='0';
  document.getElementById('ne_leave_days').value='2';
  document.getElementById('ne_active').value='1';
  const st=document.getElementById('ne_salary_type'); if(st) st.value='ثابت';
  const lbl=document.getElementById('lblSalary'); if(lbl) lbl.textContent='الراتب الشهري (جنيه)';
}

// ─── Employee Details ──────────────────────────────────────────────────────────
let currentEmpDetailsId = null;
let currentEmpDetailsData = {};

async function openEmpDetails(id) {
  currentEmpDetailsId = id;
  const emp = employees.find(e => e.id === id);
  if(!emp) return;
  const now = new Date();
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('empDetMonth').textContent = month;

  // Fetch all data
  const advRes    = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM advances WHERE employee_id=? AND strftime('%Y-%m',date)=? AND paid_back=0`, [id, month]);
  const dedRes    = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM deductions WHERE employee_id=? AND strftime('%Y-%m',date)=?`, [id, month]);
  const incRes    = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM incentives WHERE employee_id=? AND strftime('%Y-%m',date)=?`, [id, month]);
  const paidRes   = await window.db.queryOne(`SELECT COALESCE(SUM(net_salary),0) as total_paid, COALESCE(SUM(total_advances),0) as paid_advances FROM salary_payments WHERE employee_id=? AND month=?`, [id, month]);
  const commRes   = await window.db.queryOne(`SELECT COALESCE(SUM(net_total),0) as total_sales FROM invoices WHERE tailor_id=? AND strftime('%Y-%m',invoice_date)=?`, [id, month]);
  const retRes    = await window.db.queryOne(`SELECT COALESCE(SUM(r.total_returned),0) as total_returned FROM returns r JOIN invoices i ON r.original_invoice_id=i.id WHERE i.tailor_id=? AND strftime('%Y-%m',i.invoice_date)=?`, [id, month]);
  const lvRes     = await window.db.queryOne(`SELECT COUNT(*) as count FROM leaves WHERE employee_id=? AND strftime('%Y-%m',leave_date)=?`, [id, month]);
  const attRes    = await window.db.queryOne(`SELECT COUNT(DISTINCT date) as days, SUM(late_minutes) as late FROM attendance WHERE employee_id=? AND strftime('%Y-%m',date)=?`, [id, month]);

  const salaryType = emp.salary_type || 'ثابت';
  let gross = 0;
  
  if (salaryType === 'يومية') {
    const daysWorked = attRes.data?.days || 0;
    const dailyRate = emp.monthly_salary || 0;
    gross = daysWorked * dailyRate;
  } else {
    gross = emp.monthly_salary || 0;
  }

  const commPct        = emp.commission_percent || 0;
  const netSales       = Math.max(0, (commRes.data?.total_sales || 0) - (retRes.data?.total_returned || 0));
  const commission     = netSales * (commPct / 100);
  const allowance      = emp.monthly_leave_days != null ? emp.monthly_leave_days : 2;
  const dayValue       = (emp.monthly_salary || 0) / 30; // base value on nominal salary for deductions
  const takenLeaves    = lvRes.data?.count || 0;
  const remainingLeaves= Math.max(0, allowance - takenLeaves);
  const excessLeaves   = Math.max(0, takenLeaves - allowance);
  
  let leaveBonus = 0;
  let leaveDeduction = 0;
  if (salaryType !== 'يومية') {
    leaveBonus = remainingLeaves * dayValue;
    leaveDeduction = excessLeaves * dayValue;
  }
  const manualAdv      = (advRes.data?.total || 0) + (paidRes.data?.paid_advances || 0);
  const manualDed      = dedRes.data?.total || 0;
  const manualInc      = incRes.data?.total || 0;
  const totalDed       = manualDed + leaveDeduction;
  const totalInc       = manualInc + leaveBonus;
  const totalDue       = gross + commission - manualAdv - totalDed + totalInc;
  const totalPaid      = paidRes.data?.total_paid || 0;
  const netDue         = totalDue - totalPaid;

  // Save for print
  currentEmpDetailsData = {
    emp, month, gross, commPct, netSales, commission,
    allowance, takenLeaves, remainingLeaves, excessLeaves,
    leaveBonus, leaveDeduction, manualAdv, manualDed, manualInc,
    totalDed, totalInc, totalDue, totalPaid, netDue,
    attDays: attRes.data?.days || 0, lateMin: attRes.data?.late || 0
  };

  const sign = n => n >= 0 ? `<span style="color:green;">+${fmt(n)}</span>` : `<span style="color:red;">${fmt(n)}</span>`;

  const html = `
    <div style="background:var(--primary);color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:18px;font-weight:900;">${emp.name}</div>
        <div style="font-size:12px;opacity:0.7;">${emp.job_title || '—'} | ${month}</div>
      </div>
      <div style="text-align:left;">
        <div style="font-size:24px;font-weight:900;color:var(--accent);">${fmt(netDue)}</div>
        <div style="font-size:11px;opacity:0.7;">الصافي المستحق</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tbody>
        <tr style="background:var(--bg);">
          <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid var(--border);">إجمالي فواتير الخياط (أساس الحساب)</td>
          <td style="padding:8px 12px;text-align:left;font-weight:700;color:var(--accent);border-bottom:1px solid var(--border);">${fmt(netSales)} ج</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">الراتب الأساسي</td>
          <td style="padding:8px 12px;text-align:left;font-weight:700;border-bottom:1px solid var(--border);">${fmt(gross)} ج</td>
        </tr>
        <tr style="background:var(--bg);">
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">عمولة الخياط (${commPct}% من الفواتير)</td>
          <td style="padding:8px 12px;text-align:left;font-weight:700;color:#8b5cf6;border-bottom:1px solid var(--border);">+${fmt(commission)} ج</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">إجمالي السلف المخصومة</td>
          <td style="padding:8px 12px;text-align:left;font-weight:700;color:var(--warning);border-bottom:1px solid var(--border);">-${fmt(manualAdv)} ج</td>
        </tr>
        <tr style="background:var(--bg);">
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">خصومات يدوية</td>
          <td style="padding:8px 12px;text-align:left;color:var(--danger);border-bottom:1px solid var(--border);">-${fmt(manualDed)} ج</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">خصم غياب زائد عن الرصيد (${excessLeaves} يوم)</td>
          <td style="padding:8px 12px;text-align:left;color:var(--danger);border-bottom:1px solid var(--border);">-${fmt(leaveDeduction)} ج</td>
        </tr>
        <tr style="background:var(--bg);">
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">حوافز يدوية</td>
          <td style="padding:8px 12px;text-align:left;color:var(--success);border-bottom:1px solid var(--border);">+${fmt(manualInc)} ج</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">مكافأة إجازة (رصيد ${remainingLeaves} يوم متبقي)</td>
          <td style="padding:8px 12px;text-align:left;color:var(--success);border-bottom:1px solid var(--border);">+${fmt(leaveBonus)} ج</td>
        </tr>
        <tr style="background:var(--bg);"> 
          <td style="padding:8px 12px;border-bottom:2px solid var(--primary);font-weight:700;">إجمالي المستحق</td>
          <td style="padding:8px 12px;text-align:left;font-weight:900;border-bottom:2px solid var(--primary);">${fmt(totalDue)} ج</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);">تم صرفه مسبقاً</td>
          <td style="padding:8px 12px;text-align:left;color:var(--text-muted);border-bottom:1px solid var(--border);">-${fmt(totalPaid)} ج</td>
        </tr>
        <tr style="background:${netDue<0?'var(--danger-light)':'var(--success-light)'}">
          <td style="padding:10px 12px;font-size:15px;font-weight:900;">الصافي المستحق</td>
          <td style="padding:10px 12px;text-align:left;font-size:16px;font-weight:900;color:${netDue<0?'var(--danger)':'var(--success)'}">${fmt(netDue)} ج</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:14px;padding:10px 14px;background:var(--bg);border-radius:6px;border:1px solid var(--border);font-size:12px;color:var(--text-muted);">
      أيام الحضور: <strong>${currentEmpDetailsData.attDays}</strong> &nbsp;|&nbsp;
      دقائق التأخير: <strong>${currentEmpDetailsData.lateMin}</strong> &nbsp;|&nbsp;
      أيام إجازة مسجلة: <strong>${takenLeaves}/${allowance}</strong>
    </div>
  `;
  document.getElementById('empDetailsBody').innerHTML = html;
  openModal('empDetailsModal');
}

function buildEmpPrintHTML(mode) {
  const d = currentEmpDetailsData;
  const emp = d.emp;
  const isA4 = mode === 'a4';
  const settings = window._hrSettings || {};
  const companyName = settings.company_name || 'EL-Tarzy';

  if (isA4) {
    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير راتب ${emp.name}</title>
    <style>
      @page { size: A4; margin: 18mm 15mm; }
      body { font-family: 'Arial', sans-serif; font-size: 13px; color: #000; line-height: 1.7; }
      h1 { text-align:center; font-size: 20px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
      .sub { text-align:center; font-size: 13px; margin-bottom: 20px; color: #444; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #1B2A4A; color: #fff; padding: 8px 12px; text-align: right; }
      td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
      tr:nth-child(even) td { background: #f8f8f8; }
      .net-row td { background: #e8f5e9; font-weight: 900; font-size: 15px; }
      .footer { text-align:center; margin-top: 40px; font-size: 11px; color: #777; border-top: 1px solid #ddd; padding-top: 10px; }
      .lbl { color: #333; }
      .val-pos { color: green; }
      .val-neg { color: red; }
      .val-warn { color: #c07000; }
      .val-purple { color: #6d28d9; }
    </style></head><body>
    <h1>${companyName}</h1>
    <div class="sub">تقرير راتب موظف — شهر ${d.month}</div>
    <table>
      <tr><th>الموظف</th><th>الوظيفة</th><th>رقم التليفون</th></tr>
      <tr><td>${emp.name}</td><td>${emp.job_title||'—'}</td><td>${emp.phone||'—'}</td></tr>
    </table>
    <table>
      <tr><th colspan="2">تفاصيل الراتب</th></tr>
      <tr><td class="lbl">إجمالي فواتير الخياط (أساس الحساب)</td><td class="val-warn">${d.fmt(d.netSales)} جنيه</td></tr>
      <tr><td class="lbl">الراتب الأساسي</td><td>${d.fmt(d.gross)} جنيه</td></tr>
      <tr><td class="lbl">عمولة الخياط (${d.commPct}% من الفواتير)</td><td class="val-purple">+${d.fmt(d.commission)} جنيه</td></tr>
      <tr><td class="lbl">إجمالي السلف المخصومة</td><td class="val-warn">-${d.fmt(d.manualAdv)} جنيه</td></tr>
      <tr><td class="lbl">الخصومات اليدوية</td><td class="val-neg">-${d.fmt(d.manualDed)} جنيه</td></tr>
      <tr><td class="lbl">خصم غياب زائد (${d.excessLeaves} يوم)</td><td class="val-neg">-${d.fmt(d.leaveDeduction)} جنيه</td></tr>
      <tr><td class="lbl">الحوافز اليدوية</td><td class="val-pos">+${d.fmt(d.manualInc)} جنيه</td></tr>
      <tr><td class="lbl">مكافأة إجازة (${d.remainingLeaves} يوم متبقي)</td><td class="val-pos">+${d.fmt(d.leaveBonus)} جنيه</td></tr>
      <tr><td class="lbl"><strong>إجمالي المستحق</strong></td><td><strong>${d.fmt(d.totalDue)} جنيه</strong></td></tr>
      <tr><td class="lbl">تم صرفه مسبقاً</td><td class="val-warn">-${d.fmt(d.totalPaid)} جنيه</td></tr>
      <tr class="net-row"><td>الصافي المستحق</td><td>${d.fmt(d.netDue)} جنيه</td></tr>
    </table>
    <table>
      <tr><th colspan="3">ملخص الحضور والانصراف</th></tr>
      <tr><td>أيام الحضور</td><td>دقائق التأخير</td><td>أيام الإجازة (مسجل/مسموح)</td></tr>
      <tr><td>${d.attDays} يوم</td><td>${d.lateMin} دقيقة</td><td>${d.takenLeaves}/${d.allowance} يوم</td></tr>
    </table>
    <div class="footer">تم طباعة هذا التقرير من نظام إدارة الترزي — ${new Date().toLocaleDateString('ar-EG')}</div>
    </body></html>`;
  } else {
    // Thermal 80mm
    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير راتب</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      body { font-family: 'Cairo', monospace; font-size: 11px; color: #000; direction: rtl; padding: 4mm 3mm; }
      .center { text-align: center; }
      .bold { font-weight: 900; }
      .line { border-top: 1px dashed #000; margin: 5px 0; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; }
      .net { font-size: 14px; font-weight: 900; text-align: center; margin: 6px 0; }
    </style></head><body>
    <div class="center bold" style="font-size:16px;margin-bottom:3px;">${companyName}</div>
    <div class="center" style="font-size:11px;margin-bottom:3px;">تقرير راتب موظف</div>
    <div class="line"></div>
    <div class="row"><span>الموظف:</span><span class="bold">${emp.name}</span></div>
    <div class="row"><span>الشهر:</span><span>${d.month}</span></div>
    <div class="line"></div>
    <div class="row"><span>فواتير الخياط:</span><span>${d.fmt(d.netSales)} ج</span></div>
    <div class="row"><span>الراتب الأساسي:</span><span class="bold">${d.fmt(d.gross)} ج</span></div>
    <div class="row"><span>عمولة (${d.commPct}%):</span><span>+${d.fmt(d.commission)} ج</span></div>
    <div class="line"></div>
    <div class="row"><span>السلف:</span><span>-${d.fmt(d.manualAdv)} ج</span></div>
    <div class="row"><span>الخصومات:</span><span>-${d.fmt(d.manualDed)} ج</span></div>
    <div class="row"><span>خصم غياب (${d.excessLeaves} يوم):</span><span>-${d.fmt(d.leaveDeduction)} ج</span></div>
    <div class="row"><span>الحوافز:</span><span>+${d.fmt(d.manualInc)} ج</span></div>
    <div class="row"><span>مكافأة إجازة (${d.remainingLeaves} يوم):</span><span>+${d.fmt(d.leaveBonus)} ج</span></div>
    <div class="line"></div>
    <div class="row"><span>إجمالي المستحق:</span><span class="bold">${d.fmt(d.totalDue)} ج</span></div>
    <div class="row"><span>تم صرفه:</span><span>-${d.fmt(d.totalPaid)} ج</span></div>
    <div class="line"></div>
    <div class="net">الصافي: ${d.fmt(d.netDue)} جنيه</div>
    <div class="line"></div>
    <div class="center" style="font-size:9px;margin-top:5px;">نظام الترزي — ${new Date().toLocaleDateString('ar-EG')}</div>
    </body></html>`;
  }
}

async function printEmpDetails(mode) {
  const d = currentEmpDetailsData;
  if (!d || !d.emp) return;
  // Load settings for company name
  const settRes = await window.db.getSettings();
  window._hrSettings = settRes.success ? settRes.data : {};
  // add fmt helper to data for template use
  currentEmpDetailsData.fmt = fmt;

  const html = buildEmpPrintHTML(mode);
  const isA4 = mode === 'a4';

  let iframe = document.getElementById('printFrame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'printFrame';
    iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 300);
}

async function deleteEmployee(id){
  if(!confirm('هل تريد حذف هذا الموظف؟ لا يمكن التراجع عن هذا الإجراء.')) return;
  
  // أولاً: احذف حساب المستخدم المرتبط لتسهيل الحذف إن أمكن
  await window.db.run('DELETE FROM users WHERE employee_id=?',[id]);
  
  // ثانياً: حاول حذف الموظف
  let res=await window.db.run('DELETE FROM employees WHERE id=?',[id]);
  
  if(!res.success && res.error && res.error.includes('FOREIGN KEY')){
     const action = confirm('لا يمكن حذف الموظف نهائياً لارتباطه بحركات مالية (فواتير، سلف، رواتب، إلخ). سيتم إيقاف حسابه وأرشفته بدلاً من الحذف لتجنب تلف الحسابات القديمة. موافق؟');
     if(action) {
         res = await window.db.run('UPDATE employees SET is_active=0 WHERE id=?',[id]);
         if(res.success) {
            showToast('تم إيقاف وأرشفة الموظف بنجاح', 'success');
            loadEmployees();
         } else {
            showToast('خطأ: ' + res.error, 'error');
         }
     }
     return;
  }

  if(res.success && res.changes>0){
    showToast('تم حذف الموظف بنجاح 🗑️','success');
    loadEmployees();
  } else if(res.success && res.changes===0){
    showToast('لم يتم العثور على الموظف','warning');
  } else {
    showToast('خطأ في الحذف: '+(res.error||''),'error');
  }
}

function editEmployee(id){
  const emp=employees.find(e=>e.id===id);if(!emp)return;
  editingEmployeeId=id;
  showSection('new-employee');
  document.querySelector('#section-new-employee .card-title').textContent='تعديل بيانات الموظف';
  document.getElementById('ne_name').value=emp.name||'';
  document.getElementById('ne_age').value=emp.age||'';
  document.getElementById('ne_phone').value=emp.phone||'';
  document.getElementById('ne_salary').value=emp.monthly_salary||'';
  document.getElementById('ne_hours').value=emp.work_hours_per_day||8;
  document.getElementById('ne_jobtitle').value=emp.job_title||'';
  document.getElementById('ne_hiredate').value=emp.hire_date||'';
  document.getElementById('ne_type').value=emp.employee_type||'موظف عادي';
  document.getElementById('ne_username').value=emp.username||'';
  document.getElementById('ne_password').value='';
  document.getElementById('ne_active').value=emp.is_active?'1':'0';
  document.getElementById('ne_commission').value=emp.commission_percent||0;
  document.getElementById('ne_leave_days').value=emp.monthly_leave_days!=null?emp.monthly_leave_days:2;
  // Salary type
  const stEl=document.getElementById('ne_salary_type');
  if(stEl){ stEl.value=emp.salary_type||'ثابت'; }
  const lblEl=document.getElementById('lblSalary');
  if(lblEl){ lblEl.textContent=(emp.salary_type==='يومية')?'قيمة اليومية (جنيه)':'الراتب الشهري (جنيه)'; }
}

// ─── Attendance ───────────────────────────────────────────────────────────────
async function saveAttendance(){
  const empId = document.getElementById('att_emp').value;
  const date  = document.getElementById('att_date').value;
  const ci    = document.getElementById('att_checkin').value;
  if(!empId || !date || !ci){ showToast('يرجى تعبئة الموظف والتاريخ ووقت الحضور','error'); return; }

  // Check if already checked in today
  const existing = await window.db.queryOne('SELECT id FROM attendance WHERE employee_id=? AND date=?',[empId, date]);
  if(existing.success && existing.data){
    showToast('تم تسجيل حضور هذا الموظف في هذا التاريخ مسبقاً','warning');
    return;
  }

  const checkIn = date + 'T' + ci + ':00';
  await window.db.run('INSERT INTO attendance (employee_id,date,check_in,late_minutes,extra_minutes) VALUES (?,?,?,0,0)',
    [empId, date, checkIn]);
  showToast('تم تسجيل الحضور ✅','success');
  document.getElementById('att_checkin').value = '';
  loadAttendance();
}

async function onAttEmpChange(){
  // When employee/date changes in checkin form, sync the checkout form too
  const empId = document.getElementById('att_emp').value;
  const date  = document.getElementById('att_date').value;
  document.getElementById('co_emp').value = empId;
  document.getElementById('co_date').value = date;
  if(empId && date) await fetchCheckinTime(empId, date);
}

async function onCoEmpChange(){
  const empId = document.getElementById('co_emp').value;
  const date  = document.getElementById('co_date').value;
  if(empId && date) await fetchCheckinTime(empId, date);
}

async function fetchCheckinTime(empId, date){
  const res = await window.db.queryOne(
    'SELECT check_in, check_out FROM attendance WHERE employee_id=? AND date=? ORDER BY id DESC LIMIT 1',
    [empId, date]
  );
  const display = document.getElementById('co_checkin_display');
  const summary = document.getElementById('co_summary');
  if(res.success && res.data){
    const timeIn = res.data.check_in ? res.data.check_in.split('T')[1]?.slice(0,5) || res.data.check_in : null;
    if(timeIn){
      display.value = timeIn;
      if(res.data.check_out){
        const timeOut = res.data.check_out.split('T')[1]?.slice(0,5) || res.data.check_out;
        summary.style.display = 'block';
        summary.style.background = 'var(--success-light)';
        summary.innerHTML = `✅ تم تسجيل الانصراف بالفعل: <strong>${timeOut}</strong>`;
      } else {
        summary.style.display = 'block';
        summary.style.background = 'var(--warning-light)';
        summary.innerHTML = `⏳ الموظف حاضر منذ <strong>${timeIn}</strong> — ولم يُسجَّل انصرافه بعد`;
      }
    } else {
      display.value = '';
      summary.style.display = 'none';
    }
  } else {
    display.value = '';
    summary.style.display = 'block';
    summary.style.background = 'var(--danger-light)';
    summary.innerHTML = '⚠️ لا يوجد سجل حضور لهذا الموظف في هذا التاريخ';
  }
}

async function saveCheckout(){
  const empId = document.getElementById('co_emp').value;
  const date  = document.getElementById('co_date').value;
  const co    = document.getElementById('co_checkout').value;
  if(!empId || !date || !co){ showToast('يرجى تحديد الموظف والتاريخ ووقت الانصراف','error'); return; }

  const checkOut = date + 'T' + co + ':00';
  const attRes = await window.db.queryOne(
    'SELECT id, check_in FROM attendance WHERE employee_id=? AND date=? ORDER BY id DESC LIMIT 1',
    [empId, date]
  );

  if(!attRes.success || !attRes.data){
    showToast('لا يوجد سجل حضور لهذا الموظف في هذا التاريخ — سجّل الحضور أولاً','error');
    return;
  }

  let late  = parseFloat(document.getElementById('co_late').value)  || 0;
  let extra = parseFloat(document.getElementById('co_extra').value) || 0;

  // Auto-calculate if both are still 0
  if(late === 0 && extra === 0 && attRes.data.check_in){
    const empRes = await window.db.queryOne('SELECT work_hours_per_day FROM employees WHERE id=?', [empId]);
    const workHours = empRes.data?.work_hours_per_day || 8;
    const required  = Math.floor(workHours * 60);
    const checkInTime  = new Date(attRes.data.check_in);
    const checkOutTime = new Date(checkOut);
    const worked = Math.floor((checkOutTime - checkInTime) / 60000);
    if(worked < required) late  = required - worked;
    else if(worked > required) extra = worked - required;
  }

  await window.db.run(
    'UPDATE attendance SET check_out=?, late_minutes=?, extra_minutes=? WHERE id=?',
    [checkOut, late, extra, attRes.data.id]
  );

  showToast(`تم تسجيل الانصراف ✅ | تأخير: ${late} دق | زيادة: ${extra} دق`, 'success');
  document.getElementById('co_checkout').value = '';
  document.getElementById('co_late').value = '0';
  document.getElementById('co_extra').value = '0';
  document.getElementById('co_summary').style.display = 'none';
  loadAttendance();
}

async function deleteAttendance(id){
  if(!confirm('حذف هذا السجل؟')) return;
  await window.db.run('DELETE FROM attendance WHERE id=?',[id]);
  showToast('تم الحذف','success');
  loadAttendance();
}

async function loadAttendance(){
  const empId = document.getElementById('attFilterEmp')?.value;
  const fromDate = document.getElementById('attFilterFrom')?.value;
  const toDate = document.getElementById('attFilterTo')?.value;

  let query = 'SELECT a.*,e.name as emp_name FROM attendance a LEFT JOIN employees e ON a.employee_id=e.id WHERE 1=1';
  let params = [];

  if (empId) {
    query += ' AND a.employee_id = ?';
    params.push(empId);
  }
  if (fromDate) {
    query += ' AND a.date >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    query += ' AND a.date <= ?';
    params.push(toDate);
  }

  query += ' ORDER BY a.id DESC LIMIT 300';

  const res = await window.db.query(query, params);
  const tbody = document.getElementById('attendanceBody');
  if(!res.success || !res.data.length){
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا توجد سجلات</td></tr>';
    return;
  }
  tbody.innerHTML = res.data.map(r => `<tr>
    <td style="font-weight:600;">${r.emp_name||'—'}</td>
    <td>${r.date}</td>
    <td style="color:var(--success);font-weight:700;">${r.check_in ? r.check_in.split('T')[1]?.slice(0,5)||r.check_in : '—'}</td>
    <td>${r.check_out ? `<span style="color:var(--primary);font-weight:700;">${r.check_out.split('T')[1]?.slice(0,5)||r.check_out}</span>` : '<span class="badge badge-warning">لم ينصرف</span>'}</td>
    <td style="color:var(--danger);">${r.late_minutes||0}</td>
    <td style="color:var(--success);">${r.extra_minutes||0}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteAttendance(${r.id})">حذف</button></td>
  </tr>`).join('');
}

// ─── Leaves ───────────────────────────────────────────────────────────────────
async function saveLeave(){
  const empId=document.getElementById('lv_emp').value;const date=document.getElementById('lv_date').value;const reason=document.getElementById('lv_reason').value.trim();
  if(!empId||!date){showToast('يرجى تحديد الموظف والتاريخ','error');return;}
  await window.db.run('INSERT INTO leaves (employee_id,leave_date,reason) VALUES (?,?,?)',[empId,date,reason]);
  showToast('تم تسجيل الإجازة ','success');loadLeaves();
}
async function loadLeaves(){
  const res=await window.db.query('SELECT l.*,e.name as emp_name FROM leaves l LEFT JOIN employees e ON l.employee_id=e.id ORDER BY l.id DESC LIMIT 100',[]);
  const tbody=document.getElementById('leavesBody');
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="4" class="table-empty">لا توجد إجازات</td></tr>';return;}
  tbody.innerHTML=res.data.map(r=>`<tr><td>${r.emp_name}</td><td>${r.leave_date}</td><td>${r.reason||'—'}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteLeave(${r.id})">حذف</button></td></tr>`).join('');
}
async function deleteLeave(id){await window.db.run('DELETE FROM leaves WHERE id=?',[id]);loadLeaves();}

// ─── Advances ─────────────────────────────────────────────────────────────────
async function saveAdvance(){
  const empId=document.getElementById('adv_emp').value;
  const amt=parseFloat(document.getElementById('adv_amount').value);
  const treasury=document.getElementById('adv_treasury').value || 'الخزينة';
  if(!empId||!amt||amt<=0){showToast('يرجى تعبئة البيانات','error');return;}
  const notes=document.getElementById('adv_notes').value.trim();
  await window.db.run('INSERT INTO advances (employee_id,amount,notes) VALUES (?,?,?)',[empId,amt,notes]);
  await window.db.addTreasuryEntry('مصروف','سلفة موظف',amt,treasury);
  showToast('تم تسجيل السلفة ','success');
  document.getElementById('adv_amount').value='';document.getElementById('adv_notes').value='';
  loadAdvances();
}
async function loadAdvances(){
  const empId = document.getElementById('advFilterEmp').value;
  const from = document.getElementById('advFilterFrom').value;
  const to = document.getElementById('advFilterTo').value;

  let query = 'SELECT a.*,e.name as emp_name FROM advances a LEFT JOIN employees e ON a.employee_id=e.id WHERE 1=1';
  let params = [];
  if (empId) { query += ' AND a.employee_id=?'; params.push(empId); }
  if (from) { query += ' AND date(a.date) >= date(?)'; params.push(from); }
  if (to) { query += ' AND date(a.date) <= date(?)'; params.push(to); }
  
  query += ' ORDER BY a.id DESC LIMIT 1000';

  const res = await window.db.query(query, params);
  const tbody = document.getElementById('advancesBody');
  const tfoot = document.getElementById('advancesFoot');
  
  if(!res.success || !res.data.length){
    tbody.innerHTML='<tr><td colspan="5" class="table-empty">لا توجد سلف للمحدد</td></tr>';
    tfoot.style.display = 'none';
    document.getElementById('btnAdvPrintA4').style.display = 'none';
    document.getElementById('btnAdvPrintThermal').style.display = 'none';
    return;
  }
  
  let total = 0;
  window.currentAdvancesData = res.data; // for printing
  
  tbody.innerHTML = res.data.map(r => {
    total += r.amount || 0;
    return `<tr class="${r.paid_back?'salary-row-highlight':''}">
      <td>${r.emp_name}</td><td style="color:var(--accent);font-weight:700;">${fmt(r.amount)} جنيه</td>
      <td>${r.date}</td><td>${r.notes||'—'}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteAdv(${r.id}, ${r.amount})">حذف</button></td>
    </tr>`;
  }).join('');
  
  document.getElementById('advancesTotal').textContent = fmt(total) + ' جنيه';
  tfoot.style.display = 'table-footer-group';
  document.getElementById('btnAdvPrintA4').style.display = 'inline-block';
  document.getElementById('btnAdvPrintThermal').style.display = 'inline-block';
}

async function payAdvance(id){await window.db.run('UPDATE advances SET paid_back=1 WHERE id=?',[id]);loadAdvances();}

async function deleteAdv(id, amount){
  const confirmDel = await Swal.fire({
    title: 'تأكيد الحذف؟',
    text: 'هل أنت متأكد من حذف هذه السلفة؟ سيتم إرجاع المبلغ إلى الخزينة تلقائياً.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });
  if(!confirmDel.isConfirmed) return;
  
  await window.db.run('DELETE FROM advances WHERE id=?',[id]);
  
  // Restore money to treasury
  await window.db.addTreasuryEntry('إيراد', 'استرداد سلفة محذوفة', amount, 'الخزينة');
  
  showToast('تم حذف السلفة وإرجاع المبلغ للخزينة', 'success');
  loadAdvances();
}

async function printAdvancesReport(mode) {
  const data = window.currentAdvancesData || [];
  if(!data.length) return;
  
  const empSelect = document.getElementById('advFilterEmp');
  const empName = empSelect.options[empSelect.selectedIndex]?.text || 'الكل';
  const from = document.getElementById('advFilterFrom').value || 'البداية';
  const to = document.getElementById('advFilterTo').value || 'الآن';
  
  let total = 0;
  const rowsHtml = data.map(r => {
    total += r.amount || 0;
    return `<tr>
      <td>${r.emp_name}</td>
      <td>${fmt(r.amount)} ج</td>
      <td>${r.date}</td>
      <td>${r.notes || '—'}</td>
    </tr>`;
  }).join('');
  
  const settRes = await window.db.getSettings();
  const companyName = settRes.success && settRes.data ? settRes.data.company_name : 'EL-Tarzy';
  
  let html = '';
  if (mode === 'a4') {
    html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير السلف</title>
    <style>
      @page { size: A4; margin: 20mm; }
      body { font-family: 'Arial', sans-serif; font-size: 14px; color: #000; line-height: 1.6; }
      h1 { text-align:center; font-size: 22px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
      .sub { text-align:center; font-size: 14px; margin-bottom: 20px; color: #444; }
      .filters { display:flex; justify-content:space-between; margin-bottom:20px; font-weight:bold; font-size:13px; border:1px solid #ccc; padding:10px; background:#f9f9f9; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #1B2A4A; color: #fff; padding: 10px; text-align: right; }
      td { padding: 10px; border-bottom: 1px solid #ddd; }
      tr:nth-child(even) td { background: #f8f8f8; }
      .total-row td { background: #e8f5e9; font-weight: bold; font-size: 16px; color: #d32f2f; }
      .footer { text-align:center; margin-top: 40px; font-size: 12px; color: #777; border-top: 1px solid #ddd; padding-top: 10px; }
    </style></head><body>
    <h1>${companyName}</h1>
    <div class="sub">تقرير السلف</div>
    <div class="filters">
      <span>الموظف: ${empName}</span>
      <span>الفترة: من ${from} إلى ${to}</span>
    </div>
    <table>
      <thead><tr><th>الموظف</th><th>المبلغ</th><th>التاريخ</th><th>ملاحظات</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr class="total-row"><td colspan="3">الإجمالي</td><td>${fmt(total)} جنيه</td></tr></tfoot>
    </table>
    <div class="footer">طُبع بواسطة نظام الترزي — ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}</div>
    </body></html>`;
  } else {
    // Thermal
    html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير السلف</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      body { font-family: 'Cairo', monospace; font-size: 11px; color: #000; padding: 4mm; }
      .center { text-align: center; }
      .bold { font-weight: 900; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; margin-top:10px; }
      th { text-align: right; border-bottom:1px solid #000; padding-bottom:3px; }
      td { padding: 3px 0; border-bottom:1px dotted #ccc; font-size:10px; }
      .total { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; color: #000; border: 1px solid #000; padding: 5px; }
    </style></head><body>
    <div class="center bold" style="font-size:16px;">${companyName}</div>
    <div class="center" style="font-size:12px;margin:4px 0;">تقرير السلف</div>
    <div class="line"></div>
    <div style="font-size:10px;">الموظف: ${empName}</div>
    <div style="font-size:10px;">من: ${from} | إلى: ${to}</div>
    <div class="line"></div>
    <table>
      <thead><tr><th>الموظف</th><th>المبلغ</th><th>التاريخ</th></tr></thead>
      <tbody>
        ${data.map(r => `<tr><td>${r.emp_name}</td><td class="bold">${fmt(r.amount)}</td><td>${r.date.split(' ')[0]}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="total">الإجمالي: ${fmt(total)} ج</div>
    <div class="line"></div>
    <div class="center" style="font-size:9px;">نظام الترزي — ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}</div>
    </body></html>`;
  }
  
  let iframe = document.getElementById('printFrame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'printFrame';
    iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 300);
}

// ─── Deductions ───────────────────────────────────────────────────────────────
async function saveDeduction(){
  const empId=document.getElementById('ded_emp').value;const amt=parseFloat(document.getElementById('ded_amount').value);
  const reason=document.getElementById('ded_reason').value.trim();
  if(!empId||!amt||amt<=0){showToast('يرجى تعبئة البيانات','error');return;}
  await window.db.run('INSERT INTO deductions (employee_id,amount,reason) VALUES (?,?,?)',[empId,amt,reason]);
  showToast('تم تسجيل الخصم ','success');document.getElementById('ded_amount').value='';loadDeductions();
}
async function loadDeductions(){
  const res=await window.db.query('SELECT d.*,e.name as emp_name FROM deductions d LEFT JOIN employees e ON d.employee_id=e.id ORDER BY d.id DESC LIMIT 100',[]);
  const tbody=document.getElementById('deductionsBody');
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="5" class="table-empty">لا توجد خصومات</td></tr>';return;}
  tbody.innerHTML=res.data.map(r=>`<tr><td>${r.emp_name}</td><td style="color:var(--danger);font-weight:700;">${fmt(r.amount)} جنيه</td>
    <td>${r.reason||'—'}</td><td>${r.date}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteDed(${r.id})">حذف</button></td></tr>`).join('');
}
async function deleteDed(id){if(!confirm('حذف؟'))return;await window.db.run('DELETE FROM deductions WHERE id=?',[id]);loadDeductions();}

// ─── Incentives ───────────────────────────────────────────────────────────────
async function saveIncentive(){
  const empId=document.getElementById('inc_emp').value;const amt=parseFloat(document.getElementById('inc_amount').value);
  const reason=document.getElementById('inc_reason').value.trim();
  if(!empId||!amt||amt<=0){showToast('يرجى تعبئة البيانات','error');return;}
  await window.db.run('INSERT INTO incentives (employee_id,amount,reason) VALUES (?,?,?)',[empId,amt,reason]);
  showToast('تم تسجيل الحافز ','success');document.getElementById('inc_amount').value='';loadIncentives();
}
async function loadIncentives(){
  const res=await window.db.query('SELECT i.*,e.name as emp_name FROM incentives i LEFT JOIN employees e ON i.employee_id=e.id ORDER BY i.id DESC LIMIT 100',[]);
  const tbody=document.getElementById('incentivesBody');
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="5" class="table-empty">لا توجد حوافز</td></tr>';return;}
  tbody.innerHTML=res.data.map(r=>`<tr><td>${r.emp_name}</td><td style="color:var(--success);font-weight:700;">${fmt(r.amount)} جنيه</td>
    <td>${r.reason||'—'}</td><td>${r.date}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteInc(${r.id})">حذف</button></td></tr>`).join('');
}
async function deleteInc(id){if(!confirm('حذف؟'))return;await window.db.run('DELETE FROM incentives WHERE id=?',[id]);loadIncentives();}

// ─── Custody ──────────────────────────────────────────────────────────────────
async function saveCustody(){
  const empId=document.getElementById('cus_emp').value;const item=document.getElementById('cus_item').value.trim();
  if(!empId||!item){showToast('يرجى تعبئة البيانات','error');return;}
  const qty=parseInt(document.getElementById('cus_qty').value)||1;const notes=document.getElementById('cus_notes').value.trim();
  await window.db.run('INSERT INTO custody (employee_id,item_name,quantity,notes) VALUES (?,?,?,?)',[empId,item,qty,notes]);
  showToast('تم تسجيل العهدة ','success');document.getElementById('cus_item').value='';loadCustody();
}
async function loadCustody(){
  const res = await window.db.query('SELECT c.*,e.name as emp_name FROM custody c LEFT JOIN employees e ON c.employee_id=e.id ORDER BY c.id DESC LIMIT 100',[]);
  const tbody = document.getElementById('custodyBody');
  if(!res.success || !res.data.length){ tbody.innerHTML='<tr><td colspan="6" class="table-empty">لا توجد عهد</td></tr>'; return; }
  tbody.innerHTML = res.data.map(r=>`<tr>
    <td>${r.emp_name}</td>
    <td>${r.item_name}</td>
    <td>${r.quantity||1}</td>
    <td>${r.date||'—'}</td>
    <td>${r.notes||'—'}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteCustody(${r.id})">حذف</button></td>
  </tr>`).join('');
}
async function deleteCustody(id){ if(!confirm('حذف؟'))return; await window.db.run('DELETE FROM custody WHERE id=?',[id]); loadCustody(); }
async function returnCustody(id){
  const today=getLocalISODate();
  await window.db.run('UPDATE custody SET date_returned=? WHERE id=?',[today,id]);
  showToast('تم تسجيل الاسترداد ','success');loadCustody();
}

// ─── Salary ───────────────────────────────────────────────────────────────────
function loadSalaryMonths(){
  const sel=document.getElementById('salaryMonth');
  sel.innerHTML='';
  const now=new Date();
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const val=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const label=d.toLocaleDateString('ar-EG',{year:'numeric',month:'long'});
    sel.innerHTML+=`<option value="${val}">${label}</option>`;
  }
}

async function loadSalaryReport(){
  const month=document.getElementById('salaryMonth').value;
  if(!month) return;
  const [year,mon]=month.split('-');
  const empRes=await window.db.query('SELECT * FROM employees WHERE is_active=1 ORDER BY name',[]);
  if(!empRes.success) return;

  const tbody=document.getElementById('salaryBody');
  let rows='';
  for(const emp of empRes.data){
    const advRes=await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM advances WHERE employee_id=? AND strftime('%Y-%m',date)=? AND paid_back=0`,[emp.id,month]);
    const dedRes=await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM deductions WHERE employee_id=? AND strftime('%Y-%m',date)=?`,[emp.id,month]);
    const incRes=await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM incentives WHERE employee_id=? AND strftime('%Y-%m',date)=?`,[emp.id,month]);
    const paidRes=await window.db.queryOne(`SELECT COALESCE(SUM(net_salary),0) as total_paid, COALESCE(SUM(total_advances),0) as paid_advances FROM salary_payments WHERE employee_id=? AND month=?`,[emp.id,month]);
    
    const commRes = await window.db.queryOne(`SELECT COALESCE(SUM(net_total), 0) as total_sales FROM invoices WHERE tailor_id=? AND strftime('%Y-%m', invoice_date)=?`, [emp.id, month]);
    const returnsRes = await window.db.queryOne(`SELECT COALESCE(SUM(r.total_returned), 0) as total_returned FROM returns r JOIN invoices i ON r.original_invoice_id = i.id WHERE i.tailor_id=? AND strftime('%Y-%m', i.invoice_date)=?`, [emp.id, month]);
    
    const netSales = (commRes.data?.total_sales || 0) - (returnsRes.data?.total_returned || 0);
    const commissionPercent = emp.commission_percent || 0;
    const commission = Math.max(0, netSales) * (commissionPercent / 100);

    // ─── حساب الراتب: يومية أم شهري ───────────────────────────────
    let gross = 0;
    let grossLabel = '';
    const salaryType = emp.salary_type || 'ثابت';
    
    // عدد أيام الحضور الفعلية + دقائق التأخير والزيادة لجميع الموظفين
    const attRes = await window.db.queryOne(
      `SELECT COUNT(DISTINCT date) as days, COALESCE(SUM(late_minutes),0) as late_min, COALESCE(SUM(extra_minutes),0) as extra_min FROM attendance WHERE employee_id=? AND strftime('%Y-%m', date)=?`,
      [emp.id, month]
    );
    const daysWorked  = attRes.data?.days      || 0;
    const totalLateMin      = attRes.data?.late_min  || 0;
    const totalExtraMin     = attRes.data?.extra_min || 0;

    if (salaryType === 'يومية') {
      const dailyRate   = emp.monthly_salary || 0;
      gross = daysWorked * dailyRate;
      grossLabel = `<small style="font-size:10px;color:gray;display:block;">حضور: ${daysWorked} يوم × ${fmt(dailyRate)}</small>`;
    } else {
      gross = emp.monthly_salary || 0;
      grossLabel = `<small style="font-size:10px;color:gray;display:block;">حضور: ${daysWorked} يوم</small>`;
    }

    // Leave Allowance (فقط للمرتب الشهري)
    let leaveBonus = 0;
    let leaveDeduction = 0;
    if (salaryType !== 'يومية') {
      const leavesRes = await window.db.queryOne(`SELECT COUNT(*) as count FROM leaves WHERE employee_id=? AND strftime('%Y-%m', leave_date)=?`, [emp.id, month]);
      const takenLeaves = leavesRes.data?.count || 0;
      const allowance = emp.monthly_leave_days != null ? emp.monthly_leave_days : 2;
      const dayValue = gross / 30;
      if (takenLeaves < allowance) {
        leaveBonus = (allowance - takenLeaves) * dayValue;
      } else if (takenLeaves > allowance) {
        leaveDeduction = (takenLeaves - allowance) * dayValue;
      }
    }

    const advances  = (advRes.data?.total||0) + (paidRes.data?.paid_advances || 0);
    const manualDed = dedRes.data?.total||0;
    const manualInc = incRes.data?.total||0;
    
    const ded = manualDed + leaveDeduction;
    const inc = manualInc + leaveBonus;
    
    const totalDue  = gross + commission - advances - ded + inc;
    const totalPaid = paidRes.data?.total_paid || 0;
    const net  = totalDue - totalPaid;
    const paid = net <= 0 && totalPaid > 0 && Math.abs(net) < 0.01;

    // overtime label to show under gross
    const overtimeSuffix = (totalLateMin > 0 || totalExtraMin > 0)
      ? `<small style="font-size:9px;display:block;color:var(--warning);">تأخير: ${totalLateMin} دق | إضافي: ${totalExtraMin} دق</small>`
      : '';

    rows+=`<tr class="${paid?'salary-row-highlight':''}">
      <td style="font-weight:600;">${emp.name} ${salaryType==='يومية'?'<span class="badge badge-warning" style="font-size:9px;">يومية</span>':''}</td>
      <td style="color:var(--accent);">${fmt(gross)}${grossLabel}${overtimeSuffix}</td>
      <td style="color:#8b5cf6; font-weight:bold;">${fmt(commission)} ${commissionPercent > 0 ? `<small style="font-size:10px;color:gray;">(%${commissionPercent})</small>` : ''}</td>
      <td style="color:var(--warning);">${fmt(advances)}</td>
      <td style="color:var(--danger);">${fmt(ded)}</td>
      <td style="color:var(--success);">${fmt(inc)}</td>
      <td style="font-weight:700;font-size:15px; color:${net<0?'var(--danger)':'inherit'};" dir="ltr">${fmt(net)}</td>
      <td>${paid?'<span class="badge badge-success">مُسدد بالكامل</span>':(totalPaid > 0 ? `<span class="badge badge-warning">مدفوع ${fmt(totalPaid)}</span>` : (net < 0 ? '<span class="badge badge-danger">مدين للشركة</span>' : '<span class="badge badge-warning">لم يُصرف</span>'))}</td>
      <td>${(totalPaid > 0) ? `<button class="btn btn-sm btn-danger" onclick="reverseSalaryPayment(${emp.id},'${month}')">إلغاء الصرف</button>` : ((net <= 0) ? '' : `<button class="btn btn-sm btn-success" onclick="paySalary(${emp.id},'${emp.name}',${gross},${advances},${ded},${inc},${net},'${month}','${salaryType}',${emp.monthly_salary||0},${emp.work_hours_per_day||8},${totalLateMin},${totalExtraMin})">صرف الراتب</button>`)}</td>
    </tr>`;
  }
  tbody.innerHTML = rows || '<tr><td colspan="9" class="table-empty">لا يوجد موظفون</td></tr>';
}

let pendingSalary = null;
let _payEmpData   = {}; // extra employee data for overtime calc

function paySalary(empId, name, gross, advances, ded, inc, net, month, salaryType, dailyRate, workHours, totalLateMin, totalExtraMin){
  pendingSalary = { employee_id: empId, month, gross_salary: gross, total_advances: advances, deductions: ded, incentives: inc, net_salary: net };
  _payEmpData   = { salaryType, dailyRate: dailyRate||0, workHours: workHours||8, totalLateMin: totalLateMin||0, totalExtraMin: totalExtraMin||0 };

  // Summary header
  document.getElementById('salaryPaySummary').innerHTML = `
    <div style="font-size:32px;margin-bottom:8px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--success);"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8v2m0 8v2m9-6a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
    <div style="font-size:15px;font-weight:700;color:var(--primary);">${name}</div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${month}</div>
    <div style="margin-top:10px;font-size:20px;font-weight:900;color:var(--success);">${fmt(net)} جنيه</div>
    <div style="font-size:11px;color:var(--text-muted);">الصافي المتبقي المستحق</div>
  `;

  // Show/hide overtime section
  const overtimeSection = document.getElementById('overtime_section');
  if(totalLateMin > 0 || totalExtraMin > 0){
    overtimeSection.style.display = 'block';
    
    let defaultHourlyRate = 0;
    if (salaryType === 'يومية') {
      defaultHourlyRate = workHours > 0 ? (dailyRate / workHours) : 0;
    } else {
      defaultHourlyRate = workHours > 0 ? ((dailyRate / 30) / workHours) : 0;
    }
    
    document.getElementById('pay_hourly_rate').value = defaultHourlyRate.toFixed(2);

    const lateRow  = document.getElementById('late_row');
    const extraRow = document.getElementById('extra_row');
    if(totalLateMin > 0){
      lateRow.style.display  = 'block';
      document.getElementById('pay_late_label').textContent = totalLateMin;
    } else lateRow.style.display = 'none';
    if(totalExtraMin > 0){
      extraRow.style.display = 'block';
      document.getElementById('pay_extra_label').textContent = totalExtraMin;
    } else extraRow.style.display = 'none';

    document.getElementById('pay_deduct_late').checked = false;
    document.getElementById('pay_add_extra').checked   = false;
    recalcOvertimeDue();
  } else {
    overtimeSection.style.display = 'none';
  }

  // Default amounts
  document.getElementById('payPartialAmount').max   = net;
  document.getElementById('payPartialAmount').value = net.toFixed(2);
  document.getElementById('payCashAmount').value    = net.toFixed(2);
  document.getElementById('payVodafoneAmount').value= '0';
  document.getElementById('payInstapayAmount').value= '0';
  document.getElementById('paySplitHint').textContent = '';

  document.getElementById('payPartialAmount').oninput = function(){
    const total = parseFloat(this.value)||0;
    document.getElementById('payCashAmount').value   = total.toFixed(2);
    document.getElementById('payVodafoneAmount').value = '0';
    document.getElementById('payInstapayAmount').value = '0';
    document.getElementById('paySplitHint').textContent = '';
  };

  document.getElementById('confirmPayBtn').onclick = async () => {
    let totalToPay = parseFloat(document.getElementById('payPartialAmount').value)||0;
    const cashAmt     = parseFloat(document.getElementById('payCashAmount').value)||0;
    const vodafoneAmt = parseFloat(document.getElementById('payVodafoneAmount').value)||0;
    const instapayAmt = parseFloat(document.getElementById('payInstapayAmount').value)||0;

    if(totalToPay <= 0){ showToast('يرجى إدخال مبلغ صحيح','error'); return; }

    const splitTotal = cashAmt + vodafoneAmt + instapayAmt;
    if(Math.abs(splitTotal - totalToPay) > 0.01){
      showToast(`مجموع التقسيم (${fmt(splitTotal)}) لا يساوي المبلغ المراد صرفه (${fmt(totalToPay)})`, 'error');
      return;
    }

    const salaryData = { ...pendingSalary, net_salary: totalToPay, cash_amount: cashAmt, vodafone_amount: vodafoneAmt, instapay_amount: instapayAmt };
    const res = await window.db.paySalary(salaryData);
    if(res.success){
      const partialNote = totalToPay < net ? ` (${fmt(totalToPay)} جنيه من أصل ${fmt(net)})` : '';
      showToast(`تم صرف راتب ${name}${partialNote} ✅`,'success');
      closeModal('salaryConfirmModal');
      loadSalaryReport();
    } else showToast('خطأ: '+res.error,'error');
  };
  openModal('salaryConfirmModal');
}

function recalcOvertimeDue(){
  const hourlyRate   = parseFloat(document.getElementById('pay_hourly_rate').value)||0;
  const deductLate   = document.getElementById('pay_deduct_late')?.checked;
  const addExtra     = document.getElementById('pay_add_extra')?.checked;
  const lateMin      = _payEmpData.totalLateMin  || 0;
  const extraMin     = _payEmpData.totalExtraMin || 0;
  const lateVal      = (lateMin  / 60) * hourlyRate;
  const extraVal     = (extraMin / 60) * hourlyRate;

  document.getElementById('pay_late_val').textContent  = fmt(lateVal);
  document.getElementById('pay_extra_val').textContent = fmt(extraVal);

  let baseNet = pendingSalary?.net_salary || 0;
  // Re-read the original net from pendingSalary (before any late/extra adjustment)
  let adjustedNet = baseNet;
  if(deductLate)  adjustedNet -= lateVal;
  if(addExtra)    adjustedNet += extraVal;

  document.getElementById('payPartialAmount').value   = adjustedNet.toFixed(2);
  document.getElementById('payCashAmount').value      = adjustedNet.toFixed(2);
  document.getElementById('payVodafoneAmount').value  = '0';
}

async function reverseSalaryPayment(empId, month) {
  if (!confirm('هل أنت متأكد من إلغاء صرف الراتب لهذا الشهر؟ سيتم إرجاع المبلغ للخزينة وتصفير السلف مرة أخرى.')) return;
  
  const res = await window.db.reverseSalaryPayment(empId, month);
  if (res.success) {
    showToast('تم إلغاء صرف الراتب بنجاح', 'success');
    loadSalaryReport();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

function syncPaySplit(changedField){
  const total = parseFloat(document.getElementById('payPartialAmount').value)||0;
  const cashEl = document.getElementById('payCashAmount');
  const vodafoneEl = document.getElementById('payVodafoneAmount');
  const instapayEl = document.getElementById('payInstapayAmount');
  const hint = document.getElementById('paySplitHint');
  
  // We won't auto-calculate with 3 fields, just show the sum validation
  const cash = parseFloat(cashEl.value)||0;
  const vodafone = parseFloat(vodafoneEl.value)||0;
  const instapay = parseFloat(instapayEl.value)||0;
  
  const splitTotal = cash + vodafone + instapay;
  if(Math.abs(splitTotal - total) > 0.01){
    hint.textContent = `⚠️ مجموع التقسيم: ${fmt(splitTotal)} | المطلوب: ${fmt(total)}`;
    hint.style.color = 'var(--danger)';
  } else {
    hint.textContent = `✅ التقسيم صحيح`;
    hint.style.color = 'var(--success)';
  }
}

// ─── Employee Sales ───────────────────────────────────────────────────────────
async function loadEmpSales(){
  const empId=document.getElementById('empSalesEmp').value;
  const from=document.getElementById('empSalesFrom').value;
  const to=document.getElementById('empSalesTo').value;
  
  let sql=`SELECT i.*,c.name as customer_name,
           (i.net_total - COALESCE((SELECT SUM(total_returned) FROM returns WHERE original_invoice_id = i.id), 0)) as dynamic_net_total
           FROM invoices i LEFT JOIN customers c ON i.customer_id=c.id WHERE i.invoice_date BETWEEN ? AND ?`;
  let params=[from||'2000-01-01',to||'2099-12-31'];
  if(empId){sql+=' AND (i.employee_id=? OR i.tailor_id=?)';params.push(empId, empId);}
  sql+=' ORDER BY i.id DESC';
  
  const res=await window.db.query(sql,params);
  
  // Fetch returns as well
  let retSql = `SELECT r.*, i.invoice_number, c.name as customer_name 
                FROM returns r 
                JOIN invoices i ON r.original_invoice_id = i.id 
                LEFT JOIN customers c ON i.customer_id = c.id 
                WHERE r.return_date BETWEEN ? AND ?`;
  let retParams = [from||'2000-01-01',to||'2099-12-31'];
  if(empId){retSql+=' AND (i.employee_id=? OR i.tailor_id=?)';retParams.push(empId, empId);}
  retSql+=' ORDER BY r.id DESC';
  
  const retRes = await window.db.query(retSql, retParams);
  
  const tbody=document.getElementById('empSalesBody');
  const hasSales = res.success && res.data.length > 0;
  const hasReturns = retRes.success && retRes.data.length > 0;
  
  if(!hasSales && !hasReturns){
    tbody.innerHTML='<tr><td colspan="6" class="table-empty">لا توجد حركات</td></tr>';
    document.getElementById('empSalesFoot').style.display='none';
    return;
  }
  
  let rowsHtml = '';
  let totals = {t:0, p:0, rem:0};
  
  if (hasSales) {
    rowsHtml += res.data.map(r=>{
      totals.t += (r.dynamic_net_total||0);
      totals.p += (r.amount_paid||0);
      totals.rem += (r.remaining||0);
      return `<tr>
        <td style="font-weight:700;">${r.invoice_number}</td>
        <td>${r.customer_name||'عميل نقدي'}</td><td>${r.invoice_date}</td>
        <td style="color:var(--accent);font-weight:700;">${fmt(r.dynamic_net_total)}</td>
        <td style="color:var(--success);">${fmt(r.amount_paid)}</td>
        <td style="color:var(--danger);">${fmt(r.remaining)}</td>
      </tr>`;
    }).join('');
  }
  
  if (hasReturns) {
    rowsHtml += retRes.data.map(r=>{
      // Returns are already deducted from dynamic_net_total of the invoice,
      // so we don't subtract them from totals.t again. We just display them for info.
      return `<tr class="bg-red-50">
        <td style="font-weight:700;color:var(--danger);">مرتجع لـ ${r.invoice_number}</td>
        <td>${r.customer_name||'عميل نقدي'}</td><td>${r.return_date}</td>
        <td style="color:var(--danger);font-weight:700;">-${fmt(r.total_returned)}</td>
        <td style="color:var(--danger);">-</td>
        <td style="color:var(--danger);">-</td>
      </tr>`;
    }).join('');
  }
  
  tbody.innerHTML = rowsHtml;
  document.getElementById('empSalesTotal').textContent=fmt(totals.t);
  document.getElementById('empSalesPaid').textContent=fmt(totals.p);
  document.getElementById('empSalesRemaining').textContent=fmt(totals.rem);
  document.getElementById('empSalesFoot').style.display='';
}



// ─── Admin Check & Quit ───────────────────────────────────────────────────────
async function checkAdmin() {
  const role = sessionStorage.getItem('elTarzy_role');
  if (role !== 'admin') {
    showToast('هذه الصفحة متاحة للمدير فقط', 'error');
    setTimeout(() => goBack(), 1000);
    return false;
  }
  return true;
}

window.electron.onConfirmBackupBeforeQuit(() => {
  Swal.fire({
    title: 'إغلاق البرنامج', text: 'هل تريد إنشاء نسخة احتياطية قبل الخروج؟', icon: 'question',
    showDenyButton: true, showCancelButton: true, confirmButtonText: 'نسخ وخروج', denyButtonText: 'خروج بدون نسخة', cancelButtonText: 'إلغاء'
  }).then((r) => {
    if (r.isConfirmed) window.electron.quitWithBackup();
    else if (r.isDenied) window.electron.quitWithoutBackup();
    else window.electron.cancelQuit();
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
if (checkAdmin()) {
  loadEmployees();
}