// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('ar-EG-u-nu-latn');
  document.getElementById('dateDisplay').textContent = now.toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}
setInterval(updateClock, 1000);
updateClock();



// ─── Dashboard Stats ──────────────────────────────────────────────────────────
async function loadStats() {
  const today = getLocalISODate();

  const salesRes = await window.db.queryOne(
    `SELECT COALESCE(SUM(net_total),0) as total, COUNT(*) as cnt FROM invoices WHERE invoice_date=? AND is_returned=0`,
    [today]
  );
  if (salesRes.success) {
    document.getElementById('todaySales').textContent = Number(salesRes.data.total).toLocaleString('en-US');
  }

  const expRes = await window.db.queryOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date=?`, [today]
  );
  if (expRes.success) {
    document.getElementById('todayExpenses').textContent = Number(expRes.data.total).toLocaleString('en-US');
  }

  // Daily Net Cash (الخزينة)
  const netCashRes = await window.db.queryOne(
    `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='الخزينة'`,
    [today]
  );
  if (netCashRes.success) {
    document.getElementById('dailyNetCash').textContent = Number(netCashRes.data.net).toLocaleString('en-US');
  }

  // Daily Net Vodafone Cash (فودافون كاش)
  const netVCRes = await window.db.queryOne(
    `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='فودافون كاش'`,
    [today]
  );
  if (netVCRes.success) {
    document.getElementById('dailyNetVodafone').textContent = Number(netVCRes.data.net).toLocaleString('en-US');
  }

  // Daily Net InstaPay (إنستا باي)
  const netIPRes = await window.db.queryOne(
    `SELECT COALESCE(SUM(CASE WHEN type='إيراد' THEN amount ELSE -amount END),0) as net FROM treasury WHERE date=? AND treasury_type='إنستا باي'`,
    [today]
  );
  if (netIPRes.success) {
    document.getElementById('dailyNetInstapay').textContent = Number(netIPRes.data.net).toLocaleString('en-US');
  }

  // Today Advances
  const advRes = await window.db.queryOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM advances WHERE date=?`,
    [today]
  );
  if (advRes.success) {
    document.getElementById('todayAdvances').textContent = Number(advRes.data.total).toLocaleString('en-US');
  }

  const balRes = await window.db.getTreasuryBalance('الخزينة');
  if (balRes.success) {
    document.getElementById('treasuryBalance').textContent = Number(balRes.data).toLocaleString('en-US');
  }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
async function openWhatsApp() {
  const result = await Swal.fire({
    title: 'الدعم الفني',
    text: 'اختر رقم الدعم الفني للتواصل معنا عبر واتساب (Dev Blue Tech):',
    icon: 'info',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'تواصل مع 01129021377',
    denyButtonText: 'تواصل مع 01204165586',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#25d366',
    denyButtonColor: '#128c7e'
  });

  if (result.isConfirmed) {
    window.electron.openExternal('https://wa.me/201129021377');
  } else if (result.isDenied) {
    window.electron.openExternal('https://wa.me/201204165586');
  }
}

// ─── Current User & Role-Based Visibility ─────────────────────────────────────
let currentUser = { id: null, name: '', role: 'admin' };

async function loadSystemLogo() {
  const res = await window.db.getSettings();
  if (res.success && res.data) {
    if (res.data.logo_path) {
      const iconDiv = document.getElementById('navbarLogoIcon');
      const safeLogo = 'file:///' + res.data.logo_path.replace(/\\/g, '/');
      iconDiv.innerHTML = `<img src="${safeLogo}" style="width:100%; height:100%; object-fit:contain; border-radius:12px;">`;
      iconDiv.style.background = 'transparent';
      iconDiv.style.boxShadow = 'none';
    }
    if (res.data.company_name) {
      document.getElementById('navbarLogoText').textContent = res.data.company_name;
    }
  }
}

async function loadCurrentUser() {
  // Try from auth session first
  const sessionRes = await window.auth.getSession();
  if (sessionRes.success && sessionRes.data) {
    const s = sessionRes.data;
    currentUser = { id: s.employeeId, name: s.employeeName, role: s.role };
    document.getElementById('currentUserName').textContent = s.employeeName;
    document.getElementById('userAvatarLetter').textContent = (s.employeeName || 'م').charAt(0);
    document.getElementById('userRoleBadge').textContent = s.role === 'admin' ? 'أدمن' : 'كاشير';

    // Store in sessionStorage for other pages
    sessionStorage.setItem('elTarzy_userId', s.userId);
    sessionStorage.setItem('elTarzy_employeeId', s.employeeId);
    sessionStorage.setItem('elTarzy_employeeName', s.employeeName);
    sessionStorage.setItem('elTarzy_role', s.role);
    sessionStorage.setItem('elTarzy_shiftId', s.shiftId || '');

    // Apply role-based visibility
    applyRoleVisibility(s.role);

    // Show shift indicator if there's an active shift
    if (s.shiftId) {
      document.getElementById('shiftIndicator').style.display = 'flex';
    }
  } else {
    // Not logged in — fallback (check sessionStorage)
    const role = sessionStorage.getItem('elTarzy_role');
    if (!role) {
      // Redirect to login
      window.electron.navigate('login.html');
      return;
    }
    currentUser = {
      id: parseInt(sessionStorage.getItem('elTarzy_employeeId')) || 1,
      name: sessionStorage.getItem('elTarzy_employeeName') || 'مستخدم',
      role: role
    };
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('userAvatarLetter').textContent = currentUser.name.charAt(0);
    document.getElementById('userRoleBadge').textContent = role === 'admin' ? 'أدمن' : 'كاشير';
    applyRoleVisibility(role);

    if (sessionStorage.getItem('elTarzy_shiftId')) {
      document.getElementById('shiftIndicator').style.display = 'flex';
    }
  }
}

async function applyRoleVisibility(role) {
  if (role === 'cashier') {
    // Hide standard admin-only sections first
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = 'none';
    });

    // Fetch granular settings
    const res = await window.db.getSettings();
    if (res.success && res.data) {
      const s = res.data;
      
      // Sidebar items
      const sidebarItems = document.querySelectorAll('.sidebar-nav-item');
      sidebarItems.forEach(item => {
        const text = item.textContent.trim();
        if (s.cashier_hide_reports && text.includes('التقارير')) item.style.display = 'none';
        if (s.cashier_hide_hr && text.includes('شئون الموظفين')) item.style.display = 'none';
        if (s.cashier_prevent_returns && text.includes('المرتجعات')) item.style.display = 'none';
        if (s.cashier_hide_finance && text.includes('الحسابات')) item.style.display = 'none';
        if (s.cashier_prevent_settings && text.includes('الإعدادات')) item.style.display = 'none';
      });

      // Quick action buttons
      document.querySelectorAll('.action-btn').forEach(btn => {
        const label = btn.querySelector('.action-btn-label');
        if (!label) return;
        const text = label.textContent.trim();
        
        // Base allowed for cashier
        let allowed = ['حضور', 'فاتورة بيع', 'انصراف', 'نهاية الشيفت', 'عميل جديد'];
        
        // Add conditionally based on permissions
        if (!s.cashier_prevent_returns) allowed.push('مرتجع بيع');
        if (!s.cashier_hide_finance) allowed.push('الحسابات');
        if (!s.cashier_hide_reports) allowed.push('التقارير');
        
        if (!allowed.includes(text)) {
          btn.style.display = 'none';
        }
      });
    } else {
      // Fallback if DB fetch fails
      document.querySelectorAll('.action-btn').forEach(btn => {
        const label = btn.querySelector('.action-btn-label');
        if (!label) return;
        const text = label.textContent.trim();
        const cashierAllowed = ['حضور', 'فاتورة بيع', 'مرتجع بيع', 'انصراف', 'نهاية الشيفت', 'عميل جديد'];
        if (!cashierAllowed.includes(text)) {
          btn.style.display = 'none';
        }
      });
    }
  }
}


// ─── Logout ───────────────────────────────────────────────────────────────────
async function handleLogout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  await window.auth.logout();
  sessionStorage.clear();
  window.electron.navigate('login.html');
}

// ─── Attendance Modal Logic ───────────────────────────────────────────────────
async function handleAttendance(type) { // type = 'in' or 'out'
  document.getElementById('attendanceModal').classList.add('open');
  
  // Set default date and time
  const now = new Date();
  document.getElementById('attDate').value = now.toISOString().split('T')[0];
  document.getElementById('attTimeIn').value = now.toTimeString().substring(0, 5);
  document.getElementById('attTimeOut').value = now.toTimeString().substring(0, 5);

  // Toggle fields based on type
  if (type === 'in') {
    document.getElementById('attModalTitle').innerHTML = '🟢 تسجيل حضور';
    document.getElementById('attTimeInGroup').style.display = 'block';
    document.getElementById('attTimeOutGroup').style.display = 'none';
    document.getElementById('btnSubmitAttIn').style.display = 'block';
    document.getElementById('btnSubmitAttOut').style.display = 'none';
    document.getElementById('btnSubmitAttOutAll').style.display = 'none';
  } else {
    document.getElementById('attModalTitle').innerHTML = '🔴 تسجيل انصراف';
    document.getElementById('attTimeInGroup').style.display = 'none';
    document.getElementById('attTimeOutGroup').style.display = 'block';
    document.getElementById('btnSubmitAttIn').style.display = 'none';
    document.getElementById('btnSubmitAttOut').style.display = 'block';
    document.getElementById('btnSubmitAttOutAll').style.display = 'block';
  }

  // Load active employees
  const sel = document.getElementById('attEmpSelect');
  sel.innerHTML = '<option value="">-- اختر الموظف / الصنايعي --</option>';
  const res = await window.db.query('SELECT id, name FROM employees WHERE is_active=1 ORDER BY name', []);
  if (res.success) {
    res.data.forEach(e => {
      sel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
    });
  }
}

async function saveDashboardAttendance() {
  const empId = document.getElementById('attEmpSelect').value;
  const date = document.getElementById('attDate').value;
  const timeIn = document.getElementById('attTimeIn').value;
  
  if (!empId || !date || !timeIn) {
    showToast('يجب اختيار الموظف وإدخال التاريخ ووقت الحضور', 'warning');
    return;
  }
  
  const dateTime = `${date}T${timeIn}:00`;
  const currentShift = await window.shift.getCurrent();
  const shiftId = currentShift?.id || null;

  await window.db.run(
    `INSERT INTO attendance (employee_id, date, check_in, shift_id) VALUES (?,?,?,?)`,
    [empId, date, dateTime, shiftId]
  );
  showToast('تم تسجيل الحضور بنجاح', 'success');
  closeModal('attendanceModal');
}

async function saveDashboardCheckout() {
  const empId = document.getElementById('attEmpSelect').value;
  const date = document.getElementById('attDate').value;
  const timeOut = document.getElementById('attTimeOut').value;
  
  if (!empId || !date || !timeOut) {
    showToast('يجب اختيار الموظف وإدخال التاريخ ووقت الانصراف', 'warning');
    return;
  }
  
  // Check if check in exists
  const attRes = await window.db.queryOne(
    `SELECT * FROM attendance WHERE employee_id=? AND date=? AND check_out IS NULL ORDER BY id DESC LIMIT 1`,
    [empId, date]
  );
  if (!attRes.success || !attRes.data) {
    showToast('لا يوجد حضور مسجل لليوم، لا يمكن تسجيل انصراف', 'warning');
    return;
  }

  const dateTime = `${date}T${timeOut}:00`;
  const outDate = new Date(dateTime);
  const checkInTime = new Date(attRes.data.check_in);
  
  const empRes = await window.db.queryOne('SELECT work_hours_per_day FROM employees WHERE id=?', [empId]);
  const workHours = empRes.data?.work_hours_per_day || 8;
  const requiredMinutes = Math.floor(workHours * 60);

  const workedMinutes = Math.floor((outDate - checkInTime) / 60000);
  
  let lateMinutes = 0;
  let extraMinutes = 0;
  
  if (workedMinutes < requiredMinutes) {
    lateMinutes = requiredMinutes - workedMinutes;
  } else if (workedMinutes > requiredMinutes) {
    extraMinutes = workedMinutes - requiredMinutes;
  }

  await window.db.run(
    `UPDATE attendance SET check_out=?, late_minutes=?, extra_minutes=? WHERE id=?`, 
    [dateTime, lateMinutes, extraMinutes, attRes.data.id]
  );
  showToast('تم تسجيل الانصراف بنجاح', 'success');
  closeModal('attendanceModal');
}

async function saveDashboardCheckoutAll() {
  if (!confirm('هل تريد فعلاً تسجيل انصراف لكل من سجل حضور اليوم ولم ينصرف بعد؟ (سيتم احتساب وقت الانصراف ليتطابق مع ساعات عملهم الرسمية بدون تأخير أو زيادة)')) return;

  const date = document.getElementById('attDate').value;
  if (!date) {
    showToast('يجب تحديد التاريخ أولاً', 'error');
    return;
  }

  // Get all active attendances without checkout for this date
  const attListRes = await window.db.query(
    `SELECT a.*, e.work_hours_per_day FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date=? AND a.check_out IS NULL`,
    [date]
  );

  if (!attListRes.success || !attListRes.data || attListRes.data.length === 0) {
    showToast('لا يوجد موظفين حاضرين بدون انصراف لهذا اليوم', 'info');
    return;
  }

  let count = 0;
  for (const att of attListRes.data) {
    const checkInTime = new Date(att.check_in);
    const workHours = att.work_hours_per_day || 8;
    
    // Add workHours to check_in time to get ideal check_out time
    const idealCheckOut = new Date(checkInTime.getTime() + workHours * 60 * 60 * 1000);
    
    // Format to local ISO string keeping local timezone (since the DB expects local time)
    // We can just construct it manually or use simple string slicing if we offset by timezone
    const offsetMs = idealCheckOut.getTimezoneOffset() * 60000;
    const localIso = new Date(idealCheckOut.getTime() - offsetMs).toISOString().slice(0,19);

    await window.db.run(
      `UPDATE attendance SET check_out=?, late_minutes=0, extra_minutes=0 WHERE id=?`,
      [localIso, att.id]
    );
    count++;
  }

  showToast(`تم تسجيل الانصراف لعدد ${count} موظفين بنجاح ✅`, 'success');
  closeModal('attendanceModal');
}

// ─── Auto-Checkout Missing Previous Days ──────────────────────────────────────
async function autoCheckoutMissing() {
  const today = getLocalISODate();
  // Select attendance older than today without checkout
  const res = await window.db.query(
    `SELECT a.*, e.work_hours_per_day FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date < ? AND a.check_out IS NULL`,
    [today]
  );
  if (res.success && res.data && res.data.length > 0) {
    for (const att of res.data) {
      const checkInTime = new Date(att.check_in);
      const workHours = att.work_hours_per_day || 8;
      const idealCheckOut = new Date(checkInTime.getTime() + workHours * 60 * 60 * 1000);
      const offsetMs = idealCheckOut.getTimezoneOffset() * 60000;
      const localIso = new Date(idealCheckOut.getTime() - offsetMs).toISOString().slice(0,19);
      await window.db.run(
        `UPDATE attendance SET check_out=?, late_minutes=0, extra_minutes=0 WHERE id=?`,
        [localIso, att.id]
      );
    }
    console.log(`[Auto-Checkout] Fixed ${res.data.length} missing checkouts from previous days.`);
  }
}
// Run auto checkout silently when dashboard loads
setTimeout(autoCheckoutMissing, 2000);



// ─── End Shift — Navigate to end-shift screen (cashier only) ────────────────────
function endShift() {
  const role = sessionStorage.getItem('elTarzy_role');
  if (role === 'admin') {
    showToast('إنهاء الشيفت مخصص للكاشير فقط وليس لمدير النظام', 'warning');
    return;
  }
  navigate('end-shift.html');
}

// ─── New Customer ─────────────────────────────────────────────────────────────
function showNewCustomerModal() { openModal('newCustomerModal'); }
async function saveNewCustomer() {
  const name = document.getElementById('newCustName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم العميل', 'error'); return; }
  const phone = document.getElementById('newCustPhone').value.trim();
  const address = document.getElementById('newCustAddress').value.trim();
  const balance = parseFloat(document.getElementById('newCustBalance').value) || 0;

  // التحقق من عدم تكرار رقم التليفون
  if (phone) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? LIMIT 1`, [phone]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phone}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  const res = await window.db.run(
    `INSERT INTO customers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)`,
    [name, phone, address, balance, balance]
  );
  if (res.success) {
    showToast(`تم إضافة العميل "${name}" بنجاح `, 'success');
    closeModal('newCustomerModal');
    document.getElementById('newCustName').value = '';
    document.getElementById('newCustPhone').value = '';
    document.getElementById('newCustAddress').value = '';
    document.getElementById('newCustBalance').value = '0';
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── New Supplier ─────────────────────────────────────────────────────────────
function showNewSupplierModal() { openModal('newSupplierModal'); }
async function saveNewSupplier() {
  const name = document.getElementById('newSuppName').value.trim();
  if (!name) { showToast('الرجاء إدخال اسم المورد', 'error'); return; }
  const phone = document.getElementById('newSuppPhone').value.trim();
  const address = document.getElementById('newSuppAddress').value.trim();
  const balance = parseFloat(document.getElementById('newSuppBalance').value) || 0;
  const res = await window.db.run(
    `INSERT INTO suppliers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)`,
    [name, phone, address, balance, balance]
  );
  if (res.success) {
    showToast(`تم إضافة المورد "${name}" بنجاح `, 'success');
    closeModal('newSupplierModal');
    document.getElementById('newSuppName').value = '';
    document.getElementById('newSuppPhone').value = '';
    document.getElementById('newSuppAddress').value = '';
    document.getElementById('newSuppBalance').value = '0';
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── Advance ──────────────────────────────────────────────────────────────────
async function showAdvanceModal() {
  openModal('advanceModal');
  const res = await window.db.query(`SELECT id, name FROM employees WHERE is_active=1`, []);
  const sel = document.getElementById('advEmpId');
  sel.innerHTML = '<option value="">اختر الموظف</option>';
  if (res.success) {
    res.data.forEach(e => { sel.innerHTML += `<option value="${e.id}">${e.name}</option>`; });
  }
}

async function saveAdvance() {
  const empId = document.getElementById('advEmpId').value;
  const amount = parseFloat(document.getElementById('advAmount').value);
  const notes = document.getElementById('advNotes').value.trim();
  const treasury = document.getElementById('advTreasury').value || 'الخزينة';
  if (!empId || !amount || amount <= 0) { showToast('يرجى اختيار الموظف وإدخال المبلغ', 'error'); return; }
  const res = await window.db.run(
    `INSERT INTO advances (employee_id, amount, notes) VALUES (?,?,?)`, [empId, amount, notes]
  );
  if (res.success) {
    await window.db.addTreasuryEntry('مصروف', `سلفة موظف`, amount, treasury);
    showToast('تم تسجيل السلفة بنجاح ', 'success');
    closeModal('advanceModal');
    document.getElementById('advAmount').value = '';
    document.getElementById('advNotes').value = '';
    loadStats();
  } else {
    showToast('حدث خطأ: ' + res.error, 'error');
  }
}

// ─── Partners ─────────────────────────────────────────────────────────────────
async function showPartnersModal() {
  openModal('partnersModal');
  loadPartners();
}

async function loadPartners() {
  const res = await window.db.query(`SELECT * FROM partners ORDER BY id`, []);
  const tbody = document.getElementById('partnersTableBody');
  if (!res.success || !res.data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد شركاء</td></tr>';
    return;
  }
  tbody.innerHTML = res.data.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.share_percent}%</td>
      <td>${p.phone || '—'}</td>
      <td>${Number(p.opening_balance).toLocaleString('en-US')} جنيه</td>
      <td><button class="btn btn-sm btn-danger" onclick="deletePartner(${p.id})">حذف</button></td>
    </tr>
  `).join('');
}

async function addPartner() {
  const name = document.getElementById('partnerName').value.trim();
  const percent = parseFloat(document.getElementById('partnerPercent').value) || 0;
  const phone = document.getElementById('partnerPhone').value.trim();
  if (!name) { showToast('يرجى إدخال اسم الشريك', 'error'); return; }
  const res = await window.db.run(
    `INSERT INTO partners (name, share_percent, phone) VALUES (?,?,?)`, [name, percent, phone]
  );
  if (res.success) {
    document.getElementById('partnerName').value = '';
    document.getElementById('partnerPercent').value = '';
    document.getElementById('partnerPhone').value = '';
    loadPartners();
    showToast('تم إضافة الشريك ', 'success');
  }
}

async function deletePartner(id) {
  if (!confirm('هل تريد حذف هذا الشريك؟')) return;
  await window.db.run(`DELETE FROM partners WHERE id=?`, [id]);
  loadPartners();
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') { e.preventDefault(); navigate('pos-invoice.html'); }
  if (e.key === 'F2') { e.preventDefault(); navigate('daily-report.html'); }
  if (e.key === 'F3') { e.preventDefault(); navigate('finance.html'); }
  if (e.key === 'F4') { e.preventDefault(); showAdvanceModal(); }
});

// ─── Trial Check ─────────────────────────────────────────────────────────────
async function checkTrialStatus() {
  try {
    const status = await window.activation.getStatus();
    const banner = document.getElementById('trialBanner');
    const bannerText = document.getElementById('trialBannerText');

    if (!status.activated && !status.trialExpired) {
      // فترة تجربة نشطة — اعرض التحذير
      banner.style.display = 'flex';
      const days = status.daysLeft;
      bannerText.textContent = days === 1
        ? '⚠️ باقي يوم واحد فقط على انتهاء فترة التجربة المجانية!'
        : `⚠️ باقي ${days} ${days <= 10 ? 'أيام' : 'يوم'} على انتهاء فترة التجربة المجانية`;
      if (days <= 2) {
        banner.style.background = 'linear-gradient(135deg,#7f1d1d,#991b1b)';
        bannerText.style.color = '#FCA5A5';
      }
    } else if (status.trialExpired && !status.activated) {
      // انتهت التجربة أو التفعيل المؤقت — إغلاق كامل للنظام
      banner.style.display = 'flex';
      bannerText.textContent = '🔒 انتهت فترة الصلاحية. الرجاء تفعيل النظام للاستمرار.';
      banner.style.background = 'linear-gradient(135deg,#4a1d1d,#5c1a1a)';
      bannerText.style.color = '#FCA5A5';
      showFullLockOverlay();
    } else if (status.activated && status.isTimed) {
      // تفعيل مؤقت نشط — اعرض الأيام المتبقية كمعلومة
      banner.style.display = 'flex';
      const days = status.daysLeft;
      bannerText.textContent = days === 1
        ? '⚠️ باقي يوم واحد فقط على انتهاء اشتراكك!'
        : `⏳ اشتراكك الحالي ساري ومتبقي ${days} ${days <= 10 ? 'أيام' : 'يوم'} على انتهائه.`;
      
      // تغيير لون البانر ليكون مختلف (مثلاً أزرق/ذهبي)
      if (days <= 5) {
        banner.style.background = 'linear-gradient(135deg,#7f1d1d,#991b1b)'; // تحذير إذا اقترب الانتهاء
        bannerText.style.color = '#FCA5A5';
      } else {
        banner.style.background = 'linear-gradient(135deg,#1B2A4A,#2d4373)';
        banner.style.borderColor = '#C9A84C';
        bannerText.style.color = '#F8FAFC';
      }
    }
  } catch (e) { /* ignore if activation API not available */ }
}

function showFullLockOverlay() {
  let overlay = document.getElementById('lockOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lockOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.backdropFilter = 'blur(10px)';
    
    overlay.innerHTML = `
      <div style="background:var(--card); padding:40px; border-radius:16px; border:1px solid var(--danger); text-align:center; max-width:500px; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
        <div style="font-size:48px; margin-bottom:16px;">🔒</div>
        <h2 style="color:var(--danger); font-size:24px; font-weight:900; margin-bottom:12px;">انتهت فترة التجربة</h2>
        <p style="color:var(--text-secondary); font-size:15px; line-height:1.6; margin-bottom:24px;">
          لقد انتهت فترة التجربة المجانية للنظام. لم يعد بإمكانك استخدام البرنامج إلا بعد شراء النسخة الكاملة وتفعيلها.
        </p>
        <button class="btn btn-primary" style="width:100%; padding:12px; font-size:16px;" onclick="window.electron.navigate('activation.html')">
          الانتقال لصفحة التفعيل
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}

// ─── Quit Confirmation ────────────────────────────────────────────────────────
window.electron.onConfirmBackupBeforeQuit(() => {
  document.getElementById('quitModal').classList.add('open');
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadCurrentUser();
loadSystemLogo();
loadStats();
setInterval(loadStats, 3000); // Refresh stats every 3 seconds
checkTrialStatus(); // ← فحص حالة التجربة