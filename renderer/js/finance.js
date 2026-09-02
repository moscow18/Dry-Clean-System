

const sectionTitles={'expenses':'المصروفات','revenues':'الإيرادات الأخرى','treasury':'الخزينة','vodafone':'فودافون كاش','instapay':'إنستا باي','customers-accounts':'حسابات العملاء','suppliers-accounts':'حسابات الموردين','stats':'إحصائيات مهمة'};

window.finCache = window.finCache || {};

function showSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.fin-nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('section-'+name).classList.add('active');
  document.querySelectorAll('.fin-nav-btn').forEach(b=>{ if(b.onclick&&b.onclick.toString().includes(`'${name}'`)) b.classList.add('active'); });
  document.getElementById('finSectionTitle').textContent=sectionTitles[name]||name;
  
  if (!window.finCache[name]) {
    if(name==='expenses'){loadExpenseTypes();loadExpenses();loadEmpSelect('exp_emp');}
    if(name==='revenues'){loadRevenues();loadEmpSelect('rev_emp');}
    if(name==='treasury') loadTreasury('الخزينة');
    if(name==='vodafone') loadTreasury('فودافون كاش');
    if(name==='instapay') loadTreasury('إنستا باي');
    if(name==='customers-accounts') loadCustomerAccounts();
    if(name==='suppliers-accounts') loadSupplierAccounts();
    if(name==='stats') loadStats();
    window.finCache[name] = true;
  }
}

function applyFilter(){
  window.finCache = {};
  loadExpenses();
  loadRevenues();
  loadTreasury('الخزينة');
}

function printCurrentSection(mode) {
  const activeSection = document.querySelector('.section.active').id.replace('section-', '');
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const period = (from && to) ? `من ${from} إلى ${to}` : (from ? `من ${from}` : (to ? `إلى ${to}` : 'كل الفترات'));
  const isA4 = mode === 'a4';

  let data = [];
  let title = '';
  let thHtml = '';
  let tdHtmlFn = null;
  let totalHtmlFn = null;
  let thermalRowFn = null;
  let totalLabel = 'الإجمالي';

  if (activeSection === 'expenses') {
    data = window._currentExpensesData;
    title = 'تقرير المصروفات';
    thHtml = '<th>نوع المصروف</th><th>المبلغ</th><th>التاريخ</th><th>الوقت</th><th>البيان</th><th>الموظف</th><th>المصدر</th>';
    tdHtmlFn = r => `<td>${r.type_name||'—'}</td><td style="color:red;font-weight:700;">${Number(r.amount||0).toFixed(2)} ج</td><td>${r.date}</td><td>${r.time||'—'}</td><td>${r.description||'—'}</td><td>${r.emp_name||'—'}</td><td>${r.payment_source||'خزينة'}</td>`;
    const total = data ? data.reduce((s,r)=>s+(r.amount||0),0) : 0;
    totalHtmlFn = () => `<tr class="total-row"><td colspan="1">الإجمالي</td><td colspan="6" style="color:red;">${Number(total).toFixed(2)} جنيه</td></tr>`;
    thermalRowFn = r => `<div class="row"><span>${r.type_name||'—'} | ${r.date}</span><span class="bold">${Number(r.amount||0).toFixed(2)} ج</span></div>${r.description?`<div class="desc">${r.description}</div>`:''}`;
    totalLabel = `الإجمالي: ${Number(total).toFixed(2)} جنيه`;
  } else if (activeSection === 'revenues') {
    data = window._currentRevenuesData;
    title = 'تقرير الإيرادات';
    thHtml = '<th>البيان</th><th>المبلغ</th><th>التاريخ</th><th>الموظف</th>';
    tdHtmlFn = r => `<td>${r.description||'—'}</td><td style="color:green;font-weight:700;">${Number(r.amount||0).toFixed(2)} ج</td><td>${r.date}</td><td>${r.emp_name||'—'}</td>`;
    const total = data ? data.reduce((s,r)=>s+(r.amount||0),0) : 0;
    totalHtmlFn = () => `<tr class="total-row"><td colspan="1">الإجمالي</td><td colspan="3" style="color:green;">${Number(total).toFixed(2)} جنيه</td></tr>`;
    thermalRowFn = r => `<div class="row"><span>${r.description||'—'} | ${r.date}</span><span class="bold">${Number(r.amount||0).toFixed(2)} ج</span></div>`;
    totalLabel = `الإجمالي: ${Number(total).toFixed(2)} جنيه`;
  } else if (activeSection === 'treasury' || activeSection === 'vodafone' || activeSection === 'instapay') {
    data = window._currentTreasuryData;
    title = `تقرير ${activeSection === 'vodafone' ? 'فودافون كاش' : activeSection === 'instapay' ? 'إنستا باي' : 'الخزينة'}`;
    thHtml = '<th>النوع</th><th>البيان</th><th>المبلغ</th><th>الرصيد بعد</th><th>التاريخ</th><th>الوقت</th>';
    tdHtmlFn = r => `<td>${r.type}</td><td>${r.description||'—'}</td><td style="font-weight:700;">${Number(r.amount||0).toFixed(2)} ج</td><td>${Number(r.balance_after||0).toFixed(2)} ج</td><td>${r.date}</td><td>${r.time||'—'}</td>`;
    totalHtmlFn = () => '';
    thermalRowFn = r => `<div class="row"><span>${r.type} | ${r.date}</span><span class="bold">${Number(r.amount||0).toFixed(2)} ج</span></div><div class="desc">${r.description||''}</div>`;
    totalLabel = '';
  } else if (activeSection === 'customers-accounts') {
    data = window._currentCustomerAccountsData;
    title = 'تقرير حسابات العملاء';
    thHtml = '<th>العميل</th><th>التليفون</th><th>الرصيد الافتتاحي</th><th>الرصيد الحالي</th>';
    tdHtmlFn = r => `<td>${r.name}</td><td>${r.phone||'—'}</td><td>${Number(r.opening_balance||0).toFixed(2)} ج</td><td style="font-weight:700;">${Number(r.current_balance||0).toFixed(2)} ج</td>`;
    const total = data ? data.reduce((s,r)=>s+(r.current_balance||0),0) : 0;
    totalHtmlFn = () => `<tr class="total-row"><td colspan="3">إجمالي المديونيات</td><td colspan="1">${Number(total).toFixed(2)} جنيه</td></tr>`;
    thermalRowFn = r => `<div class="row"><span>${r.name}</span><span class="bold">${Number(r.current_balance||0).toFixed(2)} ج</span></div>`;
    totalLabel = `المديونيات: ${Number(total).toFixed(2)} جنيه`;
  } else if (activeSection === 'suppliers-accounts') {
    data = window._currentSupplierAccountsData;
    title = 'تقرير حسابات الموردين';
    thHtml = '<th>المورد</th><th>التليفون</th><th>الرصيد الافتتاحي</th><th>الرصيد الحالي</th>';
    tdHtmlFn = r => `<td>${r.name}</td><td>${r.phone||'—'}</td><td>${Number(r.opening_balance||0).toFixed(2)} ج</td><td style="font-weight:700;">${Number(r.current_balance||0).toFixed(2)} ج</td>`;
    const total = data ? data.reduce((s,r)=>s+(r.current_balance||0),0) : 0;
    totalHtmlFn = () => `<tr class="total-row"><td colspan="3">إجمالي المديونيات</td><td colspan="1">${Number(total).toFixed(2)} جنيه</td></tr>`;
    thermalRowFn = r => `<div class="row"><span>${r.name}</span><span class="bold">${Number(r.current_balance||0).toFixed(2)} ج</span></div>`;
    totalLabel = `المديونيات: ${Number(total).toFixed(2)} جنيه`;
  } else {
    showToast('لا يوجد بيانات للطباعة في هذا القسم', 'warning');
    return;
  }

  if(!data || !data.length){ showToast('لا توجد بيانات للطباعة','warning'); return; }

  let html = '';
  if(isA4){
    html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #000; direction: rtl; }
      h1 { text-align:center; font-size:18px; border-bottom:2px solid #1B2A4A; padding-bottom:8px; margin-bottom:6px; color:#1B2A4A; }
      .sub { text-align:center; font-size:11px; color:#555; margin-bottom:14px; }
      table { width:100%; border-collapse:collapse; }
      th { background:#1B2A4A; color:#fff; padding:7px 10px; text-align:right; font-size:11px; }
      td { padding:6px 10px; border-bottom:1px solid #e5e7eb; font-size:11px; }
      tr:nth-child(even) td { background:#f9fafb; }
      .total-row td { font-weight:900; background:#fef3c7; font-size:13px; }
      .footer { text-align:center; margin-top:20px; font-size:10px; color:#888; border-top:1px solid #ddd; padding-top:8px; }
    </style></head><body>
    <h1>EL-Tarzy — الترزي</h1>
    <div class="sub">${title} — ${period}</div>
    <table>
      <thead><tr>${thHtml}</tr></thead>
      <tbody>
        ${data.map(r=>`<tr>${tdHtmlFn(r)}</tr>`).join('')}
        ${totalHtmlFn()}
      </tbody>
    </table>
    <div class="footer">طُبع من نظام إدارة الترزي — ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}</div>
    </body></html>`;
  } else {
    html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      body { font-family: 'Arial', sans-serif; font-size: 14px; color: #000; direction: rtl; padding: 3mm 2mm; }
      .center { text-align:center; }
      .bold { font-weight:900; }
      .line { border-top:1px dashed #000; margin:5px 0; }
      .row { display:flex; justify-content:space-between; margin:4px 0; font-size:13px; }
      .row span:first-child { max-width:55%; word-break:break-word; }
      .desc { font-size:11px; color:#444; padding-right:4px; margin-bottom:3px; }
      .total { font-size:16px; font-weight:900; text-align:center; margin:6px 0; }
    </style></head><body>
    <div class="center bold" style="font-size:18px;margin-bottom:3px;">EL-Tarzy</div>
    <div class="center" style="font-size:13px;">${title}</div>
    <div class="center" style="font-size:12px;margin-bottom:4px;">${period}</div>
    <div class="line"></div>
    ${data.map(r=>thermalRowFn(r)).join('')}
    <div class="line"></div>
    ${totalLabel ? `<div class="total">${totalLabel}</div><div class="line"></div>` : ''}
    <div class="center" style="font-size:11px;margin-top:4px;">نظام الترزي — ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}</div>
    </body></html>`;
  }

  let iframe = document.getElementById('expPrintFrame');
  if(!iframe){
    iframe = document.createElement('iframe');
    iframe.id = 'expPrintFrame';
    iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(()=>{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 350);
}

async function loadEmpSelect(selId){
  const res=await window.db.query('SELECT id,name FROM employees WHERE is_active=1 ORDER BY name',[]);
  const sel=document.getElementById(selId);
  sel.innerHTML='<option value="">—</option>';
  if(res.success) res.data.forEach(e=>sel.innerHTML+=`<option value="${e.id}">${e.name}</option>`);
}

// ─── Expense Types ────────────────────────────────────────────────────────────
async function loadExpenseTypes(){
  const res=await window.db.query('SELECT * FROM expense_types ORDER BY name',[]);
  const sel=document.getElementById('exp_type');
  sel.innerHTML='<option value="">اختر النوع</option>';
  const list=document.getElementById('expenseTypesList');
  if(!res.success){list.innerHTML='';return;}
  res.data.forEach(t=>{
    sel.innerHTML+=`<option value="${t.id}">${t.name}</option>`;
  });
  list.innerHTML=res.data.map(t=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid var(--border);border-radius:5px;margin-bottom:5px;">
      <span style="font-size:13px;font-weight:600;">${t.name}</span>
      <button class="btn btn-sm btn-danger" onclick="deleteExpenseType(${t.id})" style="padding:0 8px;height:24px;font-size:11px;">حذف</button>
    </div>`).join('');
}
async function addExpenseType(){
  const name=document.getElementById('newTypeName').value.trim();
  if(!name){showToast('يرجى إدخال اسم النوع','error');return;}
  const res=await window.db.run('INSERT INTO expense_types (name) VALUES (?)',[name]);
  if(res.success){document.getElementById('newTypeName').value='';loadExpenseTypes();showToast('تم الإضافة ','success');}
  else showToast('خطأ: '+res.error,'error');
}
async function deleteExpenseType(id){
  if(!confirm('هل تريد حذف هذا النوع؟')) return;
  await window.db.run('DELETE FROM expense_types WHERE id=?',[id]);
  loadExpenseTypes();
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
async function saveExpense(){
  const typeId=document.getElementById('exp_type').value;const amt=parseFloat(document.getElementById('exp_amount').value);
  if(!typeId||!amt||amt<=0){showToast('يرجى اختيار النوع وإدخال المبلغ','error');return;}
  const typeEl=document.getElementById('exp_type');const typeName=typeEl.options[typeEl.selectedIndex].text;
  const desc=document.getElementById('exp_desc').value.trim();const empId=document.getElementById('exp_emp').value;
  const source=document.getElementById('exp_source').value;
  const today=getLocalISODate();const time=new Date().toTimeString().slice(0,5);
  const shiftId=sessionStorage.getItem('elTarzy_shiftId');
  const res=await window.db.run('INSERT INTO expenses (type_id,type_name,amount,description,employee_id,payment_source,date,time,shift_id) VALUES (?,?,?,?,?,?,?,?,?)',
    [typeId,typeName,amt,desc,empId||null,source,today,time,shiftId?parseInt(shiftId):null]);
  if(res.success){
    await window.db.addTreasuryEntry('مصروف',typeName+': '+desc,amt,source==='فودافون كاش'?'فودافون كاش':(source==='إنستا باي'?'إنستا باي':'الخزينة'));
    showToast(`تم تسجيل مصروف ${fmt(amt)} جنيه `,'success');
    document.getElementById('exp_amount').value='';document.getElementById('exp_desc').value='';
    loadExpenses();
  } else showToast('خطأ: '+res.error,'error');
}

async function loadExpenses(){
  const from=document.getElementById('filterFrom').value;const to=document.getElementById('filterTo').value;
  const q=document.getElementById('expSearch').value.trim();
  let sql='SELECT e.*,emp.name as emp_name FROM expenses e LEFT JOIN employees emp ON e.employee_id=emp.id WHERE 1=1';
  let params=[];
  if(q){
    sql+=' AND (e.type_name LIKE ? OR e.description LIKE ?)';params.push(`%${q}%`,`%${q}%`);
  }
  if(from){sql+=' AND e.date>=?';params.push(from);}
  if(to){sql+=' AND e.date<=?';params.push(to);}
  sql+=' ORDER BY e.id DESC LIMIT 200';
  const res=await window.db.query(sql,params);
  const tbody=document.getElementById('expensesBody');
  const role = sessionStorage.getItem('elTarzy_role');
  const isAdmin = role === 'admin';
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="8" class="table-empty">لا توجد مصروفات</td></tr>';document.getElementById('expensesFoot').style.display='none';return;}
  // Save current data for printing
  window._currentExpensesData = res.data;
  tbody.innerHTML=res.data.map(r=>`<tr>
    <td><span class="badge badge-danger">${r.type_name||'—'}</span></td>
    <td style="font-weight:700;color:var(--danger);">${fmt(r.amount)}</td>
    <td>${r.date}</td><td style="color:var(--text-muted);">${r.time||'—'}</td>
    <td>${r.description||'—'}</td><td>${r.emp_name||'—'}</td>
    <td><span class="badge ${r.payment_source==='فودافون كاش'?'badge-info':(r.payment_source==='إنستا باي'?'badge-accent':'badge-success')}">${r.payment_source||'خزينة'}</span></td>
    <td>${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteExpense(${r.id})">حذف</button>` : '—'}</td>
  </tr>`).join('');
  const total=res.data.reduce((s,r)=>s+(r.amount||0),0);
  document.getElementById('expensesTotal').textContent=fmt(total)+' جنيه';
  document.getElementById('expensesFoot').style.display='';
}
async function deleteExpense(id){
  // Only admin can delete
  const role = sessionStorage.getItem('elTarzy_role');
  if(role !== 'admin'){ showToast('الحذف متاح للمدير فقط','error'); return; }
  if(!confirm('هل تريد حذف هذا المصروف؟ سيتم إرجاع المبلغ للخزينة.'))return;
  const expRes = await window.db.queryOne('SELECT amount, payment_source, type_name, description FROM expenses WHERE id=?', [id]);
  if(expRes.success && expRes.data) {
    const exp = expRes.data;
    // Normalize: 'خزينة' (بدون ال) → 'الخزينة'، 'فودافون كاش' تفضل كما هي
    let refundTreasury = exp.payment_source || 'الخزينة';
    if (refundTreasury === 'خزينة') refundTreasury = 'الخزينة';
    if (refundTreasury === 'بنك') refundTreasury = 'الخزينة'; // البنك مش خزنة منفصلة
    await window.db.addTreasuryEntry('إيراد', `استرداد مصروف محذوف: ${exp.type_name||''} - ${exp.description||''}`, exp.amount, refundTreasury);
    await window.db.run('DELETE FROM expenses WHERE id=?',[id]);
    loadExpenses();
    const src = refundTreasury === 'فودافون كاش' ? 'فودافون كاش' : (refundTreasury === 'إنستا باي' ? 'إنستا باي' : 'الخزينة');
    showToast('تم الحذف واسترداد ' + fmt(exp.amount) + ' جنيه من ' + src + ' ✅','success');
  } else {
    showToast('حدث خطأ أثناء استرجاع بيانات المصروف', 'error');
  }
}

// ─── Revenues ─────────────────────────────────────────────────────────────────
async function saveRevenue(){
  const desc=document.getElementById('rev_desc').value.trim();const amt=parseFloat(document.getElementById('rev_amount').value);
  if(!desc||!amt||amt<=0){showToast('يرجى إدخال البيان والمبلغ','error');return;}
  const empId=document.getElementById('rev_emp').value;
  const today=getLocalISODate();
  const res=await window.db.run('INSERT INTO revenues (description,amount,date,employee_id) VALUES (?,?,?,?)',[desc,amt,today,empId||null]);
  if(res.success){
    await window.db.addTreasuryEntry('إيراد',desc,amt,'الخزينة');
    showToast('تم تسجيل الإيراد ','success');
    document.getElementById('rev_desc').value='';document.getElementById('rev_amount').value='';
    loadRevenues();
  } else showToast('خطأ: '+res.error,'error');
}
async function loadRevenues(){
  const from=document.getElementById('filterFrom').value;
  const to=document.getElementById('filterTo').value;
  let sql='SELECT r.*,e.name as emp_name FROM revenues r LEFT JOIN employees e ON r.employee_id=e.id WHERE 1=1';
  let params=[];
  if(from){sql+=' AND r.date>=?';params.push(from);}
  if(to){sql+=' AND r.date<=?';params.push(to);}
  sql+=' ORDER BY r.id DESC LIMIT 100';
  const res=await window.db.query(sql,params);
  const tbody=document.getElementById('revenuesBody');
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="5" class="table-empty">لا توجد إيرادات</td></tr>';return;}
  window._currentRevenuesData = res.data;
  tbody.innerHTML=res.data.map(r=>`<tr>
    <td style="font-weight:600;">${r.description||'—'}</td>
    <td style="color:var(--success);font-weight:700;">${fmt(r.amount)}</td>
    <td>${r.date}</td><td>${r.emp_name||'—'}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteRevenue(${r.id})">حذف</button></td>
  </tr>`).join('');
}
async function deleteRevenue(id){if(!confirm('حذف؟'))return;await window.db.run('DELETE FROM revenues WHERE id=?',[id]);loadRevenues();}

// ─── Treasury ─────────────────────────────────────────────────────────────────
async function loadTreasury(type='الخزينة'){
  const isVodafone=type==='فودافون كاش';
  const isInstapay=type==='إنستا باي';
  const balRes=await window.db.getTreasuryBalance(type);
  if(balRes.success){
    const balEl=document.getElementById(isVodafone?'vodafoneBalance':(isInstapay?'instapayBalance':'treasuryBalance1'));
    if(balEl) balEl.textContent=Number(balRes.data).toLocaleString('en-US')+' جنيه';
  }
  const from=document.getElementById('filterFrom').value;
  const to=document.getElementById('filterTo').value;
  let sql='SELECT * FROM treasury WHERE treasury_type=?';
  let params=[type];
  if(from){sql+=' AND date>=?';params.push(from);}
  if(to){sql+=' AND date<=?';params.push(to);}
  sql+=' ORDER BY id DESC LIMIT 200';
  const res=await window.db.query(sql,params);
  const bodyId=isVodafone?'vodafoneBody':(isInstapay?'instapayBody':'treasuryBody');
  const tbody=document.getElementById(bodyId);
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="6" class="table-empty">لا توجد حركات</td></tr>';return;}
  window._currentTreasuryData = res.data;
  window._currentTreasuryType = type;
  if(!isVodafone && !isInstapay){
    const inc=res.data.filter(r=>r.type==='إيراد').reduce((s,r)=>s+(r.amount||0),0);
    const exp=res.data.filter(r=>r.type!=='إيراد').reduce((s,r)=>s+(r.amount||0),0);
    const incEl=document.getElementById('treasuryIncome');const expEl=document.getElementById('treasuryExpenses');
    if(incEl) incEl.textContent=Number(inc).toLocaleString('en-US')+' جنيه';
    if(expEl) expEl.textContent=Number(exp).toLocaleString('en-US')+' جنيه';
  }
  tbody.innerHTML=res.data.map(r=>`<tr>
    <td><span class="badge ${r.type==='إيراد'?'badge-success':'badge-danger'}">${r.type}</span></td>
    <td>${r.description||'—'}</td>
    <td style="font-weight:700;color:${r.type==='إيراد'?'var(--success)':'var(--danger)'};">${fmt(r.amount)}</td>
    <td style="color:var(--primary);font-weight:600;">${fmt(r.balance_after)}</td>
    <td>${r.date}</td><td style="color:var(--text-muted);">${r.time||'—'}</td>
  </tr>`).join('');
}

// ─── Customer Accounts ────────────────────────────────────────────────────────
// ─── Treasury Manual Entry (Admin Only) ─────────────────────────────────────────
async function saveTreasuryManual(){
  const type = document.getElementById('tr_type').value;
  const treasury = document.getElementById('tr_treasury').value;
  const amount = parseFloat(document.getElementById('tr_amount').value);
  const desc = document.getElementById('tr_desc').value.trim();
  if(!amount || amount <= 0){ showToast('يرجى إدخال مبلغ صحيح', 'error'); return; }
  if(!desc){ showToast('يرجى كتابة بيان العملية', 'error'); return; }
  await window.db.addTreasuryEntry(type, desc, amount, treasury);
  const label = type === 'إيراد' ? 'إيداع' : 'سحب';
  showToast(`تم تسجيل ${label}: ${amount} جنيه من ${treasury} ✅`, 'success');
  document.getElementById('tr_amount').value = '';
  document.getElementById('tr_desc').value = '';
  loadTreasury(treasury);
}

async function loadCustomerAccounts(){
  const q=document.getElementById('custSearch').value.trim();
  let sql='SELECT c.*,(SELECT COUNT(*) FROM invoices WHERE customer_id=c.id) as inv_count FROM customers c WHERE 1=1';
  let params=[];
  if(q){sql+=' AND c.name LIKE ?';params.push('%'+q+'%');}
  sql+=' ORDER BY c.name';
  const res=await window.db.query(sql,params);
  const tbody=document.getElementById('customerAccountsBody');
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="6" class="table-empty">لا يوجد عملاء</td></tr>';return;}
  window._currentCustomerAccountsData = res.data;
  tbody.innerHTML=res.data.map(c=>`<tr>
    <td style="font-weight:700;">${c.name}</td><td>${c.phone||'—'}</td>
    <td>${fmt(c.opening_balance)}</td>
    <td style="font-weight:700;color:${c.current_balance>0?'var(--danger)':'var(--success)'};">${fmt(c.current_balance)}</td>
    <td style="text-align:center;">${c.inv_count}</td>
    <td><button class="btn btn-sm btn-primary" onclick="viewCustomerInvoices(${c.id},'${c.name}')">كشف الحساب</button></td>
  </tr>`).join('');
}
async function viewCustomerInvoices(id,name){
  const res=await window.db.query('SELECT * FROM invoices WHERE customer_id=? ORDER BY id DESC',[id]);
  if(!res.success||!res.data.length){showToast('لا توجد فواتير لهذا العميل','info');return;}
  alert(`عميل: ${name}\nعدد الفواتير: ${res.data.length}\nإجمالي المبيعات: ${fmt(res.data.reduce((s,r)=>s+(r.net_total||0),0))} جنيه\nإجمالي الباقي: ${fmt(res.data.reduce((s,r)=>s+(r.remaining||0),0))} جنيه`);
}

// ─── Supplier Accounts ────────────────────────────────────────────────────────
async function loadSupplierAccounts(){
  const q=document.getElementById('suppSearch').value.trim();
  let sql='SELECT s.*,(SELECT COALESCE(SUM(total),0) FROM purchases WHERE supplier_id=s.id) as total_purchases FROM suppliers s WHERE 1=1';
  let params=[];
  if(q){sql+=' AND s.name LIKE ?';params.push('%'+q+'%');}
  sql+=' ORDER BY s.name';
  const res=await window.db.query(sql,params);
  const tbody=document.getElementById('supplierAccountsBody');
  if(!res.success||!res.data.length){tbody.innerHTML='<tr><td colspan="5" class="table-empty">لا يوجد موردون</td></tr>';return;}
  window._currentSupplierAccountsData = res.data;
  tbody.innerHTML=res.data.map(s=>`<tr>
    <td style="font-weight:700;">${s.name}</td><td>${s.phone||'—'}</td>
    <td>${fmt(s.opening_balance)}</td>
    <td style="font-weight:700;color:var(--warning);">${fmt(s.current_balance)}</td>
    <td style="color:var(--primary);font-weight:600;">${fmt(s.total_purchases)}</td>
  </tr>`).join('');
}

// ─── Stats ────────────────────────────────────────────────────────────────────
async function loadStats(){
  const from=document.getElementById('filterFrom').value;const to=document.getElementById('filterTo').value;
  const salesRes=await window.db.queryOne(`SELECT COALESCE(SUM(net_total),0) as total FROM invoices WHERE 1=1${from?' AND invoice_date>=?':''}${to?' AND invoice_date<=?':''}`,[from,to].filter(Boolean));
  const expRes=await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE 1=1${from?' AND date>=?':''}${to?' AND date<=?':''}`,[from,to].filter(Boolean));
  const revRes=await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM revenues WHERE 1=1${from?' AND date>=?':''}${to?' AND date<=?':''}`,[from,to].filter(Boolean));
  const sales=salesRes.data?.total||0;const exp=expRes.data?.total||0;const rev=revRes.data?.total||0;
  document.getElementById('st_totalSales').textContent=Number(sales).toLocaleString('en-US');
  document.getElementById('st_totalExp').textContent=Number(exp).toLocaleString('en-US');
  document.getElementById('st_totalRev').textContent=Number(rev).toLocaleString('en-US');
  document.getElementById('st_netProfit').textContent=Number(sales+rev-exp).toLocaleString('en-US');
  const topExpRes=await window.db.query('SELECT type_name,SUM(amount) as total FROM expenses GROUP BY type_name ORDER BY total DESC LIMIT 10',[]);
  const totExp=topExpRes.data?.reduce((s,r)=>s+(r.total||0),0)||1;
  document.getElementById('topExpTypesBody').innerHTML=(topExpRes.data||[]).map(r=>`<tr>
    <td>${r.type_name}</td><td style="font-weight:700;color:var(--danger);">${fmt(r.total)}</td>
    <td>${((r.total/totExp)*100).toFixed(1)}%</td></tr>`).join('')||'<tr><td colspan="3" class="table-empty">—</td></tr>';
  const topCustRes=await window.db.query('SELECT c.name,COALESCE(SUM(i.net_total),0) as total FROM customers c LEFT JOIN invoices i ON c.id=i.customer_id GROUP BY c.id ORDER BY total DESC LIMIT 10',[]);
  document.getElementById('topCustomersBody').innerHTML=(topCustRes.data||[]).map(r=>`<tr>
    <td style="font-weight:600;">${r.name}</td><td style="color:var(--accent);font-weight:700;">${fmt(r.total)}</td></tr>`).join('')||'<tr><td colspan="2" class="table-empty">—</td></tr>';
}

// ─── Admin Check & Quit ───────────────────────────────────────────────────────
async function checkAdmin() {
  const role = sessionStorage.getItem('elTarzy_role');
  if (role !== 'admin') {
    // Hide all tabs except Expenses
    const tabs = document.querySelectorAll('.fin-nav-btn');
    tabs.forEach((tab, idx) => {
      if (idx !== 0) tab.style.display = 'none'; // Index 0 is Expenses
    });
    // Switch to expenses tab
    const expensesBtn = document.querySelectorAll('.fin-nav-btn')[0];
    if (expensesBtn) expensesBtn.click();
    return false;
  }
  // Admin: show treasury manage card & print buttons
  const card = document.getElementById('treasuryManageCard');
  if (card) card.style.display = 'block';
  const btnA4 = document.getElementById('btnPrintA4');
  const btnThermal = document.getElementById('btnPrintThermal');
  if (btnA4) btnA4.style.display = '';
  if (btnThermal) btnThermal.style.display = '';
  return true;
}

window.electron.onConfirmBackupBeforeQuit(() => {
  Swal.fire({
    title: 'إغلاق البرنامج',
    html: `
      <p style="font-size:14px;font-weight:600;margin-bottom:8px;">هل تريد إنشاء نسخة احتياطية قبل الخروج؟</p>
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
        <button class="btn btn-primary" onclick="Swal.close(); sendDailyReportAndQuit();">إرسال التقرير وإنهاء</button>
        <button class="btn btn-success" onclick="Swal.close(); window.electron.quitWithBackup();">نسخ وخروج</button>
        <button class="btn btn-danger" onclick="Swal.close(); window.electron.quitWithoutBackup();">خروج بدون نسخة</button>
        <button class="btn btn-outline" onclick="Swal.close(); window.electron.cancelQuit();">إلغاء</button>
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
const today=getLocalISODate();
const firstDay=today.slice(0,7)+'-01';
document.getElementById('filterFrom').value=firstDay;
document.getElementById('filterTo').value=today;

checkAdmin().then(isAdmin => {
  if (isAdmin) {
    loadExpenseTypes();
    loadExpenses();
    loadEmpSelect('exp_emp');
  }
});