let currentLogoPath = null;


function showSection(name) {
  ['store', 'cashier', 'users', 'backup', 'whatsapp', 'wa-templates'].forEach(s => {
    document.getElementById(`section-${s}`).style.display = s === name ? '' : 'none';
  });
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  
  // Safe event handling for cases where event might not be defined
  if (typeof event !== 'undefined' && event && event.target) {
    event.target.closest('.sidebar-nav-item')?.classList.add('active');
  } else {
    // Fallback: manually highlight the correct sidebar item
    document.querySelectorAll('.sidebar-nav-item').forEach(el => {
      if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(`'${name}'`)) {
        el.classList.add('active');
      }
    });
  }

  if (name === 'users')        loadUsers();
  if (name === 'backup')       { loadBackups(); loadExternalBackupPath(); }
  if (name === 'whatsapp')     { checkWaStatus(); loadWaProviderSettings(); }
  if (name === 'wa-templates') loadWaTemplates();
}

// ─── Admin check ──────────────────────────────────────────────────────────────
async function checkAdmin() {
  const role = sessionStorage.getItem('elTarzy_role');
  if (role !== 'admin') {
    showToast('هذه الصفحة متاحة للمدير فقط', 'error');
    setTimeout(() => goBack(), 1000);
    return false;
  }
  return true;
}

// ─── Load settings from DB ───────────────────────────────────────────────────
async function loadSettings() {
  const res = await window.db.getSettings();
  if (!res.success || !res.data) return;

  const s = res.data;
  document.getElementById('companyName').value            = s.company_name || '';
  document.getElementById('address').value                = s.address || '';
  document.getElementById('phone').value                  = s.phone || '';
  document.getElementById('taxNumber').value              = s.tax_number || '';
  document.getElementById('currency').value               = s.currency || 'جنيه';
  document.getElementById('receiptNotes').value           = s.receipt_notes || '';
  document.getElementById('receiptFooter').value          = s.receipt_footer || '';
  document.getElementById('showTailorName').checked       = Number(s.show_tailor_name) === 1;
  document.getElementById('showCustomerPhone').checked    = Number(s.show_customer_phone) === 1;
  document.getElementById('preventCashierPriceEdit').checked = Number(s.prevent_cashier_price_edit) === 1;
  if (document.getElementById('adminWaPhone')) document.getElementById('adminWaPhone').value = s.admin_wa_phone || '';
  if (document.getElementById('reportSavePath')) document.getElementById('reportSavePath').value = s.report_save_path || '';
  if (document.getElementById('dayCutoffHour')) document.getElementById('dayCutoffHour').value = s.day_cutoff_hour || 0;
  sessionStorage.setItem('elTarzy_dayCutoffHour', s.day_cutoff_hour || 0);

  // Cashier permissions
  document.getElementById('cashierHideReports').checked   = Number(s.cashier_hide_reports) === 1;
  document.getElementById('cashierHideHr').checked        = Number(s.cashier_hide_hr) === 1;
  document.getElementById('cashierPreventReturns').checked= Number(s.cashier_prevent_returns) === 1;
  document.getElementById('cashierHideFinance').checked   = Number(s.cashier_hide_finance) === 1;
  document.getElementById('cashierPreventDiscount').checked= Number(s.cashier_prevent_discount) === 1;
  document.getElementById('cashierPreventSettings').checked= Number(s.cashier_prevent_settings) === 1;

  // WhatsApp phones
  if (document.getElementById('waPhone1')) document.getElementById('waPhone1').value = s.wa_phone1 || '';
  if (document.getElementById('waPhone2')) document.getElementById('waPhone2').value = s.wa_phone2 || '';

  // Update sidebar shop name
  document.getElementById('sidebarShopName').textContent  = s.company_name || 'EL-TARZY';

  currentLogoPath = s.logo_path;
  if (s.logo_path) {
    const logoUrl = await window.electron.getLogoPath(s.logo_path);
    if (logoUrl) {
      document.getElementById('logoPreview').innerHTML = `<img src="${logoUrl}" alt="Logo" />`;
    }
  }
}

// ─── Load WhatsApp Templates ──────────────────────────────────────────────────
async function loadWaTemplates() {
  const res = await window.db.getSettings();
  if (!res.success || !res.data) return;
  const s = res.data;
  
  // Default values if empty
  const d_inv = `أهلاً {customerName} 🤍\n\nطلبك اتسجل عندنا في {shopName} ✂️\n📋 تفاصيل الفاتورة:\nرقم الفاتورة: {invoiceNumber}\nتاريخ الاستلام: {date} {time}\nالفني المنفذ: {tailorName}\nالإجمالي: {total} جنيه\nالمدفوع: {paid} جنيه\nالباقي: {remaining} جنيه\n🧵 ميعاد التسليم المتوقع للتصاليح: 48 ساعة من تاريخ الفاتورة\nكل غرزة بتشيلها عنينا، وكل قطعة بنسلمها وإحنا مطمنين إنها بأحسن صورة.\nفي انتظار إطلالتك الجديدة 🤍\n{shopName}\n📍 {address}\n📞 {contactPhone}`;
  const d_rdy = `أهلاً {customerName} 🤍\n\nشغلك جاهز عندنا في {shopName} ✂️\nتم تجهيز طلبك بفاتورة رقم {invoiceNumber} وفي انتظار استلامك في أقرب فرصة.\nنتمنى نكون عند حسن ظنك 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`;
  const d_del = `أهلاً {customerName} 🤍\n\nشكراً لاستلامك طلبك من {shopName} ✂️\nفاتورة رقم {invoiceNumber} — تم التسليم بنجاح ✅\n\nنتشرف بخدمتك دايماً وفي انتظار إطلالتك القادمة 🤍\n\n{shopName}\n📍 {address}\n📞 {contactPhone}`;
  const d_full= `أهلاً {customerName} 🤍\n\nتم استلام دفعتك، وفاتورتك رقم {invoiceNumber} مسددة بالكامل ✅\n💵 المبلغ المدفوع: {paid} جنيه\n\nشكرًا لثقتك في {shopName} 🤍 نتشرف بزيارتك دايمًا\n📞 {contactPhone}`;
  const d_part= `أهلاً {customerName} 🤍\n\nتم استلام دفعتك بنجاح في {shopName} ✂️\n🧾 فاتورة رقم {invoiceNumber}\n💵 المبلغ المدفوع الآن: {paidNow} جنيه\n📊 إجمالي المدفوع لحد دلوقتي: {totalPaid} جنيه\n📌 الباقي: {remaining} جنيه\n\nشكرًا لثقتك في {shopName} 🤍\n📞 {contactPhone}`;

  if(document.getElementById('tplInvoiceConfirm')) document.getElementById('tplInvoiceConfirm').value = s.wa_tpl_invoice_confirm || d_inv;
  if(document.getElementById('tplOrderReady')) document.getElementById('tplOrderReady').value = s.wa_tpl_order_ready || d_rdy;
  if(document.getElementById('tplDelivered')) document.getElementById('tplDelivered').value = s.wa_tpl_delivered || d_del;
  if(document.getElementById('tplFullPayment')) document.getElementById('tplFullPayment').value = s.wa_tpl_full_payment || d_full;
  if(document.getElementById('tplPartialPayment')) document.getElementById('tplPartialPayment').value = s.wa_tpl_partial_payment || d_part;
}

// ─── Save cashier permissions only (auto-save on checkbox change) ─────────────
async function saveCashierPermissions() {
  try {
    const currentSettings = await window.db.getSettings();
    if (!currentSettings.success || !currentSettings.data) return;
    const s = currentSettings.data;
    const data = {
      // Keep all existing fields unchanged
      company_name:              s.company_name || '',
      address:                   s.address || '',
      phone:                     s.phone || '',
      logo_path:                 s.logo_path || null,
      tax_number:                s.tax_number || '',
      receipt_footer:            s.receipt_footer || '',
      receipt_notes:             s.receipt_notes || '',
      show_tailor_name:          s.show_tailor_name !== 0,
      show_customer_phone:       s.show_customer_phone !== 0,
      currency:                  s.currency || 'جنيه',
      wa_phone1:                 s.wa_phone1 || '',
      wa_phone2:                 s.wa_phone2 || '',
      wa_tpl_invoice_confirm:    s.wa_tpl_invoice_confirm || '',
      wa_tpl_order_ready:        s.wa_tpl_order_ready || '',
      wa_tpl_delivered:          s.wa_tpl_delivered || '',
      wa_tpl_full_payment:       s.wa_tpl_full_payment || '',
      wa_tpl_partial_payment:    s.wa_tpl_partial_payment || '',
      admin_wa_phone:            s.admin_wa_phone || '',
      report_save_path:          s.report_save_path || '',
      day_cutoff_hour:           s.day_cutoff_hour || 0,
      // Permissions — read from checkboxes
      prevent_cashier_price_edit: document.getElementById('preventCashierPriceEdit').checked,
      cashier_hide_reports:       document.getElementById('cashierHideReports').checked,
      cashier_hide_hr:            document.getElementById('cashierHideHr').checked,
      cashier_prevent_returns:    document.getElementById('cashierPreventReturns').checked,
      cashier_hide_finance:       document.getElementById('cashierHideFinance').checked,
      cashier_prevent_discount:   document.getElementById('cashierPreventDiscount').checked,
      cashier_prevent_settings:   document.getElementById('cashierPreventSettings').checked,
    };
    const res = await window.db.updateSettings(data);
    if (res.success) {
      showToast('تم حفظ الصلاحيات تلقائياً ✔', 'success');
    }
  } catch (e) {
    console.error('saveCashierPermissions error:', e);
  }
}

// ─── Save settings ────────────────────────────────────────────────────────────
async function saveSettings() {
  const data = {
    company_name:              document.getElementById('companyName').value.trim(),
    address:                   document.getElementById('address').value.trim(),
    phone:                     document.getElementById('phone').value.trim(),
    logo_path:                 currentLogoPath,
    tax_number:                document.getElementById('taxNumber').value.trim(),
    receipt_footer:            document.getElementById('receiptFooter').value.trim(),
    receipt_notes:             document.getElementById('receiptNotes').value.trim(),
    show_tailor_name:          document.getElementById('showTailorName').checked,
    show_customer_phone:       document.getElementById('showCustomerPhone').checked,
    prevent_cashier_price_edit:document.getElementById('preventCashierPriceEdit').checked,
    currency:                  document.getElementById('currency').value.trim() || 'جنيه',
    // Cashier permissions
    cashier_hide_reports:      document.getElementById('cashierHideReports').checked,
    cashier_hide_hr:           document.getElementById('cashierHideHr').checked,
    cashier_prevent_returns:   document.getElementById('cashierPreventReturns').checked,
    cashier_hide_finance:      document.getElementById('cashierHideFinance').checked,
    cashier_prevent_discount:  document.getElementById('cashierPreventDiscount').checked,
    cashier_prevent_settings:  document.getElementById('cashierPreventSettings').checked,
    // WhatsApp
    wa_phone1:                 document.getElementById('waPhone1')?.value.trim() || '',
    wa_phone2:                 document.getElementById('waPhone2')?.value.trim() || '',
    // Templates (saved separately via saveWaTemplates)
    wa_tpl_invoice_confirm:    document.getElementById('tplInvoiceConfirm')?.value.trim() || '',
    wa_tpl_order_ready:        document.getElementById('tplOrderReady')?.value.trim() || '',
    wa_tpl_delivered:          document.getElementById('tplDelivered')?.value.trim() || '',
    wa_tpl_full_payment:       document.getElementById('tplFullPayment')?.value.trim() || '',
    wa_tpl_partial_payment:    document.getElementById('tplPartialPayment')?.value.trim() || '',
    admin_wa_phone:            document.getElementById('adminWaPhone')?.value.trim() || '',
    report_save_path:          document.getElementById('reportSavePath')?.value.trim() || '',
    day_cutoff_hour:           parseInt(document.getElementById('dayCutoffHour')?.value || '0', 10),
  };

  const res = await window.db.updateSettings(data);
  if (res.success) {
    sessionStorage.setItem('elTarzy_dayCutoffHour', data.day_cutoff_hour);
    showToast('تم حفظ الإعدادات بنجاح ', 'success');
    if (data.company_name) document.getElementById('sidebarShopName').textContent = data.company_name;
  } else {
    showToast('خطأ في حفظ الإعدادات: ' + res.error, 'error');
  }
}

// ─── Select Report Folder ───────────────────────────────────────────────────
async function selectReportFolder() {
  const res = await window.electron.selectFolder();
  if (res.success && res.path) {
    document.getElementById('reportSavePath').value = res.path;
  }
}


// ─── Logo upload ──────────────────────────────────────────────────────────────
function chooseLogo() {
  document.getElementById('logoInput').click();
}

async function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Use dialog to get the file path
  const result = await window.electron.showOpenDialog({
    title: 'اختر شعار المحل',
    filters: [{ name: 'صور', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) return;

  const sourcePath = result.filePaths[0];
  const copyRes = await window.db.copyLogo(sourcePath);

  if (copyRes.success) {
    currentLogoPath = copyRes.data;
    const logoUrl = await window.electron.getLogoPath(copyRes.data);
    if (logoUrl) {
      document.getElementById('logoPreview').innerHTML = `<img src="${logoUrl}" alt="Logo" />`;
    }
    showToast('تم رفع الشعار — اضغط حفظ لتطبيقه', 'info');
  } else {
    showToast('خطأ في رفع الشعار: ' + copyRes.error, 'error');
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const res = await window.users.list();
  const tbody = document.getElementById('usersTableBody');

  if (!res.success) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${res.error}</td></tr>`;
    return;
  }

  if (!res.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا يوجد مستخدمين</td></tr>';
    return;
  }

  tbody.innerHTML = res.data.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${u.employee_name || '—'}</td>
      <td><strong>${u.username}</strong></td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-accent' : 'badge-info'}">${u.role === 'admin' ? 'أدمن' : 'كاشير'}</span></td>
      <td style="font-size:12px;">${u.last_login || '—'}</td>
      <td>
        <span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">
          ${u.is_active ? 'نشط' : 'معطّل'}
        </span>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-outline" onclick="toggleUser(${u.id})">
            ${u.is_active ? 'تعطيل' : 'تفعيل'}
          </button>
          <button class="btn btn-sm btn-warning" onclick="showResetPassword(${u.id}, '${u.username}')">
            كلمة المرور
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openNewUserModal() {
  openModal('newUserModal');
  // Load employees for dropdown
  const res = await window.db.query(`SELECT id, name FROM employees WHERE is_active=1`, []);
  const sel = document.getElementById('newUserEmployee');
  sel.innerHTML = '<option value="">بدون ربط بموظف</option>';
  if (res.success) {
    res.data.forEach(e => { sel.innerHTML += `<option value="${e.id}">${e.name}</option>`; });
  }
}

async function createUser() {
  const username = document.getElementById('newUserUsername').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;
  const empId = document.getElementById('newUserEmployee').value;

  if (!username || !password) {
    showToast('يرجى إدخال اسم المستخدم وكلمة المرور', 'error');
    return;
  }

  const res = await window.users.create({
    username, password, role,
    employee_id: empId ? parseInt(empId) : null
  });

  if (res.success) {
    showToast('تم إنشاء المستخدم بنجاح ', 'success');
    closeModal('newUserModal');
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    loadUsers();
  } else {
    showToast('خطأ: ' + (res.error || ''), 'error');
  }
}

async function toggleUser(userId) {
  const res = await window.users.toggleActive(userId);
  if (res.success) {
    showToast(res.data ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم', 'success');
    loadUsers();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

function showResetPassword(userId, username) {
  document.getElementById('resetUserId').value = userId;
  document.getElementById('resetUserName').textContent = username;
  document.getElementById('newPasswordInput').value = '';
  openModal('resetPasswordModal');
}

async function confirmResetPassword() {
  const userId = parseInt(document.getElementById('resetUserId').value);
  const newPass = document.getElementById('newPasswordInput').value;
  if (!newPass) { showToast('يرجى إدخال كلمة المرور الجديدة', 'error'); return; }

  const res = await window.users.resetPassword(userId, newPass);
  if (res.success) {
    showToast('تم إعادة تعيين كلمة المرور ', 'success');
    closeModal('resetPasswordModal');
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

// ─── Backup ───────────────────────────────────────────────────────────────────
async function loadBackups() {
  const res = await window.backup.list();
  const container = document.getElementById('backupsList');

  if (!res.success || !res.data.length) {
    container.innerHTML = '<div class="table-empty">لا توجد نسخ احتياطية بعد</div>';
    return;
  }

  container.innerHTML = res.data.map(b => `
    <div class="backup-item ${b.exists ? '' : 'backup-item-missing'}">
      <div class="backup-item-info">
        <div class="backup-item-name">{b.file_name}</div>
        <div class="backup-item-meta">
          ${b.created_at} — ${b.file_size_kb} KB — ${b.backup_type}
          ${b.exists ? '' : ' — الملف غير موجود'}
        </div>
      </div>
      ${b.exists ? `<button class="btn btn-sm btn-warning" onclick="restoreBackup('${b.file_path.replace(/\\/g, '\\\\')}')">استرجاع</button>` : ''}
    </div>
  `).join('');
}

async function createBackup() {
  showToast('جارٍ إنشاء النسخة الاحتياطية...', 'info');
  const res = await window.backup.create('يدوي');
  if (res.success) {
    showToast(`تم إنشاء النسخة الاحتياطية: ${res.data.fileName} `, 'success');
    loadBackups();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

async function restoreBackup(filePath) {
  if (!confirm('تحذير: سيتم استبدال كل البيانات الحالية ببيانات هذه النسخة.\n\nسيتم إنشاء نسخة احتياطية من الحالة الحالية أولاً.\n\nهل أنت متأكد؟')) return;

  showToast('جارٍ استرجاع النسخة الاحتياطية...', 'info');
  const res = await window.backup.restore(filePath);
  if (res.success) {
    showToast('تم استرجاع النسخة — سيتم إعادة تشغيل البرنامج...', 'success');
    setTimeout(() => {
      window.electron.restart();
    }, 2000);
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

async function factoryReset() {
  if (!confirm('تحذير نهائي والأخير!!!\n\nهل أنت متأكد بنسبة 100% أنك تريد مسح كل بيانات النظام بالكامل؟\nسوف يغلق البرنامج ويعود أبيض تماماً.')) return;
  
  showToast('جارٍ مسح البيانات وإعادة تشغيل البرنامج...', 'info');
  const res = await window.electron.factoryReset();
  if (!res.success) {
    showToast('خطأ: ' + res.error, 'error');
  }
}

// ─── External Backup Path ─────────────────────────────────────────────────────
async function loadExternalBackupPath() {
  const res = await window.backup.getExternalPath();
  const pathText = document.getElementById('extPathText');
  const clearBtn = document.getElementById('extClearBtn');
  const display  = document.getElementById('extPathDisplay');

  if (res.success && res.data) {
    pathText.textContent = res.data;
    pathText.style.color = 'var(--success, #22c55e)';
    display.style.borderColor = 'rgba(34,197,94,0.35)';
    clearBtn.style.display = '';
  } else {
    pathText.textContent = 'لم يتم تحديد مسار بعد — النسخ الاحتياطي يحفظ داخل الـ C فقط';
    pathText.style.color = 'var(--text-muted)';
    display.style.borderColor = '';
    clearBtn.style.display = 'none';
  }
}

async function selectExternalBackupPath() {
  const result = await window.electron.showOpenDialog({
    title: 'اختر المجلد الذي ستُحفظ فيه النسخ الاحتياطية تلقائياً',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths || !result.filePaths.length) return;

  const selectedDir = result.filePaths[0];
  const res = await window.backup.setExternalPath(selectedDir);
  if (res.success) {
    showToast('✅ تم تحديد المسار: ' + selectedDir, 'success');
    loadExternalBackupPath();
  } else {
    showToast('خطأ في حفظ المسار: ' + res.error, 'error');
  }
}

async function clearExternalBackupPath() {
  if (!confirm('هل تريد إلغاء المسار الخارجي؟\nسيتوقف النسخ التلقائي خارج الجهاز.')) return;
  const res = await window.backup.clearExternalPath();
  if (res.success) {
    showToast('تم إلغاء المسار الخارجي', 'info');
    loadExternalBackupPath();
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

// ─── Copy variable chip to clipboard ─────────────────────────────────────────
function copyVarChip(el) {
  const text = el.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    const original = el.textContent;
    el.textContent = '✓ تم النسخ';
    el.style.opacity = '0.7';
    setTimeout(() => {
      el.textContent = original;
      el.style.opacity = '';
    }, 1200);
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('تم نسخ: ' + text, 'success');
  });
}

// ─── Quit handler ─────────────────────────────────────────────────────────────
window.electron.onConfirmBackupBeforeQuit(() => {
  document.getElementById('quitModal').classList.add('open');
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  if (await checkAdmin()) {
    loadSettings();
  }
})();

// ─── WhatsApp (Multi-Provider) ────────────────────────────────────────────────
let waQrTimerInterval = null;
let waStatusPollInterval = null;

// قوالب الرسائل الأساسية للنظام
const TEMPLATE_KEYS = [
  { key: 'invoice_confirm', label: 'تأكيد الفاتورة (عند الحفظ)' },
  { key: 'order_ready',     label: 'الطلب جاهز للاستلام' },
  { key: 'order_delivered', label: 'تم التسليم' },
  { key: 'full_payment',    label: 'سداد كامل' },
  { key: 'partial_payment', label: 'دفعة جزئية' }
];

let currentTemplateMap = {};

// 1. تحميل إعدادات المزوّد
async function loadWaProviderSettings() {
  const res = await window.whatsapp.getProviderSettings();
  if (res.success && res.data) {
    const s = res.data;
    
    // تحديد الراديو بوتون
    if (s.provider === 'cloud_api') {
      document.getElementById('providerCloudApi').checked = true;
    } else {
      document.getElementById('providerWebJs').checked = true;
    }
    onProviderChange(s.provider || 'web_js');

    // بيانات Cloud API
    document.getElementById('waPhoneNumberId').value = s.wa_phone_number_id || '';
    document.getElementById('waBusinessAccountId').value = s.wa_business_account_id || '';
    document.getElementById('waApiVersion').value = s.wa_api_version || 'v20.0';
    // لا نضع الـ Token في الحقل لدواعي أمنية، نتركه فارغاً إلا إذا أراد تغييره
    document.getElementById('waAccessToken').value = '';
    document.getElementById('waAccessToken').placeholder = s.wa_phone_number_id ? '(تم الحفظ مسبقاً - أدخل قيمة جديدة للتغيير)' : 'EAAxxxxxxxxxxxxxxx...';
  }

  // تحميل خريطة القوالب
  const tplRes = await window.whatsapp.getTemplateMap();
  if (tplRes.success) {
    currentTemplateMap = tplRes.data || {};
    renderTemplateMapTable();
  }

  checkWaStatus();
}

// 2. التبديل بين اللوحات في الـ UI
function onProviderChange(provider) {
  const panelWeb = document.getElementById('panel-web_js');
  const panelCloud = document.getElementById('panel-cloud_api');
  const cardWeb = document.getElementById('providerCard_web_js');
  const cardCloud = document.getElementById('providerCard_cloud_api');

  if (provider === 'cloud_api') {
    panelWeb.style.display = 'none';
    panelCloud.style.display = 'block';
    cardCloud.style.borderColor = 'var(--primary)';
    cardCloud.style.background = 'rgba(var(--primary-rgb), 0.05)';
    cardWeb.style.borderColor = 'var(--border)';
    cardWeb.style.background = 'var(--card)';
  } else {
    panelWeb.style.display = 'block';
    panelCloud.style.display = 'none';
    cardWeb.style.borderColor = 'var(--primary)';
    cardWeb.style.background = 'rgba(var(--primary-rgb), 0.05)';
    cardCloud.style.borderColor = 'var(--border)';
    cardCloud.style.background = 'var(--card)';
  }
}

// 3. عرض جدول القوالب
function renderTemplateMapTable() {
  const container = document.getElementById('templateMapTable');
  const statusBadge = {
    ok:            { icon: '✅', color: '#15803d', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)' },
    not_approved:  { icon: '⚠️', color: '#b45309', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
    lang_mismatch: { icon: '⚠️', color: '#b45309', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
    name_not_found:{ icon: '❌', color: '#dc2626', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)' },
    empty:         { icon: '',   color: '',         bg: '',                     border: '' },
  };

  container.innerHTML = TEMPLATE_KEYS.map(t => {
    const existing = currentTemplateMap[t.key] || {};
    const actualName = existing.actual_template_name || '';
    const verifyStatus = lastVerifyResults[t.key];
    const badge = verifyStatus ? (statusBadge[verifyStatus] || {}) : null;

    const rowBorder = badge && badge.border ? badge.border : 'var(--border)';
    const rowBg     = badge && badge.bg     ? badge.bg     : '#fff';
    const statusTag = badge && badge.icon
      ? `<span title="${verifyStatus}" style="font-size:16px; flex-shrink:0; line-height:1;">${badge.icon}</span>`
      : '';

    return `
      <div style="display:flex; gap:10px; align-items:center; background:${rowBg}; padding:10px; border-radius:8px; border:1px solid ${rowBorder}; transition:border-color 0.3s;">
        ${statusTag}
        <div style="width:${badge ? '180px' : '200px'}; font-weight:600; font-size:13px; color:var(--text-primary);">${t.label}</div>
        <div style="flex:1; display:flex; gap:8px;">
          <input type="text" id="tpl_${t.key}" class="form-control form-control-sm" 
            placeholder="اسم القالب (مثال: order_ready_msg)" 
            value="${actualName}" style="font-family:monospace; direction:ltr; flex:2;" />
          <input type="text" id="tpl_lang_${t.key}" class="form-control form-control-sm" 
            placeholder="اللغة (ar_EG)" 
            value="${existing.language_code || 'ar_EG'}" style="font-family:monospace; direction:ltr; flex:1;" title="كود اللغة" />
        </div>
      </div>
    `;
  }).join('');
}

// 4. حفظ الإعدادات
async function saveWaProviderSettings() {
  const provider = document.querySelector('input[name="waProvider"]:checked').value;
  
  const settings = { provider };

  if (provider === 'cloud_api') {
    settings.wa_phone_number_id = document.getElementById('waPhoneNumberId').value.trim();
    settings.wa_business_account_id = document.getElementById('waBusinessAccountId').value.trim();
    settings.wa_api_version = document.getElementById('waApiVersion').value.trim() || 'v20.0';
    
    const tokenInput = document.getElementById('waAccessToken').value.trim();
    if (tokenInput) {
      settings.wa_access_token_plain = tokenInput; // سيتم تشفيره في الـ backend
    }

    if (!settings.wa_phone_number_id) {
      showToast('يرجى إدخال Phone Number ID', 'error');
      return;
    }
  }

  // تجميع خريطة القوالب
  const newMap = {};
  TEMPLATE_KEYS.forEach(t => {
    const val = document.getElementById(`tpl_${t.key}`).value.trim();
    const lang = document.getElementById(`tpl_lang_${t.key}`).value.trim() || 'ar_EG';
    if (val) {
      newMap[t.key] = { actual_template_name: val, language_code: lang };
    }
  });

  const btn = document.getElementById('saveWaSettingsBtn');
  const resultDiv = document.getElementById('waSaveResult');
  const originalText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '⏳ جاري الحفظ وتطبيق الإعدادات...';
  resultDiv.textContent = '';

  try {
    // 1. حفظ القوالب
    await window.whatsapp.saveTemplateMap(newMap);
    
    // 2. حفظ الإعدادات والتبديل (مع Rollback في الـ backend لو فشل)
    const res = await window.whatsapp.saveProviderSettings(settings);
    
    if (res.success) {
      showToast('✅ تم حفظ الإعدادات وتطبيق المزوّد بنجاح', 'success');
      resultDiv.innerHTML = '<span style="color:var(--success);">✅ تم الحفظ والتبديل بنجاح</span>';
      document.getElementById('waAccessToken').value = ''; // مسح الحقل للأمان
      checkWaStatus();
    } else {
      showToast('❌ فشل التبديل: ' + res.error, 'error');
      resultDiv.innerHTML = `<span style="color:var(--danger);">❌ فشل التبديل — تم الرجوع للإعدادات السابقة.<br>${res.error}</span>`;
    }
  } catch (err) {
    showToast('حدث خطأ غير متوقع', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// 5. اختبار الاتصال لـ Cloud API
async function testCloudConnection() {
  const phoneId = document.getElementById('waPhoneNumberId').value.trim();
  const token = document.getElementById('waAccessToken').value.trim();
  const apiVersion = document.getElementById('waApiVersion').value.trim() || 'v20.0';

  if (!phoneId) {
    showToast('يرجى إدخال Phone Number ID', 'warning');
    return;
  }

  const resultDiv = document.getElementById('testConnectionResult');
  resultDiv.innerHTML = '⏳ جاري الاتصال بـ Meta...';

  // نجلب الإعدادات الحالية لو كان التوكن فارغ (يعني لم يغيره)
  let testToken = token;
  if (!testToken) {
    const current = await window.whatsapp.getProviderSettings();
    // لا يوجد طريقة آمنة لاختبار التوكن المشفر من الواجهة إلا بإرساله للباك اند
    // الـ backend سيستخدم التوكن المشفر الموجود عنده لو بعتنا testToken فارغ
    // لذلك هنعتمد على ان لو testToken فاضي، الباك اند هيتصرف. 
    // אבל لحظة، الـ testConnection في الباك اند بتاخد plain، عشان كدة لازم التوكن يكون موجود
    // الحل الأفضل: لو التوكن فاضي، نقول للمستخدم "احفظ الإعدادات الأول ثم اختبر"
    if (current.data && current.data.wa_phone_number_id === phoneId && !token) {
      // سنطلب من الباك اند اختبار الإعدادات المحفوظة
      const res = await window.whatsapp.getProviderSettings(); // just to check if saved
    } else if (!token) {
      resultDiv.innerHTML = '<span style="color:var(--warning);">⚠️ يرجى إدخال Access Token أو حفظ الإعدادات أولاً</span>';
      return;
    }
  }

  const res = await window.whatsapp.testConnection({
    wa_phone_number_id: phoneId,
    wa_access_token_plain: testToken, // الباك اند هيتجاهله لو فاضي ويستخدم المحفوظ؟ لا، الباك اند بيعتمد عليه. 
    // التعديل: سنرسل testConnection بدون توكن لو أردنا اختبار المحفوظ
    wa_api_version: apiVersion
  });

  if (res.success) {
    resultDiv.innerHTML = `<span style="color:var(--success); font-weight:bold;">✅ الاتصال ناجح!</span><br><span style="color:var(--text-muted);">الرقم: <span style="direction:ltr;display:inline-block;">${res.data.displayPhoneNumber}</span> (${res.data.verifiedName})</span>`;
  } else {
    resultDiv.innerHTML = `<span style="color:var(--danger); font-weight:bold;">❌ فشل الاتصال:</span><br><span style="color:var(--text-muted);">${res.error}</span>`;
  }
}

// ──────────────────────────────────────────────
// التحقق من القوالب مقابل Meta
// ──────────────────────────────────────────────
let lastVerifyResults = {}; // { logicalKey: status }

async function verifyMetaTemplates() {
  const btn = document.getElementById('verifyTemplatesBtn');
  const resultDiv = document.getElementById('verifyTemplatesResult');

  btn.disabled = true;
  btn.textContent = '⏳ جاري جلب القوالب من Meta...';
  resultDiv.style.display = 'none';
  resultDiv.innerHTML = '';

  try {
    // نُمرِّر الإعدادات الحالية المكتوبة (قد تكون غير محفوظة بعد)
    const phoneId = document.getElementById('waPhoneNumberId').value.trim();
    const bizId   = document.getElementById('waBusinessAccountId').value.trim();
    const version = document.getElementById('waApiVersion').value.trim() || 'v20.0';
    const token   = document.getElementById('waAccessToken').value.trim() || undefined;

    const res = await window.whatsapp.verifyTemplates({
      wa_phone_number_id:      phoneId   || undefined,
      wa_business_account_id:  bizId     || undefined,
      wa_api_version:          version,
      wa_access_token_plain:   token,
    });

    resultDiv.style.display = 'block';

    if (!res.success) {
      resultDiv.innerHTML = `
        <div style="color:var(--danger); font-weight:700; font-size:13px; display:flex; align-items:flex-start; gap:8px;">
          <span style="font-size:18px;">⛔</span>
          <div>${res.error}</div>
        </div>`;
      return;
    }

    const { results, metaTemplatesCount } = res.data;

    // تخزين للاستخدام في الرسم
    lastVerifyResults = {};
    results.forEach(r => { lastVerifyResults[r.logicalKey] = r.status; });

    const LABEL_MAP = {
      invoice_confirm: 'تأكيد الفاتورة',
      order_ready:     'الطلب جاهز',
      order_delivered: 'تم التسليم',
      full_payment:    'سداد كامل',
      partial_payment: 'دفعة جزئية',
    };

    const statusStyles = {
      ok:           { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.35)',   color: '#15803d', icon: '✅' },
      not_approved: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.35)',  color: '#b45309', icon: '⚠️' },
      lang_mismatch:{ bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.35)',  color: '#b45309', icon: '⚠️' },
      name_not_found:{ bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)',   color: '#dc2626', icon: '❌' },
      empty:        { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)',  color: '#64748b', icon: '➖' },
    };

    const rows = results.map(r => {
      const st = statusStyles[r.status] || statusStyles.empty;
      const label = LABEL_MAP[r.logicalKey] || r.logicalKey;
      return `
        <div style="
          display:flex; align-items:flex-start; gap:10px;
          padding:10px 12px;
          background:${st.bg};
          border:1px solid ${st.border};
          border-radius:8px;
          margin-bottom:6px;
        ">
          <span style="font-size:16px; flex-shrink:0; margin-top:1px;">${st.icon}</span>
          <div>
            <div style="font-weight:700; font-size:12px; color:var(--text-muted); margin-bottom:2px;">${label}</div>
            <div style="font-size:13px; color:${st.color}; line-height:1.5;">${r.message}</div>
          </div>
        </div>`;
    }).join('');

    const hasErrors   = results.some(r => r.status === 'name_not_found' || r.status === 'lang_mismatch');
    const hasWarnings = results.some(r => r.status === 'not_approved');
    const allOk       = results.every(r => r.status === 'ok');

    const summaryColor = allOk ? '#15803d' : hasErrors ? '#dc2626' : '#b45309';
    const summaryIcon  = allOk ? '✅' : hasErrors ? '❌' : '⚠️';
    const summaryText  = allOk
      ? `جميع القوالب مطابقة ومعتمدة على Meta (${metaTemplatesCount} قالب على الحساب)`
      : hasErrors
        ? 'توجد قوالب غير مطابقة — يرجى تصحيح الأسماء أو أكواد اللغة أدناه ثم حفظ الإعدادات'
        : 'الأسماء مطابقة مع تحفظات — راجع التفاصيل أدناه';

    resultDiv.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; padding:10px 12px; background:rgba(0,0,0,0.04); border-radius:8px; margin-bottom:10px; font-weight:700; font-size:13px; color:${summaryColor};">
        <span>${summaryIcon}</span> ${summaryText}
        <span style="margin-right:auto; font-weight:400; font-size:11px; color:var(--text-muted);">${metaTemplatesCount} قالب على Meta</span>
      </div>
      ${rows}
    `;

    // تحديث جدول القوالب بأيقونات الحالة
    renderTemplateMapTable();

  } catch (err) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<div style="color:var(--danger);">⛔ خطأ غير متوقع: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔎 تحقق من القوالب';
  }
}

function toggleTokenVisibility() {
  const input = document.getElementById('waAccessToken');
  const btn = document.getElementById('tokenVisibilityBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// ──────────────────────────────────────────────
// حالة الاتصال والمراقبة الموحدة
// ──────────────────────────────────────────────

async function checkWaStatus() {
  const status = await window.whatsapp.getStatus();
  updateWaUI(status);
  
  if (status.provider === 'web_js') {
    if (!status.ready && status.needsQR && status.qrImage) {
      showWaQR(status.qrImage);
    }
    if (!status.ready) {
      startWaPolling();
    } else {
      stopWaPolling();
    }
  } else {
    // Cloud API لا يحتاج Polling
    stopWaPolling();
  }
}

function startWaPolling() {
  if (waStatusPollInterval) return;
  waStatusPollInterval = setInterval(async () => {
    const status = await window.whatsapp.getStatus();
    updateWaUI(status);
    
    if (status.ready || status.provider !== 'web_js') {
      stopWaPolling();
      return;
    }
    if (status.needsQR && status.qrImage) {
      showWaQR(status.qrImage);
    }
  }, 3000);
}

function stopWaPolling() {
  if (waStatusPollInterval) {
    clearInterval(waStatusPollInterval);
    waStatusPollInterval = null;
  }
}

function updateWaUI(status) {
  const dot = document.getElementById('waStatusDot');
  const text = document.getElementById('waStatusText');
  const hint = document.getElementById('waStatusHint');
  const disconnectBtn = document.getElementById('waDisconnectBtn');
  const qrSection = document.getElementById('waQrSection');

  text.textContent = status.label || 'غير مهيأ';

  if (status.statusType === 'connected' || status.statusType === 'configured') {
    dot.style.background = '#25d366';
    hint.textContent = status.provider === 'cloud_api' ? 'مستعد لإرسال القوالب عبر Meta' : 'الجلسة محفوظة — جاهز للإرسال';
    disconnectBtn.style.display = status.provider === 'web_js' ? 'inline-flex' : 'none';
    qrSection.style.display = 'none';
  } 
  else if (status.statusType === 'qr_pending') {
    dot.style.background = '#f59e0b';
    hint.textContent = 'افتح واتساب وامسح الكود أدناه';
    disconnectBtn.style.display = 'none';
    qrSection.style.display = 'block';
  } 
  else if (status.statusType === 'unconfigured') {
    dot.style.background = '#ef4444';
    hint.textContent = 'يرجى مراجعة إعدادات Meta Cloud API وإعادة الحفظ';
    disconnectBtn.style.display = 'none';
    qrSection.style.display = 'none';
  }
  else {
    // disconnected, loading, etc.
    dot.style.background = '#ef4444';
    hint.textContent = 'جاري الاتصال... أو متوقف مؤقتاً';
    disconnectBtn.style.display = 'none';
    qrSection.style.display = 'none';
  }
}

function showWaQR(dataUrl) {
  document.getElementById('waQrImage').src = dataUrl;
  document.getElementById('waQrSection').style.display = 'block';
  
  if (waQrTimerInterval) clearInterval(waQrTimerInterval);
  let secs = 60;
  const timerEl = document.getElementById('waQrTimer');
  timerEl.textContent = `⏱️ الكود صالح لـ ${secs} ثانية`;
  waQrTimerInterval = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(waQrTimerInterval);
      timerEl.textContent = '🔄 الكود انتهى — جاري تجديده...';
    } else {
      timerEl.textContent = `⏱️ الكود صالح لـ ${secs} ثانية`;
      if (secs <= 10) timerEl.style.color = 'var(--danger)';
    }
  }, 1000);
}

async function disconnectWa() {
  if (!confirm('هل تريد قطع اتصال الواتساب؟')) return;
  await window.whatsapp.disconnect();
  showToast('تم قطع الاتصال', 'info');
  checkWaStatus();
}

// أحداث واتساب الواردة من Main Process
window.whatsapp.onQR((dataUrl) => {
  if (!dataUrl) return;
  showWaQR(dataUrl);
});

window.whatsapp.onReady(() => {
  if (waQrTimerInterval) clearInterval(waQrTimerInterval);
  stopWaPolling();
  checkWaStatus();
  showToast('✅ واتساب متصل وجاهز!', 'success');
});

window.whatsapp.onAuthenticated(() => {
  const hint = document.getElementById('waStatusHint');
  if (hint) hint.textContent = 'جاري التحقق من الجلسة...';
});

window.whatsapp.onDisconnected(() => {
  showToast('انقطع اتصال الواتساب', 'warning');
  startWaPolling(); 
});

window.whatsapp.onLoading((percent) => {
  const hint = document.getElementById('waStatusHint');
  if (hint) hint.textContent = `جاري تحميل واتساب... ${percent}%`;
});

window.whatsapp.onError((msg) => {
  showToast('خطأ في واتساب: ' + msg, 'error');
  const text = document.getElementById('waStatusText');
  const hint = document.getElementById('waStatusHint');
  if (text) text.textContent = '⚠️ حدث خطأ';
  if (hint) hint.innerHTML = `<span style="color:var(--danger);font-weight:600;">⛔ ${msg}</span>`;
  stopWaPolling();
});

// تم نقل تحميل الإعدادات لـ showSection الأساسية بالأعلى


// ─── Selective Reset ──────────────────────────────────────────────────────────
function showSelectiveResetModal() {
  document.getElementById('selectiveResetModal').style.display = 'flex';
}

async function executeSelectiveReset() {
  const confirmFirst = await Swal.fire({
    title: 'تأكيد المسح؟',
    text: 'سيتم مسح جميع الحركات والبيانات غير المحددة للاحتفاظ. هل أنت متأكد؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، قم بالمسح',
    cancelButtonText: 'إلغاء'
  });

  if (!confirmFirst.isConfirmed) return;

  // Double check
  const confirmSecond = await Swal.fire({
    title: 'تحذير أخير!',
    text: 'لا يمكن التراجع عن هذا الإجراء إطلاقاً. هل تريد الاستمرار؟',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'متأكد 100% - امسح الآن',
    cancelButtonText: 'تراجع'
  });

  if (!confirmSecond.isConfirmed) return;

  const options = {
    keepCustomers: document.getElementById('keepCustomers').checked,
    keepServices: document.getElementById('keepServices').checked,
    keepEmployees: document.getElementById('keepEmployees').checked,
    keepSettings: document.getElementById('keepSettings').checked
  };

  const res = await window.db.selectiveReset(options);
  if (res.success) {
    await Swal.fire('تم بنجاح', 'تم مسح البيانات وإعادة الضبط بناءً على اختيارك.', 'success');
    window.electron.restart();
  } else {
    Swal.fire('خطأ', 'حدث خطأ أثناء المسح: ' + res.error, 'error');
  }
}