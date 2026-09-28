'use strict';

let allCustomers = [];

function goBack() {
  window.electron.navigate('main-dashboard.html');
}

function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${type === 'success' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : type === 'error' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 9v2m0 4h.01M12 3l9 16H3L12 3z"/></svg>'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function fmt(n) {
  return Number(n || 0).toFixed(2);
}

// ─── Load & Render Customers ──────────────────────────────────────────────────
const PAGE_SIZE = 50;
let currentPage = 1;
let totalCustomers = 0;

async function loadCustomers(resetPage = false) {
  if (resetPage) currentPage = 1;

  const searchInput = document.getElementById('customerSearch');
  const query = searchInput ? searchInput.value.trim() : '';

  // Count total
  let countSql = 'SELECT COUNT(*) as cnt FROM customers';
  let countParams = [];
  if (query) {
    countSql += ' WHERE name LIKE ? OR phone LIKE ? OR address LIKE ?';
    countParams = [`%${query}%`, `%${query}%`, `%${query}%`];
  }
  const countRes = await window.db.queryOne(countSql, countParams);
  totalCustomers = (countRes.success && countRes.data) ? (countRes.data.cnt || 0) : 0;

  // Fetch page
  const offset = (currentPage - 1) * PAGE_SIZE;
  let dataSql = 'SELECT * FROM customers';
  let dataParams = [];
  if (query) {
    dataSql += ' WHERE name LIKE ? OR phone LIKE ? OR address LIKE ?';
    dataParams = [`%${query}%`, `%${query}%`, `%${query}%`];
  }
  dataSql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  dataParams.push(PAGE_SIZE, offset);

  const res = await window.db.query(dataSql, dataParams);
  if (res.success) {
    allCustomers = res.data || [];
    renderCustomersTable();
  } else {
    showToast('حدث خطأ أثناء تحميل العملاء', 'error');
  }
}

function renderCustomersTable() {
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;

  const countEl = document.getElementById('customersCount');
  if (countEl) countEl.textContent = `${totalCustomers} عميل`;

  if (!allCustomers.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا يوجد عملاء مطابقين للبحث</td></tr>';
    renderPagination();
    return;
  }

  const offset = (currentPage - 1) * PAGE_SIZE;
  tbody.innerHTML = allCustomers.map((c, i) => `
    <tr>
      <td style="color:var(--text-muted);">${offset + i + 1}</td>
      <td style="font-weight:700;">${c.name}</td>
      <td><span style="font-family:monospace;direction:ltr;display:inline-block;">${c.phone || '—'}</span></td>
      <td>${c.address || '—'}</td>
      <td style="color:var(--text-muted);">${fmt(c.opening_balance)}</td>
      <td style="font-weight:700; color:${c.current_balance < 0 ? 'var(--success)' : c.current_balance > 0 ? 'var(--danger)' : 'var(--primary)'};">${fmt(c.current_balance)}</td>
      <td style="text-align:center;">
        <div class="flex gap-2 justify-center">
          <button class="btn btn-sm btn-outline" onclick="editCustomer(${c.id})">تعديل</button>
          <button class="btn btn-sm" style="background:#25D366;color:#fff;border:none;display:flex;align-items:center;justify-content:center;padding:0 8px;" onclick="openWhatsApp('${c.phone || ''}')" title="واتساب">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteCustomer(${c.id})">حذف</button>
        </div>
      </td>
    </tr>
  `).join('');

  renderPagination();
}

function renderPagination() {
  const totalPages = Math.ceil(totalCustomers / PAGE_SIZE);

  // Remove any existing pagination
  let pager = document.getElementById('customersPagination');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'customersPagination';
    pager.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:8px;padding:16px 0;direction:rtl;flex-wrap:wrap;';
    const tbody = document.getElementById('customersBody');
    if (tbody && tbody.parentElement && tbody.parentElement.parentElement) {
      tbody.parentElement.parentElement.insertAdjacentElement('afterend', pager);
    }
  }

  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }

  const btnStyle = (active) =>
    `style="padding:6px 14px;border-radius:6px;border:1.5px solid ${active ? '#3b82f6' : '#e2e8f0'};background:${active ? '#3b82f6' : '#fff'};color:${active ? '#fff' : '#374151'};cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;font-weight:${active ? '700' : '500'};"`;

  let html = '';

  // Prev button
  html += `<button ${btnStyle(false)} ${currentPage === 1 ? 'disabled style="opacity:0.4;cursor:default;"' : `onclick="gotoPage(${currentPage - 1})"`}>‹ السابق</button>`;

  // Page numbers (show window of 5 around current)
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  if (start > 1) html += `<button ${btnStyle(false)} onclick="gotoPage(1)">1</button>${start > 2 ? '<span style="padding:0 4px;color:#9ca3af;">…</span>' : ''}`;
  for (let p = start; p <= end; p++) {
    html += `<button ${btnStyle(p === currentPage)} onclick="gotoPage(${p})">${p}</button>`;
  }
  if (end < totalPages) html += `${end < totalPages - 1 ? '<span style="padding:0 4px;color:#9ca3af;">…</span>' : ''}<button ${btnStyle(false)} onclick="gotoPage(${totalPages})">${totalPages}</button>`;

  // Next button
  html += `<button ${btnStyle(false)} ${currentPage === totalPages ? 'disabled style="opacity:0.4;cursor:default;"' : `onclick="gotoPage(${currentPage + 1})"`}>التالي ›</button>`;

  // Page info
  html += `<span style="color:#64748b;font-size:13px;font-family:'Cairo';"> صفحة ${currentPage} من ${totalPages} (${totalCustomers} عميل)</span>`;

  pager.innerHTML = html;
}

async function gotoPage(p) {
  currentPage = p;
  await loadCustomers();
  // Scroll to top of table
  const tbody = document.getElementById('customersBody');
  if (tbody) tbody.parentElement?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Modal & CRUD ─────────────────────────────────────────────────────────────
function openCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'إضافة عميل جديد';
  document.getElementById('custId').value = '';
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('custAddress').value = '';
  document.getElementById('custOpeningBalance').value = '0';
  document.getElementById('custOpeningBalance').disabled = false;
  openModal('customerModal');
}

async function saveCustomer() {
  const id = document.getElementById('custId').value;
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim() || null;
  const address = document.getElementById('custAddress').value.trim() || null;
  const openingBalance = parseFloat(document.getElementById('custOpeningBalance').value) || 0;

  if (!name) {
    showToast('يرجى إدخال اسم العميل', 'error');
    return;
  }

  // التحقق من عدم تكرار رقم التليفون
  if (phone) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? AND id != ? LIMIT 1`,
      [phone, id || 0]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phone}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  let res;
  if (id) {
    const oldRes = await window.db.queryOne('SELECT opening_balance, current_balance FROM customers WHERE id=?', [id]);
    if (oldRes.success && oldRes.data) {
      const oldOpening = oldRes.data.opening_balance;
      const oldCurrent = oldRes.data.current_balance;
      const difference = openingBalance - oldOpening;
      const newCurrent = oldCurrent + difference;

      res = await window.db.run(
        'UPDATE customers SET name=?, phone=?, address=?, opening_balance=?, current_balance=? WHERE id=?',
        [name, phone, address, openingBalance, newCurrent, id]
      );
    } else {
      showToast('خطأ في استرجاع بيانات العميل القديمة', 'error');
      return;
    }
  } else {
    res = await window.db.run(
      'INSERT INTO customers (name, phone, address, opening_balance, current_balance) VALUES (?,?,?,?,?)',
      [name, phone, address, openingBalance, openingBalance]
    );
  }

  if (res.success) {
    showToast('تم الحفظ بنجاح', 'success');
    closeModal('customerModal');
    await loadCustomers(); // stay on current page after save
  } else {
    showToast('خطأ: ' + res.error, 'error');
  }
}

function editCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('customerModalTitle').textContent = 'تعديل بيانات العميل';
  document.getElementById('custId').value = c.id;
  document.getElementById('custName').value = c.name;
  document.getElementById('custPhone').value = c.phone || '';
  document.getElementById('custAddress').value = c.address || '';
  document.getElementById('custOpeningBalance').value = c.opening_balance || 0;
  openModal('customerModal');
}

async function deleteCustomer(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;

  const checkRes = await window.db.queryOne('SELECT COUNT(*) as count FROM invoices WHERE customer_id=?', [id]);
  if (checkRes.success && checkRes.data && checkRes.data.count > 0) {
    showToast('لا يمكن حذف هذا العميل لوجود فواتير مسجلة باسمه. يمكنك تعديل بياناته بدلاً من حذفه.', 'error');
    return;
  }

  const res = await window.db.run('DELETE FROM customers WHERE id=?', [id]);
  if (res.success) {
    showToast('تم الحذف', 'success');
    await loadCustomers(); // stay on current page after delete
  } else {
    if (res.error && res.error.includes('FOREIGN KEY constraint failed')) {
      showToast('لا يمكن حذف العميل لوجود بيانات مرتبطة به.', 'error');
    } else {
      showToast('حدث خطأ أثناء الحذف: ' + res.error, 'error');
    }
  }
}

function openWhatsApp(phone) {
  if (!phone || phone === 'null' || phone.trim() === '') {
    showToast('رقم التليفون غير مسجل', 'info');
    return;
  }
  let waPhone = phone.replace(/\s+/g, '');
  if (waPhone.startsWith('01')) waPhone = '2' + waPhone;
  else if (!waPhone.startsWith('+2') && !waPhone.startsWith('20')) waPhone = '2' + waPhone;

  window.electron.openExternal(`https://api.whatsapp.com/send?phone=${waPhone}`);
}

// ─── TASK 2: Customer Excel Export ────────────────────────────────────────────
async function exportCustomersToExcel() {
  try {
    const res = await window.db.query('SELECT * FROM customers ORDER BY id ASC', []);
    if (!res.success || !res.data || res.data.length === 0) {
      Swal.fire({
        title: 'تنبيه',
        text: 'لا يوجد أي عملاء مسجلين حالياً لتصديرهم.',
        icon: 'info',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#2563eb'
      });
      return;
    }

    const customers = res.data;
    const excelRows = customers.map(c => ({
      'كود العميل': c.id,
      'الاسم': c.name || '',
      'رقم الهاتف': c.phone || '',
      'العنوان': c.address || '',
      'الرصيد الافتتاحي': Number(c.opening_balance || 0),
      'الرصيد الحالي': Number(c.current_balance || 0),
      'الملاحظات': c.notes || '',
      'تاريخ التسجيل': c.created_at || ''
    }));

    const base64Buffer = window.excel.exportToBuffer(excelRows, 'قائمة العملاء');

    const d = new Date().toISOString().split('T')[0];
    const saveDialog = await window.electron.showSaveDialog({
      title: 'تصدير بيانات العملاء إلى ملف Excel',
      defaultPath: `العملاء-${d}.xlsx`,
      filters: [{ name: 'ملفات Excel (*.xlsx)', extensions: ['xlsx'] }]
    });

    if (saveDialog.canceled || !saveDialog.filePath) {
      return;
    }

    const writeRes = await window.electron.writeFile(saveDialog.filePath, base64Buffer);
    if (!writeRes.success) {
      throw new Error(writeRes.error || 'فشل حفظ الملف');
    }

    const confirmOpen = await Swal.fire({
      title: 'تم التصدير بنجاح! 🎉',
      html: `تم تصدير بيانات <b>${customers.length}</b> عميل إلى الملف:<br><code style="direction:ltr;display:inline-block;margin-top:10px;padding:4px 8px;background:#f1f5f9;border-radius:4px;word-break:break-all;">${saveDialog.filePath}</code>`,
      icon: 'success',
      showCancelButton: true,
      confirmButtonText: '📂 فتح موقع الملف',
      cancelButtonText: 'إغلاق',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b'
    });

    if (confirmOpen.isConfirmed) {
      window.electron.openExternal(saveDialog.filePath);
    }

  } catch (err) {
    console.error('Error exporting customers:', err);
    Swal.fire({
      title: 'خطأ في التصدير',
      text: err.message || 'حدث خطأ غير متوقع أثناء التصدير',
      icon: 'error',
      confirmButtonText: 'حسناً',
      confirmButtonColor: '#ef4444'
    });
  }
}

// ─── TASK 2: Customer Excel Import with Column Mapping & Upsert ───────────────
async function importCustomersFromExcel() {
  try {
    // 1. Pick Excel file
    const openRes = await window.electron.showOpenDialog({
      title: 'اختيار ملف Excel لاستيراد العملاء',
      filters: [
        { name: 'ملفات Excel (*.xlsx, *.xls)', extensions: ['xlsx', 'xls'] }
      ],
      properties: ['openFile']
    });

    if (openRes.canceled || !openRes.filePaths || openRes.filePaths.length === 0) {
      return;
    }

    const filePath = openRes.filePaths[0];

    // 2. Read file as base64
    const fileRes = await window.electron.readFile(filePath);
    if (!fileRes.success || !fileRes.data) {
      throw new Error(fileRes.error || 'فشل قراءة الملف المختار');
    }

    // 3. Parse with SheetJS via preload
    const rows = window.excel.parseFileBuffer(fileRes.data);
    if (!rows || rows.length === 0) {
      Swal.fire({
        title: 'الملف فارغ',
        text: 'الملف المختار لا يحتوي على أي بيانات أو أوراق عمل.',
        icon: 'warning',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    // 4. Smart header-row detection — works even when the file has a logo,
    //    title, and print-date rows above the real column headers.
    //
    //    Strategy:
    //    Pass 1 — scan first 30 rows for a row that contains at least one
    //             recognized customer-field keyword (name, phone, address…).
    //             This correctly handles decorated exports from other systems.
    //    Pass 2 — if no keyword match, fall back to the row with the most
    //             non-empty cells (the header row is almost always the densest).
    //    Pass 3 — absolute fallback: first row with ≥ 2 non-empty cells.

    const HEADER_KEYWORDS = [
      // Arabic name variants
      'اسم العميل', 'اسم', 'الاسم', 'العميل',
      // Arabic phone variants
      'تليفون', 'تلفون', 'موبايل', 'هاتف', 'جوال', 'رقم التليفون', 'رقم الهاتف',
      // Arabic address
      'عنوان', 'العنوان',
      // Arabic balance
      'رصيد', 'الرصيد',
      // English variants
      'name', 'customer', 'client',
      'phone', 'mobile', 'tel', 'whatsapp',
      'address',
    ];

    const SEARCH_LIMIT = Math.min(rows.length, 30);

    let headerRowIdx = -1;

    // Pass 1: keyword scan
    for (let i = 0; i < SEARCH_LIMIT; i++) {
      const cells = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
      const hasKeyword = cells.some(cell =>
        HEADER_KEYWORDS.some(kw => cell.includes(kw.toLowerCase()))
      );
      if (hasKeyword) {
        headerRowIdx = i;
        break;
      }
    }

    // Pass 2: densest row (highest non-empty cell count)
    if (headerRowIdx === -1) {
      let maxNonEmpty = 0;
      for (let i = 0; i < SEARCH_LIMIT; i++) {
        const count = (rows[i] || []).filter(c => String(c || '').trim() !== '').length;
        if (count > maxNonEmpty) {
          maxNonEmpty = count;
          headerRowIdx = i;
        }
      }
    }

    // Pass 3: first row with ≥ 2 non-empty cells (original fallback)
    if (headerRowIdx === -1) {
      for (let i = 0; i < SEARCH_LIMIT; i++) {
        const nonEmpties = (rows[i] || []).filter(c => String(c || '').trim() !== '');
        if (nonEmpties.length >= 2) {
          headerRowIdx = i;
          break;
        }
      }
    }

    if (headerRowIdx === -1) {
      Swal.fire({
        title: 'تنسيق غير صالح',
        text: 'تعذر تحديد صف الترويسة (عناوين الأعمدة) في الملف المختار.',
        icon: 'error',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    const rawHeaders = rows[headerRowIdx].map(h => String(h || '').trim());
    const dataRows = rows.slice(headerRowIdx + 1);

    if (dataRows.length === 0) {
      Swal.fire({
        title: 'لا توجد بيانات',
        text: 'الملف يحتوي على صف الترويسة فقط دون أي صفوف عملاء.',
        icon: 'warning',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    // 5. Smart header auto-detection
    function findBestHeaderIndex(keywords) {
      for (let i = 0; i < rawHeaders.length; i++) {
        const text = rawHeaders[i].toLowerCase();
        for (const kw of keywords) {
          if (text.includes(kw.toLowerCase())) return i;
        }
      }
      return -1;
    }

    const guessedNameIdx = findBestHeaderIndex(['الاسم', 'اسم العميل', 'اسم', 'client', 'customer', 'name']);
    const guessedMobileIdx = findBestHeaderIndex(['موبايل', 'تليفون', 'هاتف', 'جوال', 'phone', 'mobile', 'tel', 'whatsapp']);
    const guessedAddressIdx = findBestHeaderIndex(['عنوان', 'العنوان', 'address', 'city', 'مكان']);
    const guessedBalanceIdx = findBestHeaderIndex(['افتتاحي', 'رصيد افتتاحي', 'الرصيد', 'balance']);
    const guessedNotesIdx = findBestHeaderIndex(['ملاحظ', 'ملاحظات', 'notes', 'comment']);

    // Build select options
    function buildOptions(selectedIdx) {
      let html = '<option value="-1">-- غير محدد --</option>';
      rawHeaders.forEach((h, idx) => {
        const title = h ? `${idx + 1}. ${h}` : `عمود ${idx + 1}`;
        const isSel = idx === selectedIdx ? 'selected' : '';
        html += `<option value="${idx}" ${isSel}>${title}</option>`;
      });
      return html;
    }

    // 6. Column Mapping Modal (SweetAlert2)
    const mappingHtml = `
      <div style="font-family:'Cairo',sans-serif;text-align:right;direction:rtl;font-size:14px;">
        <p style="color:#475569;margin-bottom:14px;line-height:1.5;">
          تم قراءة <b>${dataRows.length}</b> صف بيانات من الملف.<br>
          يرجى تحديد العمود المناسب لكل حقل من حقول العميل أدناه:
        </p>

        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:10px;">
          <div>
            <label style="font-weight:700;display:block;margin-bottom:4px;color:#1e293b;">الاسم * <span style="color:#ef4444;">(إلزامي)</span></label>
            <select id="mapNameCol" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
              ${buildOptions(guessedNameIdx)}
            </select>
          </div>

          <div>
            <label style="font-weight:700;display:block;margin-bottom:4px;color:#1e293b;">رقم التليفون / الموبايل * <span style="color:#ef4444;">(إلزامي)</span></label>
            <select id="mapMobileCol" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
              ${buildOptions(guessedMobileIdx)}
            </select>
          </div>

          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px;color:#334155;">العنوان <span style="color:#64748b;font-weight:normal;">(اختياري)</span></label>
            <select id="mapAddressCol" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
              ${buildOptions(guessedAddressIdx)}
            </select>
          </div>

          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px;color:#334155;">الرصيد الافتتاحي <span style="color:#64748b;font-weight:normal;">(اختياري)</span></label>
            <select id="mapBalanceCol" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
              ${buildOptions(guessedBalanceIdx)}
            </select>
          </div>

          <div>
            <label style="font-weight:600;display:block;margin-bottom:4px;color:#334155;">الملاحظات <span style="color:#64748b;font-weight:normal;">(اختياري)</span></label>
            <select id="mapNotesCol" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
              ${buildOptions(guessedNotesIdx)}
            </select>
          </div>
        </div>
      </div>
    `;

    const mappingResult = await Swal.fire({
      title: '📋 مطابقة أعمدة Excel مع بيانات العملاء',
      html: mappingHtml,
      width: '520px',
      showCancelButton: true,
      confirmButtonText: 'بدء الاستيراد 📥',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      preConfirm: () => {
        const nameCol = parseInt(document.getElementById('mapNameCol').value, 10);
        const mobileCol = parseInt(document.getElementById('mapMobileCol').value, 10);
        const addressCol = parseInt(document.getElementById('mapAddressCol').value, 10);
        const balanceCol = parseInt(document.getElementById('mapBalanceCol').value, 10);
        const notesCol = parseInt(document.getElementById('mapNotesCol').value, 10);

        if (nameCol === -1) {
          Swal.showValidationMessage('يجب اختيار عمود "الاسم" للمتابعة!');
          return false;
        }
        if (mobileCol === -1) {
          Swal.showValidationMessage('يجب اختيار عمود "رقم التليفون / الموبايل" للمتابعة!');
          return false;
        }
        if (nameCol === mobileCol) {
          Swal.showValidationMessage('لا يمكن اختيار نفس العمود للاسم ورقم التليفون معاً!');
          return false;
        }

        return { nameCol, mobileCol, addressCol, balanceCol, notesCol };
      }
    });

    if (!mappingResult.isConfirmed || !mappingResult.value) {
      return;
    }

    const { nameCol, mobileCol, addressCol, balanceCol, notesCol } = mappingResult.value;

    // 7. Show loading spinner
    Swal.fire({
      title: 'جاري استيراد البيانات...',
      html: 'يرجى الانتظار، جاري حفظ وتحديث سجلات العملاء في قاعدة البيانات...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const skipDetails = [];

    // 8. Process rows with Upsert logic
    const validCustomers = [];
    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const row = dataRows[rIdx];
      const rowNum = headerRowIdx + 2 + rIdx;

      // Skip completely empty rows
      const isRowEmpty = row.every(cell => String(cell).trim() === '');
      if (isRowEmpty) {
        skippedCount++;
        continue;
      }

      const rawName = row[nameCol] !== undefined ? String(row[nameCol]).trim() : '';
      const rawMobile = row[mobileCol] !== undefined ? String(row[mobileCol]).trim() : '';
      const rawAddress = (addressCol !== -1 && row[addressCol] !== undefined) ? String(row[addressCol]).trim() : null;
      const rawBalance = (balanceCol !== -1 && row[balanceCol] !== undefined) ? parseFloat(row[balanceCol]) || 0 : 0;
      const rawNotes = (notesCol !== -1 && row[notesCol] !== undefined) ? String(row[notesCol]).trim() : '';

      if (!rawName) {
        skippedCount++;
        skipDetails.push(`صف ${rowNum}: تم تخطيه لعدم وجود اسم العميل`);
        continue;
      }

      // Clean mobile number
      const cleanMobile = rawMobile.replace(/[^\d+]/g, '');
      if (!cleanMobile) {
        skippedCount++;
        skipDetails.push(`صف ${rowNum} (${rawName}): تم تخطيه لعدم وجود رقم تليفون صحيح`);
        continue;
      }

      validCustomers.push({
        name: rawName,
        phone: cleanMobile,
        address: rawAddress,
        opening_balance: rawBalance,
        current_balance: rawBalance,
        notes: rawNotes
      });
    }

    // Show progress modal
    Swal.fire({
      title: 'جاري حفظ بيانات العملاء...',
      html: `جاري تسجيل <b>${validCustomers.length}</b> عميل في قاعدة البيانات...`,
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    if (window.db && window.db.batchUpsertCustomers) {
      const batchRes = await window.db.batchUpsertCustomers(validCustomers);
      if (batchRes.success) {
        createdCount = batchRes.created || 0;
        updatedCount = batchRes.updated || 0;
      } else {
        throw new Error(batchRes.error || 'فشل في حفظ العملاء دفعة واحدة');
      }
    } else {
      // Fallback row-by-row
      for (const c of validCustomers) {
        const existingRes = await window.db.queryOne(
          'SELECT id, name, address, notes FROM customers WHERE phone = ? LIMIT 1',
          [c.phone]
        );

        if (existingRes && existingRes.success && existingRes.data) {
          const existing = existingRes.data;
          const uAddr = c.address || existing.address;
          const uNotes = c.notes ? (existing.notes ? `${existing.notes} | ${c.notes}` : c.notes) : (existing.notes || '');
          const uRes = await window.db.run(
            'UPDATE customers SET name = ?, address = ?, notes = ? WHERE id = ?',
            [c.name, uAddr, uNotes, existing.id]
          );
          if (uRes && uRes.success) updatedCount++;
        } else {
          const iRes = await window.db.run(
            'INSERT INTO customers (name, phone, address, opening_balance, current_balance, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [c.name, c.phone, c.address, c.opening_balance, c.current_balance, c.notes]
          );
          if (iRes && iRes.success) createdCount++;
        }
      }
    }

    // 9. Reload table in UI — reset to page 1 after import
    await loadCustomers(true);

    // 10. Show Summary Modal
    let skipSummaryHtml = '';
    if (skipDetails.length > 0) {
      const topSkips = skipDetails.slice(0, 5).join('<br>');
      const moreCount = skipDetails.length > 5 ? `<br>... و ${skipDetails.length - 5} صفوف أخرى` : '';
      skipSummaryHtml = `
        <div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;padding:10px;border-radius:8px;font-size:12px;color:#991b1b;max-height:120px;overflow-y:auto;text-align:right;">
          <b>تفاصيل الصفوف المتخطاة:</b><br>${topSkips}${moreCount}
        </div>
      `;
    }

    Swal.fire({
      title: '🎉 اكتمل الاستيراد بنجاح!',
      html: `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;font-size:14px;line-height:1.7;">
          <div style="display:flex;justify-content:space-between;padding:8px 12px;background:#f0fdf4;border-radius:6px;margin-bottom:6px;border:1px solid #bbf7d0;">
            <span style="font-weight:700;color:#166534;">✅ عملاء جدد تم إنشاؤهم:</span>
            <span style="font-weight:900;color:#15803d;font-size:16px;">${createdCount}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 12px;background:#eff6ff;border-radius:6px;margin-bottom:6px;border:1px solid #bfdbfe;">
            <span style="font-weight:700;color:#1e40af;">🔄 عملاء موجودون تم تحديثهم:</span>
            <span style="font-weight:900;color:#1d4ed8;font-size:16px;">${updatedCount}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <span style="font-weight:600;color:#64748b;">⚠️ صفوف تم تخطيها:</span>
            <span style="font-weight:700;color:#64748b;">${skippedCount}</span>
          </div>
          ${skipSummaryHtml}
        </div>
      `,
      icon: 'success',
      confirmButtonText: 'حسناً',
      confirmButtonColor: '#10b981'
    });

  } catch (err) {
    console.error('Error importing customers:', err);
    Swal.fire({
      title: 'خطأ في الاستيراد',
      text: err.message || 'حدث خطأ أثناء معالجة ملف Excel',
      icon: 'error',
      confirmButtonText: 'حسناً',
      confirmButtonColor: '#ef4444'
    });
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Wire search input to paginated load
  const searchInput = document.getElementById('customerSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => loadCustomers(true));
  }
  await loadCustomers();
}

init();
