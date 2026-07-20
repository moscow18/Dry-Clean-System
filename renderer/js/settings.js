let currentLogoPath = null;


// ─── Section navigation ──────────────────────────────────────────────────────
function showSection(name) {
  ['store', 'cashier', 'users', 'backup', 'whatsapp', 'wa-templates'].forEach(s => {
    document.getElementById(`section-${s}`).style.display = s === name ? '' : 'none';
  });
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  event.target.closest('.sidebar-nav-item')?.classList.add('active');

  if (name === 'users')        loadUsers();
  if (name === 'backup')       { loadBackups(); loadExternalBackupPath(); }
  if (name === 'whatsapp')     checkWaStatus();
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
  };

  const res = await window.db.updateSettings(data);
  if (res.success) {
    showToast('تم حفظ الإعدادات بنجاح ', 'success');
  } else {
    showToast('حدث خطأ: ' + (res.error || ''), 'error');
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

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
let waQrTimerInterval = null;
let waStatusPollInterval = null;   // ← polling كل 3 ثوانية

async function checkWaStatus() {
  const status = await window.whatsapp.getStatus();
  updateWaUI(status.ready, status.hasQR);
  
  if (!status.ready && status.hasQR) {
    // اجلب QR الحالي وعرضه
    const qrRes = await window.whatsapp.getQR();
    if (qrRes.success && qrRes.qr) {
      showWaQR(qrRes.qr);
    }
  }

  // لو غير متصل ومفيش QR بعد، ابدأ polling تلقائي
  if (!status.ready) {
    startWaPolling();
  } else {
    stopWaPolling();
  }
}

function startWaPolling() {
  if (waStatusPollInterval) return; // already running
  waStatusPollInterval = setInterval(async () => {
    const status = await window.whatsapp.getStatus();
    if (status.ready) {
      updateWaUI(true, false);
      stopWaPolling();
      return;
    }
    if (status.hasQR) {
      updateWaUI(false, true);
      const qrRes = await window.whatsapp.getQR();
      if (qrRes.success && qrRes.qr) {
        showWaQR(qrRes.qr);
      }
    }
  }, 3000);
}

function stopWaPolling() {
  if (waStatusPollInterval) {
    clearInterval(waStatusPollInterval);
    waStatusPollInterval = null;
  }
}

function updateWaUI(ready, hasQR) {
  const dot = document.getElementById('waStatusDot');
  const text = document.getElementById('waStatusText');
  const hint = document.getElementById('waStatusHint');
  const disconnectBtn = document.getElementById('waDisconnectBtn');
  const qrSection = document.getElementById('waQrSection');

  if (ready) {
    dot.style.background = '#25d366';
    text.textContent = '✅ متصل وجاهز للإرسال';
    hint.textContent = 'الجلسة محفوظة — مش هتحتاج ترتبط مرة تانية';
    disconnectBtn.style.display = 'inline-flex';
    qrSection.style.display = 'none';
  } else if (hasQR) {
    dot.style.background = '#f59e0b';
    text.textContent = '📱 في انتظار مسح QR Code';
    hint.textContent = 'افتح واتساب وامسح الكود أدناه';
    disconnectBtn.style.display = 'none';
    qrSection.style.display = 'block';
  } else {
    dot.style.background = '#ef4444';
    text.textContent = '🔴 غير متصل';
    hint.textContent = 'جاري الاتصال... انتظر قليلاً أو اضغط تحديث';
    disconnectBtn.style.display = 'none';
    qrSection.style.display = 'none';
  }
}

function showWaQR(dataUrl) {
  document.getElementById('waQrImage').src = dataUrl;
  document.getElementById('waQrSection').style.display = 'block';
  
  // عداد تنازلي 60 ثانية
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
  updateWaUI(false, false);
}

// أحداث واتساب الواردة من Main Process
window.whatsapp.onQR((dataUrl) => {
  if (!dataUrl) return;
  updateWaUI(false, true);
  showWaQR(dataUrl);
});

window.whatsapp.onReady(() => {
  if (waQrTimerInterval) clearInterval(waQrTimerInterval);
  stopWaPolling();
  updateWaUI(true, false);
  showToast('✅ واتساب متصل وجاهز!', 'success');
});

window.whatsapp.onAuthenticated(() => {
  updateWaUI(false, false);
});

window.whatsapp.onDisconnected(() => {
  updateWaUI(false, false);
  showToast('انقطع اتصال الواتساب', 'warning');
  startWaPolling(); // ابدأ polling من تاني عشان تنتظر إعادة الاتصال
});

window.whatsapp.onLoading((percent) => {
  const hint = document.getElementById('waStatusHint');
  if (hint) {
    hint.textContent = `جاري تحميل واتساب... ${percent}%`;
  }
});

window.whatsapp.onError((msg) => {
  showToast('خطأ في واتساب: ' + msg, 'error');
  const text = document.getElementById('waStatusText');
  const hint = document.getElementById('waStatusHint');
  if (text) text.textContent = '⚠️ حدث خطأ — الواتساب متوقف';
  if (hint) hint.innerHTML = `<span style="color:var(--danger);font-weight:600;">⛔ ${msg}</span><br><small>حاول إعادة تشغيل البرنامج. إذا استمرت المشكلة على ويندوز 7، تأكد من تحديث Google Chrome أو تثبيته.</small>`;
  stopWaPolling();
});