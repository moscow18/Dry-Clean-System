let currentReportData = null;
let companySettings   = null;

// ─── Backup ────────────────────────────────────────────────────────────────────
async function doBackup() {
  const btn = document.getElementById('backupBtn');
  const og = btn?.innerHTML;
  if (btn) { btn.innerHTML = '⏳ ...'; btn.disabled = true; }
  try {
    const res = await window.backup.create('يدوي');
    if (res && res.success) {
      showToast('✅ تم إنشاء النسخة الاحتياطية بنجاح', 'success');
    } else {
      showToast('❌ فشل إنشاء النسخة: ' + (res?.error || 'خطأ'), 'error');
    }
  } catch(e) {
    showToast('❌ خطأ: ' + e.message, 'error');
  }
  if (btn) { btn.innerHTML = og; btn.disabled = false; }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('reportDate').value = getLocalISODate();
  await refreshSettings();
  await loadDailyReport();
}

async function refreshSettings() {
  const r = await window.db.getSettings();
  if (r && r.success) {
    companySettings = r.data;
    const shop = companySettings?.company_name || 'Dry Clean';
    document.getElementById('rptTitle').textContent    = '📊 ' + shop + ' — التقرير اليومي';
    document.getElementById('printTitle').textContent  = shop + ' — التقرير اليومي الشامل';
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadDailyReport() {
  try {
    const date = document.getElementById('reportDate').value;
    if (!date) return;
    document.getElementById('rptSubtitle').textContent   = 'تقرير يوم: ' + date;
    document.getElementById('printSubtitle').textContent = 'التاريخ: ' + date;

    ['invoicesList','expensesList','advancesList','attendanceList'].forEach(id => {
      document.getElementById(id).innerHTML = '<div class="empty-msg">جاري التحميل...</div>';
    });

    const res = await window.db.getDailyReport(date);
    if (!res || !res.success) {
      document.body.innerHTML = `<div style="color:#c00;font-size:20px;font-weight:bold;text-align:center;padding:50px;">خطأ من DB: ${res ? res.error : 'null'}</div>`;
      return;
    }

    currentReportData = res.data;
    const {
      summary, treasuryBalances, invoices, expenses, advances, salaries,
      attendance, returns, revenues, todayPaymentsOnOldInvoices
    } = res.data;

    // ── 1. Summary ─────────────────────────────────────────────────────────────
    const totInc = (summary.invoices_paid || 0) + (summary.revenues || 0);
    const totExp = (summary.expenses || 0) + (summary.returns || 0);
    const totAdv = (summary.advances || 0) + (summary.salaries || 0);
    const net    = totInc - (totExp + totAdv);

    document.getElementById('totIncome').textContent   = fmt(totInc) + ' ج';
    document.getElementById('totExpenses').textContent = fmt(totExp) + ' ج';
    document.getElementById('totAdvances').textContent = fmt(totAdv) + ' ج';
    document.getElementById('netIncome').textContent   = fmt(net) + ' ج';
    document.getElementById('netIncome').className = 's-val ' + (net >= 0 ? 'c-green' : 'c-red');

    // ── 2. Treasury balances (3 only) ─────────────────────────────────────────
    const findBal = (t) => (treasuryBalances?.find(x => x.treasury_type === t)?.balance || 0);
    document.getElementById('balCash').textContent     = fmt(findBal('الخزينة'))     + ' ج';
    document.getElementById('balVodafone').textContent = fmt(findBal('فودافون كاش')) + ' ج';
    document.getElementById('balInstapay').textContent = fmt(findBal('إنستا باي'))   + ' ج';

    // ── 3. Invoices ────────────────────────────────────────────────────────────
    renderInvoices(invoices);

    // ── 4. Payments on old invoices ────────────────────────────────────────────
    renderOldPayments(todayPaymentsOnOldInvoices);

    // ── 5. Expenses + Returns ──────────────────────────────────────────────────
    renderExpenses(expenses, returns);

    // ── 6. Advances & Salaries ─────────────────────────────────────────────────
    renderAdvances(advances, salaries);

    // ── 7. Attendance ──────────────────────────────────────────────────────────
    renderAttendance(attendance);

    // ── 8. Revenues ────────────────────────────────────────────────────────────
    if (revenues && revenues.length > 0) {
      document.getElementById('revenueSection').style.display = '';
      let h = `<table class="rpt-table">
        <thead><tr><th>#</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>`;
      revenues.forEach((r, i) => {
        h += `<tr><td>${i+1}</td><td>${r.description||'—'}</td><td class="c-green">${fmt(r.amount)} ج</td></tr>`;
      });
      h += `</tbody></table>`;
      document.getElementById('revenuesList').innerHTML = h;
    }

  } catch (err) {
    document.body.innerHTML = `<div style="color:red;font-size:16px;background:#fff;position:fixed;top:0;left:0;right:0;bottom:0;padding:20px;overflow:auto;">${err.stack}</div>`;
  }
}

function renderInvoices(invoices) {
  if (!invoices || invoices.length === 0) {
    document.getElementById('invoicesList').innerHTML = '<div class="empty-msg">لا توجد فواتير في هذا اليوم</div>';
    return;
  }
  let h = `<table class="rpt-table">
    <thead><tr><th>#</th><th>رقم الفاتورة</th><th>العميل</th><th>طريقة الدفع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody>`;
  let totAll = 0, totPaid = 0, totRem = 0;
  invoices.forEach((inv, i) => {
    const total = inv.net_total || 0;
    const paid  = inv.amount_paid || 0;
    const rem   = Math.max(0, total - paid);
    totAll += total; totPaid += paid; totRem += rem;
    const remCell = rem > 0
      ? `<span class="badge badge-r">${fmt(rem)} ج</span>`
      : `<span class="badge badge-g">✅ مكتمل</span>`;
    h += `<tr>
      <td>${i+1}</td>
      <td><strong>${inv.invoice_number||'—'} ${inv.is_express ? '⚡' : ''} ${inv.is_delivery ? '🛵' : ''}</strong></td>
      <td>${inv.customer_name||'نقدي'}</td>
      <td>${inv.payment_method||'—'}</td>
      <td>${fmt(total)} ج</td>
      <td class="c-green"><strong>${fmt(paid)} ج</strong></td>
      <td>${remCell}</td>
    </tr>`;
  });
  h += `<tr class="rpt-total-row">
    <td colspan="4">الإجمالي (${invoices.length} فاتورة)</td>
    <td>${fmt(totAll)} ج</td>
    <td>${fmt(totPaid)} ج</td>
    <td>${totRem > 0 ? fmt(totRem) + ' ج' : '✅'}</td>
  </tr></tbody></table>`;
  document.getElementById('invoicesList').innerHTML = h;
}

function renderOldPayments(list) {
  if (!list || list.length === 0) return;
  document.getElementById('oldInvSection').style.display = '';
  let h = `<table class="rpt-table">
    <thead><tr><th>#</th><th>رقم الفاتورة</th><th>تاريخ الفاتورة</th><th>العميل</th><th>البيان</th><th>المحصّل</th><th>وسيلة الدفع</th></tr></thead>
    <tbody>`;
  let tot = 0;
  list.forEach((p, i) => {
    const inv = p.invoice;
    const tr  = p.treasury_row;
    tot += (tr.amount || 0);
    h += `<tr>
      <td>${i+1}</td>
      <td><strong>${p.invoice_number}</strong></td>
      <td>${inv ? inv.invoice_date : '—'}</td>
      <td>${inv ? (inv.customer_name||'نقدي') : '—'}</td>
      <td><span class="badge badge-b">${tr.description||'دفعة'}</span></td>
      <td class="c-green"><strong>${fmt(tr.amount)} ج</strong></td>
      <td>${tr.treasury_type||'—'}</td>
    </tr>`;
  });
  h += `<tr class="rpt-total-row"><td colspan="5">الإجمالي</td><td>${fmt(tot)} ج</td><td></td></tr>`;
  h += `</tbody></table>`;
  document.getElementById('oldInvList').innerHTML = h;
}

function renderExpenses(expenses, returns) {
  if ((!expenses || !expenses.length) && (!returns || !returns.length)) {
    document.getElementById('expensesList').innerHTML = '<div class="empty-msg">لا توجد مصروفات أو مرتجعات في هذا اليوم</div>';
    return;
  }
  let h = `<table class="rpt-table">
    <thead><tr><th>#</th><th>النوع</th><th>البيان</th><th>مصدر الدفع</th><th>المبلغ</th></tr></thead><tbody>`;
  let idx = 1, tot = 0;
  (expenses || []).forEach(e => {
    tot += (e.amount || 0);
    h += `<tr><td>${idx++}</td><td><span class="badge badge-r">مصروف</span></td><td>${e.description||e.type_name||'—'}</td><td>${e.payment_source||'—'}</td><td class="c-red">${fmt(e.amount)} ج</td></tr>`;
  });
  (returns || []).forEach(r => {
    tot += (r.total_returned || 0);
    h += `<tr><td>${idx++}</td><td><span class="badge badge-y">مرتجع</span></td><td>مرتجع فاتورة ${r.invoice_number||'—'}</td><td>${r.refund_method||'—'}</td><td class="c-red">${fmt(r.total_returned)} ج</td></tr>`;
  });
  h += `<tr class="rpt-total-row"><td colspan="4">الإجمالي</td><td>${fmt(tot)} ج</td></tr></tbody></table>`;
  document.getElementById('expensesList').innerHTML = h;
}

function renderAdvances(advances, salaries) {
  if ((!advances || !advances.length) && (!salaries || !salaries.length)) {
    document.getElementById('advancesList').innerHTML = '<div class="empty-msg">لا توجد سلف أو رواتب في هذا اليوم</div>';
    return;
  }
  let h = `<table class="rpt-table">
    <thead><tr><th>#</th><th>النوع</th><th>الموظف</th><th>المبلغ</th><th>ملاحظات</th></tr></thead><tbody>`;
  let idx = 1;
  (advances || []).forEach(a => {
    h += `<tr><td>${idx++}</td><td><span class="badge badge-y">سلفة</span></td><td>${a.emp_name||'—'}</td><td class="c-red">${fmt(a.amount)} ج</td><td>${a.reason||'—'}</td></tr>`;
  });
  (salaries || []).forEach(s => {
    h += `<tr><td>${idx++}</td><td><span class="badge badge-r">راتب</span></td><td>${s.emp_name||'—'}</td><td class="c-red">${fmt(s.net_salary)} ج</td><td>${s.month||'—'}</td></tr>`;
  });
  h += `</tbody></table>`;
  document.getElementById('advancesList').innerHTML = h;
}

function renderAttendance(attendance) {
  if (!attendance || !attendance.length) {
    document.getElementById('attendanceList').innerHTML = '<div class="empty-msg">لا يوجد سجل حضور في هذا اليوم</div>';
    return;
  }
  let h = `<table class="rpt-table">
    <thead><tr><th>#</th><th>الموظف</th><th>حضور</th><th>انصراف</th><th>تأخير(د)</th><th>إضافي(د)</th></tr></thead><tbody>`;
  attendance.forEach((a, i) => {
    const tin  = a.check_in  ? (a.check_in.includes('T')  ? a.check_in.split('T')[1].substr(0,5)  : a.check_in.substr(11,5))  : '—';
    const tout = a.check_out ? (a.check_out.includes('T') ? a.check_out.split('T')[1].substr(0,5) : a.check_out.substr(11,5)) : '—';
    h += `<tr><td>${i+1}</td><td>${a.emp_name||'—'}</td><td>${tin}</td><td>${tout}</td><td>${a.late_minutes||0}</td><td>${a.extra_minutes||0}</td></tr>`;
  });
  h += `</tbody></table>`;
  document.getElementById('attendanceList').innerHTML = h;
}

// ─── Enable print-shared CSS class (mirrors @media print, for printToPDF) ────
function enablePrintMode() {
  document.body.classList.add('print-shared');
  document.body.style.background = '#fff';
  
  // Easier: just add class to rpt-wrap and body, use descendant selectors
  document.querySelector('.rpt-wrap').classList.add('print-mode-wrap');
  document.getElementById('printFooter').style.display = 'block';
  document.querySelector('.rpt-toolbar').style.display = 'none';
  document.querySelector('.print-header').style.display = 'block';
}

function disablePrintMode() {
  document.body.classList.remove('print-shared');
  document.body.style.background = '';

  document.querySelector('.rpt-wrap').classList.remove('print-mode-wrap');
  document.getElementById('printFooter').style.display = 'none';
  document.querySelector('.rpt-toolbar').style.display = '';
  document.querySelector('.print-header').style.display = 'none';
}

// ─── Save PDF — apply print styles FIRST so printToPDF captures them ─────────
async function savePDFReport(silent = false) {
  if (!currentReportData) { if(!silent) showToast('قم بتحميل التقرير أولاً', 'warning'); return null; }
  await refreshSettings();

  const date     = document.getElementById('reportDate').value;
  const basePath = (companySettings?.report_save_path || '').replace(/[/\\]+$/, '');

  let savePath;
  if (basePath) {
    savePath = basePath + '\\' + `تقرير-${date}.pdf`;
  } else {
    const r = await window.electron.showSaveDialog({
      defaultPath: `تقرير-${date}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: 'حفظ التقرير اليومي'
    });
    if (!r || r.canceled || !r.filePath) return null;
    savePath = r.filePath;
  }

  // ── Key fix: apply print styles before printToPDF so they are captured ──
  enablePrintMode();
  await new Promise(resolve => setTimeout(resolve, 400)); // let DOM repaint

  const r = await window.electron.printToPDF(savePath);

  disablePrintMode(); // restore screen state

  if (r && r.success) {
    if(!silent) showToast('✅ تم حفظ PDF: ' + savePath, 'success');
    return savePath;
  } else {
    if(!silent) showToast('خطأ في PDF: ' + (r ? r.error : 'غير معروف'), 'error');
    return null;
  }
}

// ─── Send PDF via WhatsApp ─────────────────────────────────────────────────────
async function savePDFAndSend() {
  if (!currentReportData) { showToast('قم بتحميل التقرير أولاً', 'warning'); return; }
  await refreshSettings();

  const phone = companySettings?.admin_wa_phone;
  if (!phone) {
    Swal.fire({ icon: 'warning', title: 'تنبيه', text: 'يرجى إعداد رقم واتساب الإدارة في الإعدادات أولاً' });
    return;
  }

  const btn = document.getElementById('sendWaBtn');
  const og  = btn.innerHTML;
  btn.innerHTML = '⏳ جاري الحفظ...'; btn.disabled = true;

  // DO NOT show Swal here, because printToPDF will capture the screen
  // with the Swal overlay and an empty body (due to overflow:hidden).
  const pdfPath = await savePDFReport(true); // silent = true
  
  if (!pdfPath) { 
    btn.innerHTML = og; btn.disabled = false; 
    return; 
  }

  // Now that PDF is safely saved from the clean DOM, we can show Swal
  Swal.fire({ title: 'جاري إرسال التقرير للإدارة...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  btn.innerHTML = '⏳ جاري الإرسال...';

  const date    = document.getElementById('reportDate').value;
  const shop    = companySettings?.company_name || 'Dry Clean';
  const { summary, treasuryBalances } = currentReportData;
  const totInc  = (summary.invoices_paid || 0) + (summary.revenues || 0);
  const totExp  = (summary.expenses    || 0) + (summary.returns   || 0);
  const totAdv  = (summary.advances    || 0) + (summary.salaries  || 0);
  const net     = totInc - (totExp + totAdv);

  let netCash = 0, netVodafone = 0, netInstapay = 0;
  (treasuryBalances || []).forEach(t => {
    if (t.treasury_type === 'الخزينة') netCash = t.balance;
    else if (t.treasury_type === 'فودافون كاش') netVodafone = t.balance;
    else if (t.treasury_type === 'إنستا باي') netInstapay = t.balance;
  });

  const caption = `📊 ${shop} — تقرير يوم ${date}\n\n• إجمالي الدخل: ${fmt(totInc)} ج\n• المصروفات: ${fmt(totExp)} ج\n• السلف والرواتب: ${fmt(totAdv)} ج\n*• صافي اليوم العام: ${fmt(net)} ج*\n\n*💳 تفاصيل الخزائن (الصافي):*\n• 💵 الخزينة النقدية: ${fmt(netCash)} ج\n• 📱 فودافون كاش: ${fmt(netVodafone)} ج\n• 💳 إنستا باي: ${fmt(netInstapay)} ج`;

  // Try direct file send via WhatsApp Web.js
  const waStatus = await window.whatsapp.getStatus().catch(() => ({ ready: false }));
  if (waStatus && waStatus.ready) {
    try {
      // Timeout after 15 seconds to prevent hanging
      const sendPromise = window.whatsapp.sendFile(phone, caption, pdfPath);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000));
      const r = await Promise.race([sendPromise, timeoutPromise]);
      
      if (r && r.success) {
        Swal.fire({ icon: 'success', title: 'تم الإرسال ✅', text: 'تم إرسال ملف PDF للإدارة عبر واتساب' });
        btn.innerHTML = og; btn.disabled = false;
        return;
      }
    } catch(e) {
      console.error('WhatsApp send error:', e);
    }
  }

  // Fallback: wa.me link
  Swal.close();
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '2' + cleaned;
  if (!cleaned.startsWith('20')) cleaned = '20' + cleaned;
  const msg = caption + `\n\n📁 PDF محفوظ في:\n${pdfPath}`;
  await window.electron.openExternal(`https://wa.me/${cleaned}?text=${encodeURIComponent(msg)}`);
  showToast('واتساب مش متصل — تم فتح wa.me | PDF محفوظ على الجهاز', 'info');

  btn.innerHTML = og; btn.disabled = false;
}

// ─── Print ─────────────────────────────────────────────────────────────────────
function printReport(mode) {
  if (mode === 'thermal') {
    printThermalReport();
  } else {
    // A4 — use printShared approach
    document.getElementById('printFooter').style.display = 'block';
    window.print();
    document.getElementById('printFooter').style.display = 'none';
  }
}

// ─── Thermal Print — Build separate iframe receipt like finance.js ────────────
function printThermalReport() {
  if (!currentReportData) { showToast('قم بتحميل التقرير أولاً', 'warning'); return; }
  const d = currentReportData;
  const date = document.getElementById('reportDate').value;
  const shop = companySettings?.company_name || 'Dry Clean';

  const fmt2 = n => Number(n||0).toFixed(2);
  const row  = (lbl, val) => `<div class="row"><span>${lbl}</span><span class="bold">${val}</span></div>`;
  const dRow = () => `<div class="line"></div>`;

  // ── Invoices section ──
  let invSection = '';
  if (d.invoices && d.invoices.length) {
    invSection = dRow() + `<div class="sec-title">🧾 فواتير اليوم (${d.invoices.length})</div>` + dRow();
    d.invoices.forEach((inv, i) => {
      const paid = Number(inv.amount_paid||inv.paid||0);
      const rem  = Number(inv.remaining||inv.remaining_amount||0);
      invSection += `<div class="row"><span>${i+1}. ${inv.invoice_number}</span><span class="bold">${fmt2(paid)} ج</span></div>`;
      if (rem > 0) invSection += `<div class="desc">متبقي: ${fmt2(rem)} ج | ${inv.customer_name||'نقدي'}</div>`;
    });
    const invTotal = d.invoices.reduce((s,i)=>s+(Number(i.amount_paid||i.paid||0)),0);
    invSection += dRow() + `<div class="total">إجمالي المبيعات: ${fmt2(invTotal)} ج</div>`;
  }

  // ── Old payments section ──
  let oldSection = '';
  if (d.todayPaymentsOnOldInvoices && d.todayPaymentsOnOldInvoices.length) {
    oldSection = dRow() + `<div class="sec-title">💰 تحصيلات قديمة (${d.todayPaymentsOnOldInvoices.length})</div>` + dRow();
    let oldTot = 0;
    d.todayPaymentsOnOldInvoices.forEach((p,i) => {
      const amt = Number(p.treasury_row?.amount||0);
      oldTot += amt;
      oldSection += `<div class="row"><span>${i+1}. ${p.invoice_number}</span><span class="bold">${fmt2(amt)} ج</span></div>`;
    });
    oldSection += dRow() + `<div class="total">الإجمالي: ${fmt2(oldTot)} ج</div>`;
  }

  // ── Expenses section ──
  let expSection = '';
  if (d.expenses && d.expenses.length) {
    expSection = dRow() + `<div class="sec-title">💸 المصروفات (${d.expenses.length})</div>` + dRow();
    let expTot = 0;
    d.expenses.forEach((e,i) => {
      expTot += Number(e.amount||0);
      expSection += `<div class="row"><span>${i+1}. ${e.type_name||e.description||'—'}</span><span class="bold">${fmt2(e.amount)} ج</span></div>`;
      if(e.description) expSection += `<div class="desc">${e.description}</div>`;
    });
    expSection += dRow() + `<div class="total">إجمالي: ${fmt2(expTot)} ج</div>`;
  }

  // ── Advances section ──
  let advSection = '';
  if (d.advances && d.advances.length) {
    advSection = dRow() + `<div class="sec-title">👤 السلف (${d.advances.length})</div>` + dRow();
    let advTot = 0;
    d.advances.forEach((a,i) => {
      advTot += Number(a.amount||0);
      advSection += `<div class="row"><span>${i+1}. ${a.emp_name||'—'}</span><span class="bold">${fmt2(a.amount)} ج</span></div>`;
    });
    advSection += dRow() + `<div class="total">إجمالي: ${fmt2(advTot)} ج</div>`;
  }

  // ── Summary row ──
  const totInc = (d.summary?.invoices_paid||0) + (d.summary?.revenues||0);
  const totExp = (d.summary?.expenses||0) + (d.summary?.returns||0) + (d.summary?.advances||0);
  const net    = totInc - totExp;

  // ── Treasury balances ──
  let trsSection = dRow() + `<div class="sec-title">💵 أرصدة الخزائن</div>` + dRow();
  (d.treasuryBalances||[]).forEach(t => {
    trsSection += row(t.treasury_type, fmt2(t.balance) + ' ج');
  });

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>تقرير ${date}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body { font-family: Arial, sans-serif; font-size: 14px; color: #000; direction: rtl; padding: 3mm 2mm; margin: 0; }
    .center { text-align:center; }
    .bold { font-weight:900; }
    .line { border-top:1px dashed #000; margin:5px 0; }
    .row { display:flex; justify-content:space-between; margin:3px 0; font-size:13px; }
    .row span:first-child { max-width:60%; word-break:break-word; }
    .desc { font-size:11px; color:#333; padding-right:8px; margin-bottom:2px; }
    .sec-title { font-size:13px; font-weight:900; text-align:center; margin:3px 0; }
    .total { font-size:15px; font-weight:900; text-align:center; margin:4px 0; }
    .summary-row { display:flex; justify-content:space-between; margin:2px 0; font-size:12px; font-weight:700; }
  </style></head><body>
  <div class="center bold" style="font-size:18px;margin-bottom:2px;">${shop}</div>
  <div class="center" style="font-size:13px;margin-bottom:2px;">التقرير اليومي الشامل</div>
  <div class="center" style="font-size:12px;margin-bottom:4px;">${date}</div>
  ${dRow()}
  <div class="sec-title">📊 ملخص اليوم</div>
  ${dRow()}
  <div class="summary-row"><span>إجمالي الدخل</span><span>${fmt2(totInc)} ج</span></div>
  <div class="summary-row"><span>إجمالي الصرف</span><span>${fmt2(totExp)} ج</span></div>
  <div class="summary-row"><span>صافي اليوم</span><span>${fmt2(net)} ج</span></div>
  ${trsSection}
  ${invSection}
  ${oldSection}
  ${expSection}
  ${advSection}
  ${dRow()}
  <div class="center" style="font-size:11px;margin-top:4px;">نظام دراي كلين — ${new Date().toLocaleDateString('ar-EG-u-nu-latn')}</div>
  </body></html>`;

  let iframe = document.getElementById('thermalPrintFrame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'thermalPrintFrame';
    iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 350);
}

document.addEventListener('DOMContentLoaded', init);

if (window.electron && window.electron.onConfirmBackupBeforeQuit) {
  window.electron.onConfirmBackupBeforeQuit(() => {
    const m = document.getElementById('quitModal');
    if (m) m.classList.add('open');
    else window.electron.quitWithBackup();
  });
}
