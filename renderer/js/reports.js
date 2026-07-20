
function fmt(n){ return Number(n||0).toLocaleString('ar-EG', {minimumFractionDigits:2, maximumFractionDigits:2}); }

// ─── Tabs ────────────────────────────────────────────────────────────────────
function switchTab(tabId, btn) {
  document.querySelectorAll('.rpt-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  
  document.querySelectorAll('.rpt-section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + tabId).classList.add('active');
  
  if(tabId === 'sales') loadSalesReport();
  if(tabId === 'purchases') loadPurchasesReport();
  if(tabId === 'shifts') loadShiftsReport();
  if(tabId === 'income') loadIncomeStatement();
}

// ─── Date Init ────────────────────────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
const firstDay = today.slice(0,7) + '-01';

document.getElementById('salesFrom').value = firstDay;
document.getElementById('salesTo').value = today;
document.getElementById('purFrom').value = firstDay;
document.getElementById('purTo').value = today;
document.getElementById('shiftFrom').value = firstDay;
document.getElementById('shiftTo').value = today;
document.getElementById('incomeMonth').value = today.slice(0,7);

// ─── Tailors Dropdown ──────────────────────────────────────────────────────────
async function loadTailorsDropdown() {
  const select = document.getElementById('salesTailorFilter');
  if(!select) return;
  const res = await window.db.query("SELECT id, name FROM employees WHERE job_title LIKE '%خياط%' OR job_title LIKE '%ترزي%' OR employee_type='عادي' OR is_active=1");
  if(res.success && res.data) {
    let options = '<option value="">الكل</option>';
    res.data.forEach(t => options += `<option value="${t.id}">${t.name}</option>`);
    select.innerHTML = options;
  }
}

// ─── Sales Report ─────────────────────────────────────────────────────────────
async function loadSalesReport() {
  const from = document.getElementById('salesFrom').value;
  const to = document.getElementById('salesTo').value;
  const search = document.getElementById('salesSearch').value.trim();
  const statusFilter = document.getElementById('salesStatusFilter')?.value || '';
  const tailorFilter = document.getElementById('salesTailorFilter')?.value || '';
  
  let sql = `SELECT i.*, 
                    c.name as customer_name,
                    e.name as emp_name,
                    t.name as tailor_name,
                    (i.net_total - COALESCE((SELECT SUM(total_returned) FROM returns WHERE original_invoice_id = i.id), 0)) as dynamic_net_total
             FROM invoices i 
             LEFT JOIN customers c ON i.customer_id = c.id 
             LEFT JOIN employees e ON i.employee_id = e.id
             LEFT JOIN employees t ON i.tailor_id = t.id
             WHERE 1=1`;
  const params = [];

  if(search) {
    sql += ` AND (i.invoice_number LIKE ? OR c.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  
  sql += ` AND i.invoice_date BETWEEN ? AND ?`;
  params.push(from || '2000-01-01', to || '2099-12-31');
  
  if(statusFilter === 'غير مسددة') {
    sql += ` AND i.remaining > 0`;
  } else if(statusFilter) {
    sql += ` AND i.status = ?`;
    params.push(statusFilter);
  }

  if(tailorFilter) {
    sql += ` AND i.tailor_id = ?`;
    params.push(tailorFilter);
  }

  sql += ' ORDER BY i.id DESC';
  
  const res = await window.db.query(sql, params);
  const tbody = document.getElementById('salesTableBody');
  
  if(!res.success || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="table-empty">لا توجد مبيعات تطابق البحث</td></tr>';
    document.getElementById('salesTotal').textContent = '0.00';
    document.getElementById('salesPaid').textContent = '0.00';
    document.getElementById('salesDelivered').textContent = '0';
    document.getElementById('salesInProgress').textContent = '0';
    document.getElementById('salesAwaiting').textContent = '0';
    document.getElementById('salesUnpaidAmount').textContent = '0.00';
    return;
  }
  
  const totals = res.data.reduce((s, r) => {
    return {
      t: s.t + (r.dynamic_net_total || 0),
      p: s.p + (r.amount_paid || 0),
      rem: s.rem + (r.remaining || 0),
      delivered: s.delivered + (r.status === 'تم التسليم' ? 1 : 0),
      inProgress: s.inProgress + (r.status === 'تحت الشغل' ? 1 : 0),
      awaiting: s.awaiting + (r.status === 'في انتظار الاستلام' ? 1 : 0),
      unpaidAmt: s.unpaidAmt + (r.remaining > 0 ? r.remaining : 0)
    };
  }, { t: 0, p: 0, rem: 0, delivered: 0, inProgress: 0, awaiting: 0, unpaidAmt: 0 });
  
  tbody.innerHTML = res.data.map(r => {
    const statusColor = r.status === 'تم التسليم' ? 'success' : (r.status === 'في انتظار الاستلام' ? 'primary' : 'warning');
    const statusBadge = r.is_returned
      ? `<span class="badge badge-danger" title="فاتورة مرتجعة - لا يمكن تغيير الحالة">${r.status || 'مرتجع'}</span>`
      : `<span class="badge badge-${statusColor}" style="cursor:pointer;" onclick="changeInvoiceStatus(${r.id}, '${r.status}', ${r.remaining || 0})"><bdi>${r.status || 'تحت الشغل'}</bdi> ✎</span>`;
    return `
      <tr class="${r.is_returned?'bg-red-50':''}">
        <td style="font-weight:700;color:var(--primary);">${r.invoice_number} ${r.is_returned?'<span class="badge badge-danger">مرتجع</span>':''}</td>
        <td>${r.invoice_date}</td>
        <td>${r.customer_name || 'عميل نقدي'}</td>
        <td style="font-weight:600;color:var(--primary);">${r.tailor_name || '—'}</td>
        <td>${r.emp_name || '—'}</td>
        <td>${statusBadge}</td>
        <td><span class="badge ${r.payment_method==='أجل'?'badge-warning':'badge-success'}">${r.payment_method}</span></td>
        <td>${fmt(r.subtotal)}</td>
        <td style="color:var(--danger);">${fmt((r.discount_amount||0) + ((r.subtotal||0)*(r.discount_percent||0)/100))}</td>
        <td style="font-weight:700;color:var(--accent);">${fmt(r.dynamic_net_total)}</td>
        <td style="color:var(--success);">${fmt(r.amount_paid)}</td>
        <td style="color:var(--danger);">${fmt(r.remaining)}</td>
        <td style="display:flex;gap:4px;">
          ${r.remaining > 0 && !r.is_returned ? `<button class="btn btn-sm btn-success" onclick="payInvoiceDebt(${r.id}, ${r.remaining})">تسديد</button>` : ''}
          ${(r.amount_paid > 0 && sessionStorage.getItem('elTarzy_role') === 'admin') ? `<button class="btn btn-sm btn-danger" onclick="reversePaymentPrompt(${r.id}, ${r.amount_paid})">إرجاع تسديد</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick='reprintPastInvoice(${JSON.stringify(r).replace(/\\x27/g,"&apos;")})' style="border-color:var(--text-muted); color:var(--text-primary);">طباعة</button>
        </td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('salesTotal').textContent = fmt(totals.t);
  document.getElementById('salesPaid').textContent = fmt(totals.p);
  document.getElementById('salesDelivered').textContent = totals.delivered;
  document.getElementById('salesInProgress').textContent = totals.inProgress;
  document.getElementById('salesAwaiting').textContent = totals.awaiting;
  document.getElementById('salesUnpaidAmount').textContent = fmt(totals.unpaidAmt);
}

async function changeInvoiceStatus(id, currentStatus, remainingAmount) {
  const { value: newStatus } = await Swal.fire({
    title: 'تغيير حالة الفاتورة',
    input: 'select',
    inputOptions: {
      'تحت الشغل': '🛠️ تحت الشغل',
      'في انتظار الاستلام': '📦 في انتظار الاستلام',
      'تم التسليم': '✅ تم التسليم'
    },
    inputValue: currentStatus || 'تحت الشغل',
    showCancelButton: true,
    confirmButtonText: 'تغيير',
    cancelButtonText: 'إلغاء',
    inputPlaceholder: 'اختر الحالة'
  });

  if (!newStatus || newStatus === currentStatus) return;

  // لو اختار "تم التسليم" وفيه مبلغ متبقي → اسأله عن الخزنة وسدد أولاً وابعت رسالة واحدة
  if (newStatus === 'تم التسليم' && remainingAmount > 0) {
    const { value: safeType } = await Swal.fire({
      title: `تسديد الباقي (${fmt(remainingAmount)} جنيه)`,
      text: 'يوجد مبلغ متبقي على هذه الفاتورة، اختر خزنة الاستلام:',
      input: 'select',
      inputOptions: {
        'الخزينة': '💵 الخزنة النقدية',
        'فودافون كاش': '📱 فودافون كاش'
      },
      inputValue: 'الخزينة',
      showCancelButton: true,
      confirmButtonText: 'تسديد وتسليم',
      cancelButtonText: 'إلغاء'
    });
    if (!safeType) return; // ألغى
    const payRes = await window.db.payInvoiceRemaining(id, remainingAmount, safeType);
    if (!payRes.success) {
      showToast('خطأ في تسديد المبلغ: ' + payRes.error, 'error');
      return;
    }
    
    // غيّر الحالة
    const res = await window.db.updateInvoiceStatus(id, newStatus);
    if (!res.success) {
      showToast('حدث خطأ: ' + res.error, 'error');
      return;
    }

    showToast('تم التسديد والتسليم بنجاح 💰✅', 'success');
    loadSalesReport();

    // رسالة مدمجة
    const invRes = await window.db.queryOne(
      `SELECT i.invoice_number, i.amount_paid, c.name as customer_name, c.phone as customer_phone
       FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
      [id]
    );
    if (invRes.success && invRes.data && invRes.data.customer_phone && invRes.data.customer_phone.trim() !== '' && invRes.data.customer_phone !== 'null') {
      const inv = invRes.data;
      const waStatus = await window.whatsapp.getStatus();
      if (waStatus.ready) {
        await window.whatsapp.sendDeliveredWithFullPayment({
          phone: inv.customer_phone,
          customerName: inv.customer_name || 'عميلنا العزيز',
          invoiceNumber: inv.invoice_number,
          paid: fmt(remainingAmount),
          paymentMethod: safeType === 'فودافون كاش' ? 'تحويل' : 'نقدي',
        });
      }
    }
    return; // خروج لعدم إرسال رسائل أخرى
  }

  // الحالات العادية أو تم التسليم بدون باقي
  const res = await window.db.updateInvoiceStatus(id, newStatus);
  if (!res.success) {
    showToast('حدث خطأ: ' + res.error, 'error');
    return;
  }

  showToast('تم تغيير الحالة بنجاح ✅', 'success');

  // إرسال واتساب حسب الحالة المختارة
  if (newStatus === 'في انتظار الاستلام') {
    await sendReadyWhatsApp(id);
  } else if (newStatus === 'تم التسليم') {
    await sendDeliveredWhatsApp(id);
  }

  loadSalesReport();
}

async function reversePaymentPrompt(invoiceId, amountPaid) {
  const res = await Swal.fire({
    title: 'إرجاع التسديد',
    text: `المبلغ المسدد الحالي هو ${amountPaid} جنيه. ما هو المبلغ الذي تريد إرجاعه؟`,
    input: 'number',
    inputAttributes: { min: 1, max: amountPaid, step: 0.5 },
    inputValue: amountPaid,
    showCancelButton: true,
    confirmButtonText: 'إرجاع',
    cancelButtonText: 'إلغاء'
  });
  if (res.isConfirmed && res.value) {
    const amt = parseFloat(res.value);
    if (amt > 0 && amt <= amountPaid) {
      const dbRes = await window.db.reversePayment(invoiceId, amt);
      if (dbRes.success) {
        showToast('تم إرجاع التسديد بنجاح', 'success');
        loadSalesReport(); // refresh
      } else {
        showToast('خطأ: ' + dbRes.error, 'error');
      }
    } else {
      showToast('مبلغ غير صحيح', 'error');
    }
  }
}

// رسالة "جاهز للاستلام"
async function sendReadyWhatsApp(invoiceId) {
  const invRes = await window.db.queryOne(
    `SELECT i.invoice_number, c.name as customer_name, c.phone as customer_phone
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
    [invoiceId]
  );
  if (!invRes.success || !invRes.data) return;
  const inv = invRes.data;
  if (!inv.customer_phone || inv.customer_phone.trim() === '' || inv.customer_phone === 'null') {
    showToast('العميل ليس لديه رقم تليفون - لم يتم إرسال واتساب', 'warning'); return;
  }
  const waStatus = await window.whatsapp.getStatus();
  if (!waStatus.ready) {
    showToast('واتساب غير متصل — تحقق من الإعدادات', 'warning'); return;
  }
  const res = await window.whatsapp.sendOrderReady({
    phone: inv.customer_phone,
    customerName: inv.customer_name,
    invoiceNumber: inv.invoice_number,
  });
  if (!res.success) showToast('فشل الإرسال: ' + res.error, 'warning');
}

// رسالة "تم التسليم"
async function sendDeliveredWhatsApp(invoiceId) {
  const invRes = await window.db.queryOne(
    `SELECT i.invoice_number, c.name as customer_name, c.phone as customer_phone
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
    [invoiceId]
  );
  if (!invRes.success || !invRes.data) return;
  const inv = invRes.data;
  if (!inv.customer_phone || inv.customer_phone.trim() === '' || inv.customer_phone === 'null') return;
  const waStatus = await window.whatsapp.getStatus();
  if (!waStatus.ready) return;
  await window.whatsapp.sendDelivered({
    phone: inv.customer_phone,
    customerName: inv.customer_name,
    invoiceNumber: inv.invoice_number,
  });
}

async function payInvoiceDebt(id, maxAmount) {
  const { value: formValues } = await Swal.fire({
    title: 'سداد مديونية الفاتورة',
    html: `
      <div class="form-group" style="text-align:right;">
        <label>المبلغ المتبقي: ${maxAmount} جنيه</label>
        <input id="swal-amount" type="number" class="swal2-input" style="margin: 10px 0; width: 90%;" value="${maxAmount}" max="${maxAmount}" min="0.01" step="0.01">
      </div>
      <div class="form-group" style="text-align:right;">
        <label>إيداع في</label>
        <select id="swal-safe" class="swal2-select" style="display: flex; margin: 10px 0; width: 90%;">
          <option value="الخزينة">💵 الخزنة النقدية</option>
          <option value="فودافون كاش">📱 فودافون كاش</option>
        </select>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'تسديد',
    cancelButtonText: 'إلغاء',
    preConfirm: () => {
      const amount = document.getElementById('swal-amount').value;
      const safeType = document.getElementById('swal-safe').value;
      if (!amount || amount <= 0) {
        Swal.showValidationMessage('الرجاء إدخال مبلغ صحيح');
        return false;
      }
      if (parseFloat(amount) > maxAmount) {
        Swal.showValidationMessage('المبلغ المدخل أكبر من المتبقي');
        return false;
      }
      return { amount: parseFloat(amount), safeType };
    }
  });

  if (!formValues) return;

  const res = await window.db.payInvoiceRemaining(id, formValues.amount, formValues.safeType);
  if (!res.success) {
    Swal.fire('خطأ', res.error, 'error');
    return;
  }

  // جيب بيانات الفاتورة بعد التسديد لإرسال واتساب
  const invRes = await window.db.queryOne(
    `SELECT i.invoice_number, i.net_total, i.amount_paid, i.remaining,
            c.name as customer_name, c.phone as customer_phone
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`,
    [id]
  );

  loadSalesReport();

  // إرسال واتساب للعميل
  if (invRes.success && invRes.data && invRes.data.customer_phone &&
      invRes.data.customer_phone !== 'null' && invRes.data.customer_phone.trim() !== '') {

    const inv = invRes.data;
    let waPhone = inv.customer_phone.replace(/\s+/g, '');
    if (waPhone.startsWith('01')) waPhone = '2' + waPhone;
    let cName = inv.customer_name || 'عميلنا العزيز';
    if (cName !== 'عميلنا العزيز' && !cName.startsWith('أ/')) {
      cName = 'أ/ ' + cName;
    }
    const invNum = inv.invoice_number || '—';
    const paidNow = fmt(formValues.amount);
    const totalPaid = fmt(inv.amount_paid);
    const remaining = parseFloat(inv.remaining) || 0;
    const customerMethod = formValues.safeType === 'الخزينة' ? 'نقدي' : 'تحويل';

    const waStatus = await window.whatsapp.getStatus();
    if (waStatus.ready) {
      if (remaining <= 0) {
        await window.whatsapp.sendFullPayment({
          phone: inv.customer_phone,
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          paidNow: paidNow,
          paymentMethod: formValues.safeType,
        });
      } else {
        await window.whatsapp.sendPartialPayment({
          phone: inv.customer_phone,
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          paidNow: paidNow,
          totalPaid: totalPaid,
          remaining: fmt(remaining),
          paymentMethod: formValues.safeType,
        });
      }
    }
  } else {
    Swal.fire('تم السداد ✅', 'تم تسديد المبلغ بنجاح', 'success');
  }
}


// ─── Purchases Report ─────────────────────────────────────────────────────────
async function loadPurchasesReport() {
  const from = document.getElementById('purFrom').value;
  const to = document.getElementById('purTo').value;
  
  const res = await window.db.query(`
    SELECT p.*, s.name as supplier_name 
    FROM purchases p 
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.purchase_date BETWEEN ? AND ?
    ORDER BY p.id DESC
  `, [from || '2000-01-01', to || '2099-12-31']);
  
  const tbody = document.getElementById('purchasesTableBody');
  
  if(!res.success || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">لا توجد مشتريات في هذه الفترة</td></tr>';
    document.getElementById('purTotal').textContent = '0.00';
    document.getElementById('purPaid').textContent = '0.00';
    document.getElementById('purRemaining').textContent = '0.00';
    return;
  }
  
  let total = 0, paid = 0, rem = 0;
  
  tbody.innerHTML = res.data.map(r => {
    total += (r.total || 0); paid += (r.amount_paid || 0); rem += (r.remaining || 0);
    return `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="font-weight:700;">${r.purchase_date}</td>
        <td>${r.supplier_name || '—'}</td>
        <td style="color:var(--accent); font-weight:700;">${fmt(r.total)}</td>
        <td style="color:var(--success);">${fmt(r.amount_paid)}</td>
        <td style="color:var(--danger);">${fmt(r.remaining)}</td>
        <td>${r.notes || '—'}</td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('purTotal').textContent = fmt(total);
  document.getElementById('purPaid').textContent = fmt(paid);
  document.getElementById('purRemaining').textContent = fmt(rem);
}

// ─── Shifts Report ────────────────────────────────────────────────────────────
async function loadShiftsReport() {
  const from = document.getElementById('shiftFrom').value;
  const to = document.getElementById('shiftTo').value;
  
  const res = await window.db.query(`
    SELECT s.*, e.name as emp_name, date(s.start_time) as shift_date
    FROM shifts s 
    LEFT JOIN employees e ON s.employee_id = e.id
    WHERE date(s.start_time) BETWEEN ? AND ?
    ORDER BY s.id DESC
  `, [from || '2000-01-01', to || '2099-12-31']);
  
  const tbody = document.getElementById('shiftsTableBody');
  if(!res.success || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا توجد شيفتات في هذه الفترة</td></tr>';
    return;
  }
  
  tbody.innerHTML = res.data.map(r => `
    <tr>
      <td style="font-weight:700;">#${r.id}</td>
      <td>${r.shift_date || '—'}</td>
      <td>${r.emp_name || '—'}</td>
      <td>${r.start_time ? r.start_time.split('T').pop()?.split(' ').pop()?.slice(0,5) || r.start_time.slice(11,16) : '—'}</td>
      <td>${r.end_time ? r.end_time.split('T').pop()?.split(' ').pop()?.slice(0,5) || r.end_time.slice(11,16) : '<span class="badge badge-success">مفتوح</span>'}</td>
      <td style="color:var(--success);font-weight:700;">${fmt(r.total_sales)}</td>
      <td style="color:var(--danger);font-weight:700;">${fmt(r.total_expenses)}</td>
    </tr>
  `).join('');
}

// ─── Income Statement ─────────────────────────────────────────────────────────
async function loadIncomeStatement() {
  const month = document.getElementById('incomeMonth').value; // YYYY-MM
  if(!month) return;
  
  const startDate = `${month}-01`;
  const endDate = `${month}-31`; // sqlite between handles invalid days gracefully
  
  // Sales
  const salesRes = await window.db.queryOne(`SELECT COALESCE(SUM(net_total),0) as t FROM invoices WHERE invoice_date BETWEEN ? AND ?`, [startDate, endDate]);
  const sales = salesRes.data?.t || 0;
  
  // Other Rev
  const revRes = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM revenues WHERE date BETWEEN ? AND ?`, [startDate, endDate]);
  const otherRev = revRes.data?.t || 0;
  
  // Returns
  const retRes = await window.db.queryOne(`SELECT COALESCE(SUM(total_returned),0) as t FROM returns WHERE return_date BETWEEN ? AND ?`, [startDate, endDate]);
  const returns = retRes.data?.t || 0;
  
  // Expenses
  const expRes = await window.db.queryOne(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE date BETWEEN ? AND ?`, [startDate, endDate]);
  const expenses = expRes.data?.t || 0;
  
  // Salaries Paid
  const salRes = await window.db.queryOne(`SELECT COALESCE(SUM(net_salary),0) as t FROM salary_payments WHERE month=?`, [month]);
  const salaries = salRes.data?.t || 0;
  
  // COGS (Approximate via items for the period)
  const cogsRes = await window.db.queryOne(`
    SELECT COALESCE(SUM(ii.quantity * s.cost_price),0) as t 
    FROM invoice_items ii 
    JOIN invoices i ON ii.invoice_id = i.id 
    LEFT JOIN services s ON ii.service_id = s.id
    WHERE i.invoice_date BETWEEN ? AND ?
  `, [startDate, endDate]);
  const cogs = cogsRes.data?.t || 0;
  
  const totalRev = sales + otherRev;
  const totalExp = cogs + returns + expenses + salaries;
  const netIncome = totalRev - totalExp;
  
  document.getElementById('inc_sales').textContent = fmt(sales);
  document.getElementById('inc_other_rev').textContent = fmt(otherRev);
  document.getElementById('inc_total_rev').textContent = fmt(totalRev);
  
  document.getElementById('inc_cogs').textContent = fmt(cogs);
  document.getElementById('inc_returns').textContent = fmt(returns);
  document.getElementById('inc_expenses').textContent = fmt(expenses);
  document.getElementById('inc_salaries').textContent = fmt(salaries);
  document.getElementById('inc_total_exp').textContent = fmt(totalExp);
  
  const netEl = document.getElementById('inc_net_income');
  netEl.textContent = fmt(netIncome);
  netEl.style.color = netIncome >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ─── Cleanup Functions ────────────────────────────────────────────────────────
async function truncateInvoices() {
  const { value: text } = await Swal.fire({
    title: 'حذف الفواتير نهائياً',
    text: 'اكتب كلمة "تأكيد" في المربع أدناه للمتابعة:',
    input: 'text',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'تأكيد الحذف',
    cancelButtonText: 'إلغاء'
  });
  if (text !== 'تأكيد') {
    showToast('تم إلغاء العملية','info'); return;
  }
  await window.db.run('DELETE FROM invoice_items',[]);
  await window.db.run('DELETE FROM return_items',[]);
  await window.db.run('DELETE FROM returns',[]);
  await window.db.run('DELETE FROM invoices',[]);
  await window.db.run('UPDATE invoice_sequence SET last_number=0',[]);
  showToast('تم حذف الفواتير وتصفير العداد','success');
}

async function truncateFinance() {
  const { value: text } = await Swal.fire({
    title: 'حذف المالية نهائياً',
    text: 'اكتب كلمة "تأكيد" في المربع أدناه للمتابعة:',
    input: 'text',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'تأكيد الحذف',
    cancelButtonText: 'إلغاء'
  });
  if (text !== 'تأكيد') {
    showToast('تم إلغاء العملية','info'); return;
  }
  await window.db.run('DELETE FROM expenses',[]);
  await window.db.run('DELETE FROM revenues',[]);
  await window.db.run('DELETE FROM treasury',[]);
  await window.db.run('DELETE FROM salary_payments',[]);
  // add default treasury back
  await window.db.run(`INSERT INTO treasury (type, description, amount, balance_after, treasury_type) VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, 'الخزينة')`,[]);
  showToast('تم مسح سجلات الخزينة والمصروفات','success');
}

async function reprintPastInvoice(inv) {
  try {
    const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
    inv.items = itemsRes.data || [];
    const settingsRes = await window.db.getSettings();
    const settings = settingsRes.success ? settingsRes.data : {};
    
    const itemsRows = inv.items.map((item,i)=>`
      <tr style="border-bottom:1px dashed #555;">
        <td style="padding:3px 2px;font-weight:700;">${i+1}</td>
        <td style="padding:3px 2px;font-weight:700;word-break:break-word;">${item.service_name}</td>
        <td style="text-align:center;padding:3px 2px;font-weight:700;">${item.quantity}</td>
        <td style="text-align:center;padding:3px 2px;font-weight:700;">${fmt(item.sell_price)}</td>
        <td style="text-align:center;padding:3px 2px;font-weight:700;">${fmt(item.total)}</td>
      </tr>
    `).join('');

    const invNum = inv.invoice_number;
    const date = inv.invoice_date;
    const subtotal = fmt(inv.subtotal||0);
    const discount = fmt(inv.discount_amount||0);
    const net = fmt(inv.net_total||0);
    const paid = fmt(inv.amount_paid||0);
    const remaining = fmt(inv.remaining||0);
    const totalQty = inv.items.reduce((s,i)=>s+i.quantity,0);

    const safeLogo = settings.logo_path ? 'file:///' + settings.logo_path.replace(/\\/g, '/') : '';
    const logoHTML = safeLogo ? `<div style="text-align:center;margin-bottom:4px;"><img src="${safeLogo}" style="width:100%;max-height:130px;object-fit:contain;"></div>` : '';
    const addressHTML = settings.address ? `<div style="text-align:center;font-size:10px;font-weight:700;margin-bottom:2px;">العنوان: ${settings.address}</div>` : '';
    const phoneHTML = settings.phone ? `<div style="text-align:center;font-size:10px;font-weight:700;margin-bottom:2px;">تليفون: ${settings.phone}</div>` : '';
    
    const tailorHTML = (settings.show_tailor_name && inv.emp_name) ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الخياط:</span><span style="font-weight:700;">${inv.emp_name}</span></div>` : '';
    const custNameHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">العميل:</span><span style="font-weight:700;">${inv.customer_name || 'عميل نقدي'}</span></div>`;
    
    let custPhone = '';
    if (inv.customer_id) {
       const custRes = await window.db.queryOne('SELECT phone FROM customers WHERE id=?', [inv.customer_id]);
       custPhone = custRes.data?.phone || '';
    }
    const custPhoneHTML = custPhone ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">ت.العميل:</span><span style="font-weight:700;">${custPhone}</span></div>` : '';
    
    const notesStr = inv.notes || '';
    const invoiceNotesHTML = notesStr ? `<div style="margin-top:6px;font-size:10px;font-weight:700;border:1px dashed #000;padding:4px;">ملاحظات: ${notesStr}</div>` : '';
    const settingsNotesHTML = settings.receipt_notes ? `<div style="text-align:center;font-size:10px;margin-top:4px;font-weight:700;">${settings.receipt_notes}</div>` : '';

    const receiptHTML = `
      <div class="receipt" style="
        width:68mm;
        box-sizing:border-box;
        font-family:'Cairo',Arial,sans-serif;
        font-size:11px;
        font-weight:700;
        color:#000;
        direction:rtl;
        padding:2mm;
        margin:0;
        margin-left:2mm;
        -webkit-print-color-adjust:exact;
        print-color-adjust:exact;
      ">
        ${logoHTML}
        <div style="text-align:center;font-size:20px;font-weight:900;margin-bottom:4px;letter-spacing:0.5px;">${settings.company_name||'EL-Tarzy'}</div>
        <div style="text-align:center;font-size:12px;font-weight:700;margin-bottom:6px;">محل الترزي</div>
        ${addressHTML}
        ${phoneHTML}
        <div style="border-top:2px dashed #000;margin:6px 0;"></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">رقم الفاتورة:</span><span style="font-weight:900;">${invNum}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">التاريخ:</span><span style="font-weight:700;">${date}</span></div>
        ${custNameHTML}
        ${custPhoneHTML}
        ${tailorHTML}
        <div style="border-top:2px dashed #000;margin:6px 0;"></div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;font-weight:700;table-layout:fixed;">
          <colgroup>
            <col style="width:8%;">
            <col style="width:40%;">
            <col style="width:12%;">
            <col style="width:18%;">
            <col style="width:22%;">
          </colgroup>
          <thead><tr style="border-bottom:2px solid #000;">
            <th style="text-align:right;padding:3px 2px;font-weight:900;background:transparent;">#</th>
            <th style="text-align:right;padding:3px 2px;font-weight:900;background:transparent;">الصنف</th>
            <th style="text-align:center;padding:3px 2px;font-weight:900;background:transparent;">كمية</th>
            <th style="text-align:center;padding:3px 2px;font-weight:900;background:transparent;">السعر</th>
            <th style="text-align:center;padding:3px 2px;font-weight:900;background:transparent;">الإجمالي</th>
          </tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <div style="border-top:2px dashed #000;margin:6px 0;"></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">إجمالي الكمية:</span><span style="font-weight:700;">${totalQty}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الإجمالي:</span><span style="font-weight:700;">${subtotal} ${settings.currency||'جنيه'}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الخصم:</span><span style="font-weight:700;">${discount} ${settings.currency||'جنيه'}</span></div>
        <div style="border-top:1px solid #000;margin:4px 0;"></div>
        <div style="display:flex;justify-content:space-between;font-weight:900;font-size:13px;margin-bottom:3px;"><span>الصافي:</span><span>${net} ${settings.currency||'جنيه'}</span></div>
        <div style="border-top:1px solid #000;margin:4px 0;"></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">المدفوع:</span><span style="font-weight:700;">${paid} ${settings.currency||'جنيه'}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الباقي:</span><span style="font-weight:900;">${remaining} ${settings.currency||'جنيه'}</span></div>
        ${invoiceNotesHTML}
        <div style="border-top:2px dashed #000;margin:8px 0;"></div>
        <div style="text-align:center;font-weight:900;font-size:11px;">${settings.receipt_footer||'شكراً لزيارتكم'}</div>
        ${settingsNotesHTML}
      </div>`;

    Swal.fire({
      title: 'معاينة الطباعة',
      html: `<div style="display:flex;justify-content:center;max-height:400px;overflow-y:auto;background:#fff;padding:10px;border:1px solid #ddd;border-radius:8px;width:100%;max-width:80mm;margin:0 auto;">${receiptHTML}</div>`,
      showCancelButton: true,
      confirmButtonText: 'طباعة الآن',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      width: 'auto'
    }).then(async (result) => {
      if (result.isConfirmed) {
        document.getElementById('receiptPrint').innerHTML = receiptHTML;
        await new Promise(r => setTimeout(r, 120));
        await window.electron.print();
        await new Promise(r => setTimeout(r, 500));
      }
    });
  } catch (err) {
    alert('خطأ في الطباعة: ' + err.message);
  }
}

async function factoryReset() {
  const { value: text } = await Swal.fire({
    title: 'تحذير شديد!',
    text: 'هذا سيمسح النظام بالكامل. اكتب "مسح النظام بالكامل" للتأكيد:',
    input: 'text',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'حذف كل شيء',
    cancelButtonText: 'إلغاء'
  });
  if (text !== 'مسح النظام بالكامل') {
    showToast('تم إلغاء العملية','info'); return;
  }
  
  const tables = ['invoice_items','invoices','return_items','returns','attendance','leaves','advances',
    'deductions','incentives','salary_payments','custody','shifts','expenses','revenues','treasury',
    'purchase_items','purchases','customers','suppliers','partners','employees','services'];
    
  for(let t of tables) await window.db.run(`DELETE FROM ${t}`,[]);
  
  await window.db.run('UPDATE invoice_sequence SET last_number=0',[]);
  await window.db.run(`INSERT INTO treasury (type, description, amount, balance_after, treasury_type) VALUES ('إيراد', 'رصيد افتتاحي', 0, 0, 'الخزينة')`,[]);
  
  showToast('تم ضبط المصنع بنجاح','success');
  setTimeout(()=>goBack(), 2000);
}

// ─── Role Check & Quit ────────────────────────────────────────────────────────
async function applyRoleVisibility() {
  const role = sessionStorage.getItem('elTarzy_role');
  if (role === 'cashier') {
    const cleanupTab = document.getElementById('cleanupTab');
    if(cleanupTab) cleanupTab.style.display = 'none';
  }
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

// Init first tab
applyRoleVisibility();
loadTailorsDropdown().then(() => {
  loadSalesReport();
});