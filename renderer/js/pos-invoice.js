let posAllInvoices = [];

function renderPosHistory(invoices) {
  const tbody = document.getElementById('historyTableBody');
  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">لا توجد فواتير مطابقة</td></tr>';
  } else {
    tbody.innerHTML = invoices.map(inv => `
      <tr data-id="${inv.id}" data-invnum="${(inv.invoice_number||'').toLowerCase()}" data-custname="${(inv.customer_name||'').toLowerCase()}" data-custphone="${(inv.customer_phone||'').toLowerCase()}" style="border-bottom:1px solid var(--border);">
        <td style="padding:12px; font-weight:bold; color:var(--primary);">${inv.invoice_number} ${inv.is_express ? '⚡' : ''} ${inv.is_delivery ? '🛵' : ''}</td>
        <td style="padding:12px;">${inv.customer_name || 'عميل نقدي'}</td>
        <td style="padding:12px; font-size:12px; color:var(--text-secondary);">${inv.driver_name ? '🛵 ' + inv.driver_name : '—'}</td>
        <td style="padding:12px; font-weight:bold; color:var(--success);">${fmt(inv.dynamic_net_total)}</td>
        <td style="padding:12px; font-size:12px; color:var(--text-muted);">${inv.invoice_date}</td>
        <td style="padding:12px; text-align:center;">
          <div style="display:flex;gap:4px;justify-content:center;">
            <button style="background:var(--accent);border:none;color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;" onclick='reprintPastInvoice(${JSON.stringify(inv).replace(/\x27/g,"&apos;")})'>عرض وطباعة</button>
            <button style="background:#25D366;border:none;color:#fff;padding:6px 8px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick='sendWhatsAppFromHistory(${JSON.stringify(inv).replace(/\x27/g,"&apos;")})' title="واتساب">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
            </button>
            ${(inv.amount_paid > 0 && sessionStorage.getItem('elTarzy_role') === 'admin') ? 
            `<button style="background:var(--danger);border:none;color:#fff;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;" onclick='reversePaymentPrompt(${inv.id}, ${inv.amount_paid})' title="إرجاع تسديد">إرجاع تسديد</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }
}

// debounce لتأخير البحث حتى لا يعلق الجهاز بكل ضغطة
let _filterTimer = null;
function filterPosHistory() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(_doFilter, 300);
}
function _doFilter() {
  const query    = (document.getElementById('posHistorySearch').value || '').toLowerCase();
  const phone    = (document.getElementById('posHistoryPhone').value || '').toLowerCase();

  if (!query && !phone) {
    renderPosHistory(posAllInvoices.slice(0, 30));
    return;
  }

  const filtered = posAllInvoices.filter(inv => {
    const invNum           = (inv.invoice_number || '').toLowerCase();
    const custName         = (inv.customer_name  || '').toLowerCase();
    const custPhone        = (inv.customer_phone || '').toLowerCase();
    const dynamicNetTotal  = (inv.dynamic_net_total || 0).toString();

    const matchQuery  = !query || invNum.includes(query) || custName.includes(query) || dynamicNetTotal.includes(query);
    const matchPhone  = !phone || custPhone.includes(phone);
    return matchQuery && matchPhone;
  });

  renderPosHistory(filtered);
}

// ─── Suspended Invoices Functions ─────────────────────────────────────────────
function loadSuspendedCount() {
  const suspended = JSON.parse(localStorage.getItem('suspendedInvoices') || '[]');
  document.getElementById('suspendedCountBadge').textContent = suspended.length;
}

function suspendInvoice() {
  if (!invoiceItems.length) { showToast('لا توجد أصناف لتعليق الفاتورة', 'error'); return; }
  const suspended = JSON.parse(localStorage.getItem('suspendedInvoices') || '[]');
  
  const customerInput = document.getElementById('customerSearchInput').value;
  const customerId = document.getElementById('customerSelect').value;
  
  const invData = {
    id: Date.now(),
    date: new Date().toLocaleTimeString('ar-EG-u-nu-latn'),
    customerInput,
    customerId,
    invoiceNumber: currentInvoiceNumber, // Fix 1: save original number
    items: JSON.parse(JSON.stringify(invoiceItems)),
    discountPercent: document.getElementById('discountPercent').value,
    discountAmount: document.getElementById('discountAmount').value,
    amountPaid: document.getElementById('amountPaid').value,
    notes: document.getElementById('invoiceNotes').value
  };
  
  suspended.push(invData);
  localStorage.setItem('suspendedInvoices', JSON.stringify(suspended));
  
  showToast('تم تعليق الفاتورة بنجاح', 'success');
  newInvoice();
  loadSuspendedCount();
}

function openSuspendedModal() {
  const suspended = JSON.parse(localStorage.getItem('suspendedInvoices') || '[]');
  const tbody = document.getElementById('suspendedTableBody');
  if (!suspended.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد فواتير معلقة</td></tr>';
  } else {
    tbody.innerHTML = suspended.map(inv => {
      const subtotal = inv.items.reduce((s,i) => s + (i.sell_price * i.quantity), 0);
      return '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:12px; font-size:12px;">' + inv.date + '</td>' +
        '<td style="padding:12px; font-weight:600;">' + (inv.customerInput || 'بدون اسم') + '</td>' +
        '<td style="padding:12px;">' + inv.items.length + '</td>' +
        '<td style="padding:12px; color:var(--primary); font-weight:700;">' + fmt(subtotal) + '</td>' +
        '<td style="padding:12px; text-align:center;">' +
          '<button class="btn btn-sm btn-success" onclick="resumeSuspended(' + inv.id + ')">استكمال</button> ' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSuspended(' + inv.id + ')">حذف</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }
  openModal('suspendedModal');
}


async function resumeSuspended(id) {
  const suspended = JSON.parse(localStorage.getItem('suspendedInvoices') || '[]');
  const invIndex = suspended.findIndex(i => i.id === id);
  if (invIndex === -1) return;
  
  const inv = suspended[invIndex];
  
  if (invoiceItems.length > 0) {
    if (!confirm('الفاتورة الحالية بها أصناف. هل تريد استبدالها بالفاتورة المعلقة؟ سيتم فقدان الأصناف الحالية.')) {
      return;
    }
  }
  
  lastSavedInvoice = null;
  
  document.getElementById('customerSearchInput').value = inv.customerInput;
  document.getElementById('customerSelect').value = inv.customerId;
  invoiceItems = inv.items;
  
  document.getElementById('discountPercent').value = inv.discountPercent || '0';
  document.getElementById('discountAmount').value = inv.discountAmount || '0';
  document.getElementById('amountPaid').value = inv.amountPaid || '0';
  document.getElementById('invoiceNotes').value = inv.notes || '';
  
  // Fix: Restore original invoice number only if it doesn't already exist in the DB
  if (inv.invoiceNumber) {
    // Check if this number was already used (saved) in the database
    const checkRes = await window.db.queryOne('SELECT id FROM invoices WHERE invoice_number = ?', [inv.invoiceNumber]);
    if (checkRes.data) {
      // Number already saved → get a fresh number
      const freshRes = await window.db.generateInvoiceNumber();
      const freshNum = freshRes.success ? freshRes.data : inv.invoiceNumber;
      window._resumedInvoiceNumber = null;
      currentInvoiceNumber = freshNum;
      document.getElementById('invoiceNumberDisplay').textContent = freshNum;
    } else {
      // Number not used → restore it safely
      window._resumedInvoiceNumber = inv.invoiceNumber;
      currentInvoiceNumber = inv.invoiceNumber;
      document.getElementById('invoiceNumberDisplay').textContent = inv.invoiceNumber;
    }
  }
  
  renderItemsTable();
  recalcTotals();
  
  suspended.splice(invIndex, 1);
  localStorage.setItem('suspendedInvoices', JSON.stringify(suspended));
  
  closeModal('suspendedModal');
  loadSuspendedCount();
  showToast('تم استكمال الفاتورة المعلقة', 'success');
}

function deleteSuspended(id) {
  if (!confirm('هل تريد حذف الفاتورة المعلقة؟')) return;
  let suspended = JSON.parse(localStorage.getItem('suspendedInvoices') || '[]');
  suspended = suspended.filter(i => i.id !== id);
  localStorage.setItem('suspendedInvoices', JSON.stringify(suspended));
  openSuspendedModal();
  loadSuspendedCount();
}

// ─── State ────────────────────────────────────────────────────────────────────
let invoiceItems = [];
let categories = [];
let allServices = [];
let currentInvoiceNumber = '';
let lastSavedInvoice = null;
let sessionRole = null;
let settings = { company_name: 'Dry Clean', currency: 'جنيه', receipt_footer: 'شكراً لزيارتكم' };

// ─── Init ─────────────────────────────────────────────────────────────────────────────
async function init() {
  sessionRole = sessionStorage.getItem('elTarzy_role');
  
  // Date default
  document.getElementById('invoiceDate').value = getLocalISODate();

  // جلب جميع البيانات بشكل متوازٍ (Promise.all) لتسريع التحميل
  const [
    invRes,
    setRes,
    catRes,
    srvRes,
    custRes,
    empRes,
    driverRes,
  ] = await Promise.all([
    window.db.generateInvoiceNumber(),
    window.db.getSettings(),
    window.db.query('SELECT * FROM service_categories ORDER BY id', []),
    window.db.query('SELECT s.*, sc.name as cat_name FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id ORDER BY s.name', []),
    window.db.query('SELECT id,name,phone FROM customers ORDER BY name', []),
    window.db.query('SELECT id,name FROM employees WHERE is_active=1 ORDER BY name', []),
    window.db.query("SELECT id,name FROM employees WHERE is_active=1 AND (employee_type='\u0645\u0646\u062f\u0648\u0628 \u062a\u0648\u0635\u064a\u0644' OR job_title LIKE '%\u062f\u0644\u064a\u0641\u0631%' OR job_title LIKE '%\u0637\u064a\u0627\u0631%') ORDER BY name", []),
  ]);

  // Invoice number
  if (invRes.success) { currentInvoiceNumber = invRes.data; document.getElementById('invoiceNumberDisplay').textContent = invRes.data; }

  // Settings
  if (setRes.success && setRes.data) {
    settings = {...settings, ...setRes.data};
    if (settings.logo_path) {
      const safeLogo = 'file:///' + settings.logo_path.replace(/\\/g, '/');
      document.getElementById('posLogoIcon').innerHTML = `<img src="${safeLogo}" style="width:100%;height:100%;object-fit:contain;border-radius:12px;" />`;
    }
    if (settings.company_name) {
      document.querySelector('#posLogoContainer .logo-text').textContent = settings.company_name;
    }
    if (sessionRole === 'cashier') {
      if (Number(settings.prevent_cashier_price_edit) === 1) {
        document.getElementById('itemPrice').disabled = true;
      }
      if (Number(settings.cashier_prevent_discount) === 1) {
        document.getElementById('discountPercent').disabled = true;
        document.getElementById('discountAmount').disabled = true;
        document.getElementById('itemDiscount').disabled = true;
      }
    }
  }

  // Categories
  if (catRes.success) { categories = catRes.data; renderCategoryBtns(); populateCategorySelect(); }

  // Make categories scrollable with mouse wheel
  const catListElem = document.getElementById('categoryBtns');
  if (catListElem) {
    catListElem.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) { e.preventDefault(); catListElem.scrollLeft += e.deltaY; }
    });
  }

  // Services
  if (srvRes.success) {
    allServices = srvRes.data;
    populateServiceSelect(allServices);
    renderServiceGrid(allServices);
  }

  // Customers
  const cList = document.getElementById('customersList');
  if (custRes.success) {
    window.allCustomers = custRes.data;
    let custHtml = '';
    custRes.data.forEach(c => {
      custHtml += `<option value="${c.name} - ${c.phone||""}" data-id="${c.id}" data-phone="${c.phone||""}"></option>`;
    });
    cList.innerHTML = custHtml;
  }

  // Employees (cashier only)
  const empSel  = document.getElementById('employeeSelect');
  if (empRes.success) {
    let empHtml = '<option value="">\u0627\u062e\u062a\u0631 \u0627\u0644\u0643\u0627\u0634\u064a\u0631</option>';
    empRes.data.forEach(e => {
      empHtml += `<option value="${e.id}">${e.name}</option>`;
    });
    empSel.innerHTML = empHtml;
  } else {
    empSel.innerHTML = '<option value="">\u0627\u062e\u062a\u0631 \u0627\u0644\u0643\u0627\u0634\u064a\u0631</option>';
  }

  // Drivers
  const driverSel = document.getElementById('driverSelect');
  if (driverRes.success && driverRes.data && driverRes.data.length > 0) {
    let dHtml = '<option value="">\u0627\u062e\u062a\u0631 \u0627\u0644\u0637\u064a\u0627\u0631</option>';
    driverRes.data.forEach(d => { dHtml += `<option value="${d.id}">${d.name}</option>`; });
    driverSel.innerHTML = dHtml;
  } else {
    // Fallback: show all active employees as potential drivers
    if (empRes.success) {
      let dHtml = '<option value="">\u0627\u062e\u062a\u0631 \u0627\u0644\u0637\u064a\u0627\u0631</option>';
      empRes.data.forEach(e => { dHtml += `<option value="${e.id}">${e.name}</option>`; });
      driverSel.innerHTML = dHtml;
    }
  }

  // Auto-select current employee as cashier
  const empIdSession = sessionStorage.getItem('elTarzy_employeeId');
  if (empIdSession && empSel.querySelector(`option[value="${empIdSession}"]`)) {
    empSel.value = empIdSession;
  }

  loadSuspendedCount();
}

function handleCustomerSelect() {
  const searchVal = document.getElementById('customerSearchInput').value.trim();
  const hiddenInput = document.getElementById('customerSelect');
  if (!searchVal) {
    hiddenInput.value = '';
    return;
  }
  
  if (window.allCustomers) {
    let match = window.allCustomers.find(c => (c.name + ' - ' + (c.phone||'')) === searchVal);
    if (!match) match = window.allCustomers.find(c => c.name === searchVal);
    
    if (match) {
      hiddenInput.value = match.id;
    } else {
      hiddenInput.value = '';
    }
  }
}

// ─── Categories & Services Grid ─────────────────────────────────────────────
function renderCategoryBtns() {
  const container = document.getElementById('categoryBtns');
  container.innerHTML = `<div class="cat-btn active" onclick="selectCategory(0,this)">الكل</div>`;
  categories.forEach(c=>{
    container.innerHTML += `<div class="cat-btn" onclick="selectCategory(${c.id},this)">${c.name}</div>`;
  });
}

function selectCategory(catId, btn) {
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = catId===0 ? allServices : allServices.filter(s=>s.category_id===catId);
  populateServiceSelect(filtered);
  renderServiceGrid(filtered);
  // Also sync category select in item entry bar
  document.getElementById('itemCategory').value = catId || '';
  document.getElementById('itemService').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemBarcode').value = '';
  // Clear search when switching category
  const svcSearch = document.getElementById('svcSearchInput');
  if (svcSearch) svcSearch.value = '';
}

// Fix 4: Live product search by name or barcode
function filterServicesBySearch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    // Restore current category filter
    const activeCatBtn = document.querySelector('.cat-btn.active');
    const catId = activeCatBtn ? (activeCatBtn.onclick ? 0 : 0) : 0;
    renderServiceGrid(allServices);
    return;
  }
  const filtered = allServices.filter(s =>
    (s.name && s.name.toLowerCase().includes(q)) ||
    (s.barcode && s.barcode.toLowerCase().includes(q))
  );
  renderServiceGrid(filtered);
  // Deselect category buttons during search
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
}


function renderServiceGrid(services) {
  const grid = document.getElementById('servicesGrid');
  if(!services.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">لا توجد خدمات</div>';
    return;
  }
  grid.innerHTML = services.map(s => `
    <div class="svc-btn" onclick="addServiceFromGrid(${s.id})">
      <div class="s-name">${s.name}</div>
      <div class="s-price">${s.sell_price} ${settings.currency||'جنيه'}</div>
    </div>
  `).join('');
}

function addServiceFromGrid(svcId) {
  const svc = allServices.find(s => s.id === svcId);
  if(!svc) return;
  
  const exist = invoiceItems.find(i=>i.service_id===svc.id && i.sell_price===svc.sell_price && parseFloat(i.item_discount)===0);
  if(exist) {
    exist.quantity++;
    exist.total = exist.quantity * exist.sell_price;
  } else {
    invoiceItems.push({
      service_id: svc.id,
      category_name: svc.cat_name || 'بدون قسم',
      service_name: svc.name,
      barcode: svc.barcode,
      sell_price: svc.sell_price,
      quantity: 1,
      item_discount: 0,
      total: svc.sell_price
    });
  }
  renderItemsTable();
  recalcTotals();
}

function populateCategorySelect() {
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = '<option value="">الكل</option>';
  categories.forEach(c=>{ sel.innerHTML+=`<option value="${c.id}">${c.name}</option>`; });
}

function populateServiceSelect(services) {
  const sel = document.getElementById('itemService');
  sel.innerHTML = '<option value="">اختر الخدمة</option>';
  services.forEach(s=>{ sel.innerHTML+=`<option value="${s.id}" data-price="${s.sell_price}" data-barcode="${s.barcode||''}" data-cat="${s.cat_name||''}">${s.name}</option>`; });
}

function loadCategoryServices() {
  const catId = parseInt(document.getElementById('itemCategory').value) || 0;
  const filtered = catId===0 ? allServices : allServices.filter(s=>s.category_id===catId);
  populateServiceSelect(filtered);
  renderServiceGrid(filtered);
}

function onServiceSelect() {
  const sel = document.getElementById('itemService');
  const opt = sel.options[sel.selectedIndex];
  if(!opt || !opt.value) return;
  document.getElementById('itemPrice').value = opt.dataset.price || '0';
  document.getElementById('itemBarcode').value = opt.dataset.barcode || '';
}

function lookupBarcode() {
  const bc = document.getElementById('itemBarcode').value.trim();
  if(!bc) return;
  const svc = allServices.find(s=>s.barcode===bc);
  if(!svc){ showToast('لم يتم العثور على الباركود','warning'); return; }
  document.getElementById('itemService').value = svc.id;
  document.getElementById('itemPrice').value = svc.sell_price;
  addItemToInvoice();
}

// ─── Add Item ─────────────────────────────────────────────────────────────────
function addItemToInvoice() {
  const svcSel = document.getElementById('itemService');
  const opt = svcSel.options[svcSel.selectedIndex];
  const price = parseFloat(document.getElementById('itemPrice').value)||0;
  const qty = parseInt(document.getElementById('itemQty').value)||1;
  const discount = parseFloat(document.getElementById('itemDiscount').value)||0;
  const barcode = document.getElementById('itemBarcode').value.trim();

  let svcId = null, svcName = 'خدمة يدوية', catName = '';
  if(opt && opt.value){
    svcId = parseInt(opt.value);
    svcName = opt.text;
    catName = opt.dataset.cat || '';
  }
  if(price<=0){ showToast('يرجى إدخال السعر','error'); return; }

  const priceAfterDiscount = price - discount;
  const total = (priceAfterDiscount * qty);

  invoiceItems.push({ service_id:svcId, category_name:catName, service_name:svcName,
    barcode, sell_price:price, quantity:qty, item_discount:discount, total });

  renderItemsTable();
  recalcTotals();
  // Reset entry fields
  document.getElementById('itemService').value='';
  document.getElementById('itemPrice').value='';
  document.getElementById('itemQty').value='1';
  document.getElementById('itemDiscount').value='0';
  document.getElementById('itemBarcode').value='';
  document.getElementById('itemService').focus();
}

// ─── Render Table ─────────────────────────────────────────────────────────────
function renderItemsTable() {
  const tbody = document.getElementById('invoiceItemsBody');
  const isSaved = lastSavedInvoice !== null;
  const isExpress = document.getElementById('isExpressCheck')?.checked || false;
  const multiplier = isExpress ? 2 : 1;
  const isPriceEditDisabled = isSaved || (Number(settings.prevent_cashier_price_edit) === 1 && sessionRole === 'cashier');
  const isDiscountEditDisabled = isSaved || (Number(settings.cashier_prevent_discount) === 1 && sessionRole === 'cashier');
  
  if(!invoiceItems.length){
    tbody.innerHTML=`<tr id="emptyRow"><td colspan="9" class="table-empty"><div style="font-size:32px;margin-bottom:8px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--accent);"><path d="M9 12h6M9 16h6M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>ابدأ بإضافة خدمات للفاتورة</td></tr>`;
    return;
  }
  tbody.innerHTML = invoiceItems.map((item,i)=> {
    const effectivePrice = item.sell_price * multiplier;
    const itemTotal = (effectivePrice - item.item_discount) * item.quantity;
    return `
    <tr>
      <td style="color:var(--text-muted);font-size:11px;">${i+1}</td>
      <td><span class="badge badge-accent" style="font-size:10px;">${item.category_name||'—'}</span></td>
      <td style="font-weight:600;">${item.service_name} ${isExpress ? '<span style="color:#f59e0b;font-size:10px;">⚡</span>' : ''}</td>
      <td style="color:var(--text-muted);font-size:11px;font-family:monospace;">${item.barcode||'—'}</td>
      <td>
        <input type="number" class="qty-input" style="width:70px;" value="${item.sell_price}" min="0" step="0.5" onchange="updateItemPrice(${i}, this.value)" ${isPriceEditDisabled ? 'disabled' : ''} />
        ${isExpress ? `<small style="display:block;font-size:10px;color:#f59e0b;font-weight:700;">×2 = ${fmt(effectivePrice)}</small>` : ''}
      </td>
      <td>
        <input type="number" class="qty-input" value="${item.quantity}" min="1"
          onchange="updateQty(${i}, this.value)" ${isSaved?'disabled':''} />
      </td>
      <td><input type="number" class="qty-input" style="width:70px;" value="${item.item_discount}" min="0" onchange="updateItemDiscount(${i}, this.value)" ${isDiscountEditDisabled ? 'disabled' : ''} /></td>
      <td style="font-weight:700;color:var(--primary);">${fmt(itemTotal)}</td>
      <td>${isSaved ? '—' : `<button class="delete-row-btn" onclick="removeItem(${i})">✕</button>`}</td>
    </tr>
  `}).join('');
}

function updateQty(idx, val) {
  const qty = parseInt(val)||1;
  const item = invoiceItems[idx];
  item.quantity = qty;
  item.total = (item.sell_price - item.item_discount) * qty;
  renderItemsTable();
  recalcTotals();
}

function updateItemDiscount(index, val) {
  const d = parseFloat(val)||0;
  invoiceItems[index].item_discount = d;
  invoiceItems[index].total = (invoiceItems[index].sell_price - d) * invoiceItems[index].quantity;
  renderItemsTable();
  recalcTotals();
}

function updateItemPrice(index, val) {
  const p = parseFloat(val)||0;
  invoiceItems[index].sell_price = p;
  invoiceItems[index].total = (p - invoiceItems[index].item_discount) * invoiceItems[index].quantity;
  renderItemsTable();
  recalcTotals();
}

function removeItem(idx) {
  invoiceItems.splice(idx,1);
  renderItemsTable();
  recalcTotals();
}

// ─── Totals ────────────────────────────────────────────────────
function recalcTotals() {
  const isExpress = document.getElementById('isExpressCheck')?.checked || false;
  const multiplier = isExpress ? 2 : 1;
  const subtotal = invoiceItems.reduce((s,i)=>s+(i.sell_price * multiplier * i.quantity),0);
  const itemDiscounts = invoiceItems.reduce((s,i)=>s+(i.item_discount*i.quantity),0);

  let discountAmt = parseFloat(document.getElementById('discountAmount').value)||0;
  const discountPct = parseFloat(document.getElementById('discountPercent').value)||0;

  // Business rule: % first, then override with fixed if > 0
  let totalDiscount = itemDiscounts;
  if(discountPct>0) {
    totalDiscount = itemDiscounts + ((subtotal-itemDiscounts) * discountPct/100);
    // sync amount field
    document.getElementById('discountAmount').value = fmt((subtotal-itemDiscounts)*discountPct/100);
  }
  if(discountAmt>0 && discountPct===0) {
    totalDiscount = itemDiscounts + discountAmt;
  }

  const netTotal = Math.max(0, subtotal - totalDiscount);
  const paid = parseFloat(document.getElementById('amountPaid').value)||0;
  const remaining = Math.max(0, netTotal - paid);
  const totalQty = invoiceItems.reduce((s,i)=>s+i.quantity,0);

  document.getElementById('totalQtyDisplay').textContent = totalQty;
  document.getElementById('subtotalDisplay').textContent = fmt(subtotal);
  document.getElementById('discountDisplay').textContent = fmt(totalDiscount);
  document.getElementById('netTotalDisplay').textContent = fmt(netTotal);
  document.getElementById('paidDisplay').textContent = fmt(paid);
  document.getElementById('remainingDisplay').textContent = fmt(remaining);
}

function payFull() {
  const net = parseFloat(document.getElementById('netTotalDisplay').textContent)||0;
  document.getElementById('amountPaid').value = fmt(net);
  recalcTotals();
}

// ─── Delivery Toggle ──────────────────────────────────────────────────────────
function onDeliveryToggle() {
  const isDelivery = document.getElementById('isDeliveryCheck').checked;
  const lbl = document.getElementById('deliveryLabel');
  if (lbl) lbl.textContent = isDelivery ? 'دليفري' : '';
  const driverField = document.getElementById('driverField');
  if (driverField) {
    driverField.style.display = isDelivery ? 'flex' : 'none';
  }
  const driverSelect = document.getElementById('driverSelect');
  if (!isDelivery && driverSelect) {
    driverSelect.value = '';
  }
}

// ─── Express Toggle ──────────────────────────────────────────────────────────
function onExpressToggle() {
  const isExpress = document.getElementById('isExpressCheck').checked;
  const lbl = document.getElementById('expressLabel');
  if (lbl) lbl.textContent = isExpress ? '⚡ مضاعف' : '';
  renderItemsTable();
  recalcTotals();
}

// ─── Save Invoice ─────────────────────────────────────────────────────────────
async function saveInvoice(isPrint = false) {
  if(!invoiceItems.length){ showToast('لا توجد أصناف في الفاتورة','error'); return false; }

  const subtotal = parseFloat(document.getElementById('subtotalDisplay').textContent)||0;
  const discountAmt = parseFloat(document.getElementById('discountAmount').value)||0;
  const discountPct = parseFloat(document.getElementById('discountPercent').value)||0;
  const netTotal = parseFloat(document.getElementById('netTotalDisplay').textContent)||0;
  const amtPaid = parseFloat(document.getElementById('amountPaid').value)||0;
  const remaining = parseFloat(document.getElementById('remainingDisplay').textContent)||0;
  const isDelivery = document.getElementById('isDeliveryCheck')?.checked ? 1 : 0;

  // تحقق دليفري: العميل والعنوان والطيار مطلوبان
  if (isDelivery) {
    const custId = document.getElementById('customerSelect').value;
    if (!custId) {
      showToast('الدليفري يتطلب اختيار عميل أولاً', 'error');
      return false;
    }
    const custRes = await window.db.queryOne('SELECT address FROM customers WHERE id=?', [custId]);
    const custAddr = custRes.data?.address || '';
    if (!custAddr.trim()) {
      showToast('الدليفري يتطلب عنوان العميل — عدل بيانات العميل أولاً', 'error');
      return false;
    }
    const driverId = document.getElementById('driverSelect')?.value;
    if (!driverId) {
      showToast('الدليفري يتطلب اختيار الطيار', 'error');
      return false;
    }
  }

  const isExpress = document.getElementById('isExpressCheck')?.checked ? 1 : 0;
  const driverId = parseInt(document.getElementById('driverSelect')?.value) || null;

  const invoiceData = {
    customer_id: parseInt(document.getElementById('customerSelect').value)||null,
    employee_id: parseInt(document.getElementById('employeeSelect').value)||null,
    invoice_date: document.getElementById('invoiceDate').value,
    invoiceNumber: window._resumedInvoiceNumber || null,
    invoice_type: null,
    treasury_type: document.getElementById('treasuryType').value,
    subtotal, discount_percent:discountPct, discount_amount:discountAmt,
    net_total:netTotal, amount_paid:amtPaid, remaining,
    notes: document.getElementById('invoiceNotes').value,
    is_delivery: isDelivery,
    is_express: isExpress,
    driver_id: driverId
  };
  // payment_method يُشتق من treasury_type داخل db.js تلقائياً
  window._resumedPaymentMethod = null;

  const res = await window.db.saveInvoice(invoiceData, invoiceItems);
  if(res.success){
    lastSavedInvoice = { ...invoiceData, items:[...invoiceItems], invoiceNumber:res.data.invoiceNumber };

    // ── عرض نافذة النجاح فقط لو كان حفظ عادي بدون طباعة ──
    if (!isPrint) {
      const expressBadgeText = isExpress ? ' ⚡ مستعجل' : '';
      document.getElementById('savedInvNum').textContent = `فاتورة رقم: ${res.data.invoiceNumber}${isDelivery ? ' 🚚 دليفري' : ''}${expressBadgeText}`;
      document.getElementById('savedInvTotal').textContent = `الإجمالي: ${fmt(netTotal)} جنيه | المدفوع: ${fmt(amtPaid)} | المتبقي: ${fmt(remaining)}`;
      
      // إخفاء / إظهار زرار واتساب حسب وجود رقم العميل
      const customerPhone = getSelectedCustomerPhone();
      const waBtn = document.getElementById('savedModalWaBtn');
      if (waBtn) {
        waBtn.style.display = customerPhone ? 'inline-flex' : 'none';
      }
      
      openModal('savedModal');
    }
    showToast('تم حفظ الفاتورة بنجاح', 'success');
    return true;
  } else {
    showToast('خطأ في الحفظ: '+res.error,'error');
    return false;
  }
}

// ── مساعد: جلب رقم هاتف العميل المختار ──────────────────────────────────────
function getSelectedCustomerPhone() {
  const custId = document.getElementById('customerSelect').value;
  if (!custId || !window.allCustomers) return null;
  const cust = window.allCustomers.find(c => c.id === parseInt(custId));
  return cust?.phone || null;
}

function getSelectedCustomerName() {
  const custId = document.getElementById('customerSelect').value;
  if (!custId || !window.allCustomers) return 'عميلنا العزيز';
  const cust = window.allCustomers.find(c => c.id === parseInt(custId));
  return cust?.name || 'عميلنا العزيز';
}

// ── إرسال واتساب من نافذة النجاح (بعد حفظ الفاتورة) ──────────────────────────
async function sendWhatsApp() {
  if (!lastSavedInvoice) { showToast('لا توجد فاتورة محفوظة', 'error'); return; }

  const phone = getSelectedCustomerPhone();
  if (!phone) { showToast('العميل ليس لديه رقم هاتف مسجل', 'warning'); return; }

  const status = await window.whatsapp.getStatus();
  if (!status.ready) {
    showToast('واتساب غير متصل — تحقق من الإعدادات', 'warning');
    return;
  }

  const shopName = settings.company_name || 'دراي كلين';
  const customerName = getSelectedCustomerName();
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute:'2-digit' });

  const res = await window.whatsapp.sendInvoiceConfirm({
    phone,
    customerName,
    invoiceNumber: lastSavedInvoice.invoiceNumber,
    total: fmt(lastSavedInvoice.net_total || 0),
    paid: fmt(lastSavedInvoice.amount_paid || 0),
    remaining: fmt(lastSavedInvoice.remaining || 0),
    shopName,
    date: lastSavedInvoice.invoice_date,
    time: timeStr
  });

  if (res.success) {
    showToast('✅ تم إرسال واتساب للعميل!', 'success');
  } else {
    showToast(`❌ فشل الإرسال: ${res.error}`, 'error');
  }
}

// ── إرسال واتساب من سجل الفواتير ───────────────────────────────────────────────
async function sendWhatsAppFromHistory(inv) {
  const phone = inv.customer_phone;
  if (!phone) { showToast('العميل ليس لديه رقم هاتف مسجل', 'warning'); return; }

  const status = await window.whatsapp.getStatus();
  if (!status.ready) {
    showToast('واتساب غير متصل — تحقق من الإعدادات', 'warning');
    return;
  }

  const shopName = settings.company_name || 'دراي كلين';
  const customerName = inv.customer_name || 'عميلنا العزيز';

  const res = await window.whatsapp.sendInvoiceConfirm({
    phone, 
    customerName,
    invoiceNumber: inv.invoice_number,
    total: fmt(inv.net_total || 0),
    paid: fmt(inv.amount_paid || 0),
    remaining: fmt(inv.remaining || 0),
    shopName,
    date: inv.invoice_date || '',
    time: ''
  });

  if (res && res.success) {
    showToast('✅ تم إرسال واتساب للعميل!', 'success');
  } else {
    showToast(`❌ فشل الإرسال: ${res?.error || 'خطأ غير معروف'}`, 'error');
  }
}

// ─── Print Receipt ────────────────────────────────────────────────────────────
async function buildReceiptHTML(inv) {
  const itemsRows = (inv.items||invoiceItems).map((item,i)=>`
    <tr style="border-bottom:1px dashed #555;">
      <td style="padding:3px 2px;font-weight:700;">${i+1}</td>
      <td style="padding:3px 2px;font-weight:700;word-break:break-word;">${item.service_name}</td>
      <td style="text-align:center;padding:3px 2px;font-weight:700;">${item.quantity}</td>
      <td style="text-align:center;padding:3px 2px;font-weight:700;">${fmt(item.sell_price)}</td>
      <td style="text-align:center;padding:3px 2px;font-weight:700;">${fmt(item.total)}</td>
    </tr>
  `).join('');

  const invNum = inv.invoiceNumber || inv.invoice_number || currentInvoiceNumber;
  const date = inv.invoice_date || new Date().toLocaleDateString('ar-EG-u-nu-latn');
  const subtotal = fmt(inv.subtotal||0);
  const discount = fmt(inv.discount_amount||0);
  const net = fmt(inv.net_total||0);
  const paid = fmt(inv.amount_paid||0);
  const remaining = fmt(inv.remaining||0);
  const totalQty = (inv.items||invoiceItems).reduce((s,i)=>s+i.quantity,0);

  const safeLogo = settings.logo_path ? 'file:///' + settings.logo_path.replace(/\\/g, '/') : '';
  const logoHTML = safeLogo ? `<div style="text-align:center;margin-bottom:4px;"><img src="${safeLogo}" style="width:100%;max-height:130px;object-fit:contain;"></div>` : '';
  const addressHTML = settings.address ? `<div style="text-align:center;font-size:12px;font-weight:700;margin-bottom:2px;">العنوان: ${settings.address}</div>` : '';
  const phoneHTML = settings.phone ? `<div style="text-align:center;font-size:12px;font-weight:700;margin-bottom:2px;">تليفون: ${settings.phone}</div>` : '';
  
  const custSelect = document.getElementById('customerSelect');
  
  // Note: if reprinted from history, customer info might be directly on inv object
  let custName = 'عميل نقدي';
  let custPhone = '';
  
  if (inv.customer_name) {
    custName = inv.customer_name;
    custPhone = inv.customer_phone;
  } else if (inv.customer_id && window.allCustomers) {
    const c = window.allCustomers.find(x => x.id == inv.customer_id);
    if (c) {
      custName = c.name;
      custPhone = c.phone || '';
    }
  } else if (custSelect && custSelect.value && window.allCustomers) {
    const c = window.allCustomers.find(x => x.id == custSelect.value);
    if (c) {
      custName = c.name;
      custPhone = c.phone || '';
    }
  }
  const custNameHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">العميل:</span><span style="font-weight:700;">${custName}</span></div>`;
  const custPhoneHTML = (custPhone && custPhone !== 'null' && custPhone !== '') ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">ت.العميل:</span><span style="font-weight:700;">${custPhone}</span></div>` : '';

  // عنوان العميل: يظهر دائماً للدليفري أو إذا كان show_customer_address=1
  const isDeliveryInv = inv.is_delivery || document.getElementById('isDeliveryCheck')?.checked;
  const isExpressInv = inv.is_express || document.getElementById('isExpressCheck')?.checked;

  let custAddrHTML = '';
  try {
    const cId = inv.customer_id || document.getElementById('customerSelect')?.value;
    if (cId) {
      const addrRes = await window.db.queryOne('SELECT address FROM customers WHERE id=?', [cId]);
      const addr = addrRes?.data?.address || '';
      if (addr && (isDeliveryInv || Number(settings.show_customer_address) === 1)) {
        custAddrHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">العنوان:</span><span style="font-weight:700;">${addr}</span></div>`;
      }
    }
  } catch(e) {}

  // الطيار
  let driverHTML = '';
  if (isDeliveryInv) {
    let driverName = inv.driver_name;
    const driverSelect = document.getElementById('driverSelect');
    if (!driverName && driverSelect && driverSelect.value) {
      driverName = driverSelect.options[driverSelect.selectedIndex]?.text;
    } else if (!driverName && inv.driver_id) {
      const dRes = await window.db.queryOne('SELECT name FROM employees WHERE id=?', [inv.driver_id]);
      driverName = dRes?.data?.name || '';
    }
    if (driverName && driverName !== 'اختر الطيار') {
      driverHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الطيار:</span><span style="font-weight:700;">${driverName}</span></div>`;
    }
  }

  const deliveryBadgeHTML = isDeliveryInv ? `<div style="text-align:center;background:#fff;color:#000;border:1.5px solid #000;border-radius:4px;padding:2px 14px;font-size:13px;font-weight:900;margin:4px auto;width:fit-content;letter-spacing:0.5px;">Delivery 🛵</div>` : '';
  const expressBadgeHTML = isExpressInv ? `<div style="text-align:center;background:#fff;color:#000;border:1.5px solid #000;border-radius:4px;padding:2px 14px;font-size:13px;font-weight:900;margin:4px auto;width:fit-content;letter-spacing:0.5px;">Express ⚡</div>` : '';
  
  const notesStr = inv.notes || document.getElementById('invoiceNotes').value || '';
  const invoiceNotesHTML = notesStr ? `<div style="margin-top:6px;font-size:12px;font-weight:700;border:1px dashed #000;padding:4px;">ملاحظات: ${notesStr}</div>` : '';
  const settingsNotesHTML = settings.receipt_notes ? `<div style="text-align:center;font-size:12px;margin-top:4px;font-weight:700;">${settings.receipt_notes}</div>` : '';

  const receiptContent = `
    <div class="receipt" style="
      width:68mm;
      box-sizing:border-box;
      font-family:'Cairo',Arial,sans-serif;
      font-size:13px;
      font-weight:700;
      color:#000;
      direction:rtl;
      padding:2mm;
      margin:0 auto;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${logoHTML}
      <div style="text-align:center;font-size:20px;font-weight:900;margin-bottom:4px;letter-spacing:0.5px;">${settings.company_name||'Dry Clean'}</div>
      ${deliveryBadgeHTML}
      ${expressBadgeHTML}
      ${addressHTML}
      ${phoneHTML}
      <div style="border-top:2px dashed #000;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">رقم الفاتورة:</span><span style="font-weight:900;">${invNum}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">التاريخ:</span><span style="font-weight:700;">${date}</span></div>
      ${custNameHTML}
      ${custPhoneHTML}
      ${custAddrHTML}
      ${driverHTML}
      <div style="border-top:2px dashed #000;margin:6px 0;"></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;font-weight:700;table-layout:fixed;">
        <colgroup>
          <col style="width:8%;">
          <col style="width:40%;">
          <col style="width:12%;">
          <col style="width:18%;">
          <col style="width:22%;">
        </colgroup>
        <thead><tr style="border-bottom:2px solid #000;">
          <th style="text-align:right;padding:3px 2px;font-weight:900;background:#fff !important;color:#000 !important;">#</th>
          <th style="text-align:right;padding:3px 2px;font-weight:900;background:#fff !important;color:#000 !important;">الصنف</th>
          <th style="text-align:center;padding:3px 2px;font-weight:900;background:#fff !important;color:#000 !important;">كمية</th>
          <th style="text-align:center;padding:3px 2px;font-weight:900;background:#fff !important;color:#000 !important;">السعر</th>
          <th style="text-align:center;padding:3px 2px;font-weight:900;background:#fff !important;color:#000 !important;">الإجمالي</th>
        </tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <div style="border-top:2px dashed #000;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">إجمالي الكمية:</span><span style="font-weight:700;">${totalQty}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الإجمالي:</span><span style="font-weight:700;">${subtotal} ${settings.currency||'جنيه'}${isExpressInv ? ' (x2 إكسبريس)' : ''}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الخصم:</span><span style="font-weight:700;">${discount} ${settings.currency||'جنيه'}</span></div>
      <div style="border-top:1px solid #000;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;margin-bottom:3px;"><span>الصافي:</span><span>${net} ${settings.currency||'جنيه'}</span></div>
      <div style="border-top:1px solid #000;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">المدفوع:</span><span style="font-weight:700;">${paid} ${settings.currency||'جنيه'}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-weight:700;">الباقي:</span><span style="font-weight:900;">${remaining} ${settings.currency||'جنيه'}</span></div>
      ${inv.garment_type ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;margin-top:4px;border-top:1px dashed #000;padding-top:4px;"><span style="font-weight:700;">نوع المعالجة:</span><span style="font-weight:900;">${inv.garment_type}</span></div>` : ''}
      ${invoiceNotesHTML}
      <div style="border-top:2px dashed #000;margin:8px 0;"></div>
      <div style="text-align:center;font-weight:900;font-size:13px;">${settings.receipt_footer||'شكراً لزيارتكم'}</div>
      ${settingsNotesHTML}
    </div>`;

  return receiptContent;
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
        openHistoryModal(); // refresh
      } else {
        showToast('خطأ: ' + dbRes.error, 'error');
      }
    } else {
      showToast('مبلغ غير صحيح', 'error');
    }
  }
}

// ─── Label Modal Helpers ──────────────────────────────────────────────────────
function onGarmentTypeChange() {
  ['H','S','F'].forEach(t => {
    const wrap = document.getElementById(`lbl_${t}_wrap`);
    const radio = document.getElementById(`lbl_${t}`);
    if (wrap && radio) {
      wrap.style.borderColor = radio.checked ? 'var(--primary)' : 'var(--border)';
      wrap.style.background  = radio.checked ? 'var(--accent-light)' : '';
    }
  });
}

// Promise-based label modal — resolves with data or null (cancel = skip label, not skip print)
let _labelModalResolve = null;
let _labelModalWithWhatsApp = false;

function openLabelModal(withWhatsApp) {
  // Reset state
  document.getElementById('labelPiecesCount').value = '1';
  document.getElementById('labelIronMark').checked = false;
  document.querySelectorAll('input[name="labelGarmentType"]').forEach(r => { r.checked = false; });
  ['H','S','F'].forEach(t => {
    const wrap = document.getElementById(`lbl_${t}_wrap`);
    if (wrap) { wrap.style.borderColor = ''; wrap.style.background = ''; }
  });
  _labelModalWithWhatsApp = withWhatsApp;
  openModal('labelModal');
  return new Promise(resolve => { _labelModalResolve = resolve; });
}

async function confirmLabelModal() {
  const pieces = parseInt(document.getElementById('labelPiecesCount').value) || 1;
  const garmentType = document.querySelector('input[name="labelGarmentType"]:checked')?.value || '';
  if (!garmentType) {
    showToast('اختر نوع المعالجة (H / S / F)', 'error');
    return;
  }
  const hasIronMark = document.getElementById('labelIronMark').checked ? 1 : 0;
  closeModal('labelModal');

  // 1. طباعة الليبل فوراً على طابعة الليبل بمجرد الضغط على تأكيد وطباعة
  try {
    const sRes = await window.db.getSettings();
    const sData = (sRes && sRes.success && sRes.data) ? sRes.data : settings;
    const labelPrinter = sData.label_printer || '';
    const labelWidth = parseInt(sData.label_width, 10) || 38;
    const labelHeight = parseInt(sData.label_height, 10) || 35;

    if (labelPrinter) {
      const invNum = lastSavedInvoice?.invoiceNumber || lastSavedInvoice?.invoice_number || currentInvoiceNumber;
      const totalPieces = Math.max(1, pieces);
      const labelHTML = buildLabelHTML(invNum, garmentType, hasIronMark, totalPieces, labelWidth, labelHeight);

      const printBox = document.getElementById('receiptPrint');
      if (printBox) {
        printBox.className = 'receipt-print';
        printBox.innerHTML = labelHTML;
        await new Promise(r => setTimeout(r, 150));

        await window.electron.print({
          deviceName: labelPrinter,
          copies: totalPieces
        });

        await new Promise(r => setTimeout(r, 400));
        printBox.innerHTML = '';
      }
    }
  } catch (err) {
    console.error('Direct label print error:', err);
  }

  if (_labelModalResolve) _labelModalResolve({ pieces, garmentType, hasIronMark });
  _labelModalResolve = null;
}

function cancelLabelModal() {
  closeModal('labelModal');
  // null = skip label but still print invoice
  if (_labelModalResolve) _labelModalResolve(null);
  _labelModalResolve = null;
}

// SVG لوجو المكواة المطابق تماماً للصورة بجودة عالية للطباعة الحرارية
const ironIconSVG = `
  <svg width="34" height="18" viewBox="0 0 100 55" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;">
    <!-- قاعدة المكواة السفلية -->
    <polygon points="12,50 82,50 85,44 18,44" fill="#000" stroke="#000" stroke-width="1" />
    <!-- خط فوق القاعدة -->
    <line x1="18" y1="38" x2="85" y2="38" stroke-width="4.5" />
    <!-- جسم المكواة المنحني -->
    <path d="M 18 38 L 14 38 C 22 24, 42 12, 62 12 C 78 12, 85 15, 85 38 Z" stroke-width="5" />
    <!-- كعب المقبض المائل للخلف -->
    <line x1="84" y1="16" x2="93" y2="9" stroke-width="5" />
    <!-- فتحة مقبض المكواة -->
    <rect x="52" y="19" width="25" height="11" rx="5.5" stroke-width="4.5" />
  </svg>
`;

// Build single label HTML (fits configured width & height starting from left:0)
function buildLabelHTML(invoiceNumber, garmentType, hasIronMark, totalPieces = 1, widthMM = 38, heightMM = 35) {
  const total = Math.max(1, parseInt(totalPieces, 10) || 1);
  const w = parseInt(widthMM, 10) || 38;
  const h = parseInt(heightMM, 10) || 35;

  const numFontSize = h <= 25 ? 13 : (h <= 35 ? 15 : 18);
  const garmentFontSize = h <= 25 ? 24 : (h <= 35 ? 30 : 38);
  const botFontSize = h <= 25 ? 13 : (h <= 35 ? 15 : 17);
  const svgW = h <= 25 ? 24 : (h <= 35 ? 28 : 34);
  const svgH = h <= 25 ? 13 : (h <= 35 ? 15 : 18);

  return `
    <div style="
      width: ${w}mm;
      max-width: ${w}mm;
      height: ${h}mm;
      max-height: ${h}mm;
      text-align: center;
      margin: 0;
      padding: 1px 2px;
      font-family: Arial, Tahoma, sans-serif;
      color: #000000;
      box-sizing: border-box;
      direction: ltr;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    ">
      <div style="font-size:${numFontSize}px;font-weight:900;letter-spacing:0.5px;border-bottom:2px solid #000;padding-bottom:1px;text-align:center;line-height:1.1;">
        ${invoiceNumber}
      </div>
      
      <div style="font-size:${garmentFontSize}px;font-weight:900;line-height:1;margin:1px 0;text-align:center;">
        ${garmentType}
      </div>
      
      <div style="display:flex;justify-content:center;align-items:center;gap:6px;direction:rtl;line-height:1;">
        <span style="font-size:${botFontSize}px;font-weight:900;">القطع: ${total}</span>
        ${hasIronMark ? `
          <svg width="${svgW}" height="${svgH}" viewBox="0 0 100 55" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;">
            <polygon points="12,50 82,50 85,44 18,44" fill="#000" stroke="#000" stroke-width="1" />
            <line x1="18" y1="38" x2="85" y2="38" stroke-width="4.5" />
            <path d="M 18 38 L 14 38 C 22 24, 42 12, 62 12 C 78 12, 85 15, 85 38 Z" stroke-width="5" />
            <line x1="84" y1="16" x2="93" y2="9" stroke-width="5" />
            <rect x="52" y="19" width="25" height="11" rx="5.5" stroke-width="4.5" />
          </svg>
        ` : ''}
      </div>
    </div>
  `;
}

function printAndReset() {
  printReceipt(false);
}

async function printReceipt(withWhatsApp = false) {
  try {
    const inv = lastSavedInvoice || {
      items: invoiceItems,
      invoice_date: document.getElementById('invoiceDate').value,
      subtotal: parseFloat(document.getElementById('subtotalDisplay').textContent) || 0,
      discount_amount: parseFloat(document.getElementById('discountAmount').value) || 0,
      net_total: parseFloat(document.getElementById('netTotalDisplay').textContent) || 0,
      amount_paid: parseFloat(document.getElementById('amountPaid').value) || 0,
      remaining: parseFloat(document.getElementById('remainingDisplay').textContent) || 0
    };

    // ─ Step 1: Show label modal (non-blocking). Cancel = skip label, not skip print.
    const labelData = await openLabelModal(withWhatsApp);
    // labelData is { pieces, garmentType, hasIronMark } or null (cancelled = skip label)

    // ─ Step 2: Persist label data to DB if confirmed
    if (labelData && lastSavedInvoice?.invoiceNumber) {
      await window.db.run(
        'UPDATE invoices SET pieces_count=?, garment_type=?, has_iron_mark=? WHERE invoice_number=?',
        [labelData.pieces, labelData.garmentType, labelData.hasIronMark, lastSavedInvoice.invoiceNumber]
      );
      lastSavedInvoice.pieces_count  = labelData.pieces;
      lastSavedInvoice.garment_type  = labelData.garmentType;
      lastSavedInvoice.has_iron_mark = labelData.hasIronMark;
    }

    // ─ Step 3: Build receipt HTML (with garment type appended if we have it)
    inv.garment_type = labelData?.garmentType || inv.garment_type || '';
    const receiptHTML = await buildReceiptHTML(inv);

    // ─ Step 4: Print invoice (show preview first)
    const result = await Swal.fire({
      title: 'معاينة الفاتورة',
      html: `<div style="display:flex;justify-content:center;max-height:400px;overflow-y:auto;background:#fff;padding:10px;border:1px solid #ddd;border-radius:8px;width:100%;max-width:80mm;margin:0 auto;">${receiptHTML}</div>`,
      showCancelButton: true,
      confirmButtonText: 'طباعة الفاتورة الآن 🧾',
      cancelButtonText: 'تخطي طباعة الفاتورة',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#6c757d',
      width: 'auto'
    });

    if (result.isConfirmed) {
      const printBox = document.getElementById('receiptPrint');

      // Fetch fresh settings directly from DB before printing
      const sRes = await window.db.getSettings();
      const sData = (sRes && sRes.success && sRes.data) ? sRes.data : settings;
      const invoicePrinter = sData.invoice_printer || '';

      // طباعة الفاتورة فقط على طابعة الفواتير (عرض 80mm)
      printBox.className = 'receipt-print';
      printBox.innerHTML = receiptHTML;
      await new Promise(r => setTimeout(r, 150));
      await window.electron.print(invoicePrinter ? { deviceName: invoicePrinter } : undefined);
      await new Promise(r => setTimeout(r, 400));
      printBox.innerHTML = '';
    }

    if (withWhatsApp) {
      await sendWhatsApp();
    }
    await newInvoice();
  } catch (err) {
    alert('حدث خطأ في الطباعة: ' + err.message);
  }
}

async function saveAndPrint() {
  const success = await saveInvoice(true);
  if (success) {
    printReceipt(false);
  }
}

async function savePrintAndWhatsApp() {
  const success = await saveInvoice(true);
  if (success) {
    printReceipt(true);
  }
}

// ─── New / Reset Invoice ──────────────────────────────────────────────────────
async function newInvoice() {
  invoiceItems=[];
  lastSavedInvoice=null;
  renderItemsTable();
  recalcTotals();
  document.getElementById('discountPercent').value='0';
  document.getElementById('discountAmount').value='0';
  document.getElementById('amountPaid').value='0';
  document.getElementById('invoiceNotes').value='';
  document.getElementById('customerSearchInput').value='';
  document.getElementById('customerSelect').value='';
  document.getElementById('invoiceDate').value=getLocalISODate();
  
  // إعادة حالة الدليفري والطيار والإكسبريس
  const delivCheck = document.getElementById('isDeliveryCheck');
  if (delivCheck) { delivCheck.checked = false; }
  const delivLbl = document.getElementById('deliveryLabel');
  if (delivLbl) { delivLbl.textContent = ''; }
  const driverField = document.getElementById('driverField');
  if (driverField) { driverField.style.display = 'none'; }
  const driverSelect = document.getElementById('driverSelect');
  if (driverSelect) { driverSelect.value = ''; }
  const expCheck = document.getElementById('isExpressCheck');
  if (expCheck) { expCheck.checked = false; }
  const expLbl = document.getElementById('expressLabel');
  if (expLbl) { expLbl.textContent = ''; }

  window._resumedInvoiceNumber = null;
  window._resumedPaymentMethod = null;
  closeModal('savedModal');
  const invRes = await window.db.generateInvoiceNumber();
  if(invRes.success){ currentInvoiceNumber=invRes.data; document.getElementById('invoiceNumberDisplay').textContent=invRes.data; }
}

function resetInvoice() {
  if(!invoiceItems.length) return;
  Swal.fire({
    title: 'هل أنت متأكد؟',
    text: "سيتم مسح جميع الأصناف من الفاتورة!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، امسح',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      invoiceItems=[]; renderItemsTable(); recalcTotals();
    }
  });
}

function deleteInvoice() {
  Swal.fire({
    title: 'إلغاء الفاتورة؟',
    text: "سيتم إلغاء هذه الفاتورة والبدء من جديد",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، إلغاء',
    cancelButtonText: 'تراجع'
  }).then((result) => {
    if (result.isConfirmed) newInvoice();
  });
}

// ─── New Customer ─────────────────────────────────────────────────────────────
function openNewCustomerModal(){ openModal('newCustomerModal'); }
async function saveNewCustomer(){
  const name = document.getElementById('nc_name').value.trim();
  if(!name){ showToast('يرجى إدخال اسم العميل','error'); return; }
  const phoneVal = document.getElementById('nc_phone').value.trim();

  // التحقق من عدم تكرار رقم التليفون
  if (phoneVal) {
    const checkPhone = await window.db.queryOne(
      `SELECT id, name FROM customers WHERE phone=? LIMIT 1`, [phoneVal]
    );
    if (checkPhone.success && checkPhone.data) {
      showToast(`رقم التليفون "${phoneVal}" مسجل مسبقاً للعميل: ${checkPhone.data.name}`, 'error');
      return;
    }
  }

  const res = await window.db.run(
    `INSERT INTO customers (name,phone,address,opening_balance,current_balance) VALUES (?,?,?,0,0)`,
    [name, phoneVal, document.getElementById('nc_address').value.trim()]
  );
  if(res.success){
    // Update global array
    const newId = res.lastInsertRowid;
    if(!window.allCustomers) window.allCustomers = [];
    window.allCustomers.push({ id: newId, name: name, phone: phoneVal });
    
    // Update datalist
    const cList = document.getElementById('customersList');
    cList.innerHTML += `<option value="${name} - ${phoneVal}" data-id="${newId}" data-phone="${phoneVal}"></option>`;
    
    // Auto select
    document.getElementById('customerSearchInput').value = `${name} - ${phoneVal}`;
    document.getElementById('customerSelect').value = newId;

    showToast(`تم إضافة العميل "${name}" `,'success');
    closeModal('newCustomerModal');
    document.getElementById('nc_name').value='';
    document.getElementById('nc_phone').value='';
    document.getElementById('nc_address').value='';
    document.getElementById('nc_balance').value='0';
  } else { showToast('خطأ: '+res.error,'error'); }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e=>{
  if(e.key==='Enter' && e.target.id==='itemBarcode'){ e.preventDefault(); lookupBarcode(); }
  if(e.key==='F1'){ e.preventDefault(); saveInvoice(false); }
  if(e.key==='Escape'){ goBack(); }
});

// ─── Invoices History ───────────────────────────────────────────────────────────
async function openHistoryModal() {
  document.getElementById('posHistorySearch').value = '';
  if (document.getElementById('posHistoryPhone')) document.getElementById('posHistoryPhone').value = '';

  // جلب آخر 300 فاتورة فقط — لتجنب بطء الجلب عند كثرة الفواتير
  const res = await window.db.query(`
    SELECT i.*, 
           c.name as customer_name, 
           c.phone as customer_phone,
           d.name as driver_name,
           (i.net_total - COALESCE((SELECT SUM(total_returned) FROM returns WHERE original_invoice_id = i.id), 0)) as dynamic_net_total
    FROM invoices i 
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN employees d ON i.driver_id = d.id
    ORDER BY i.id DESC
    LIMIT 300
  `, []);
  if (res.success && res.data) {
    posAllInvoices = res.data;
  } else {
    posAllInvoices = [];
  }
  
  renderPosHistory(posAllInvoices.slice(0, 30));
  openModal('historyModal');
}

async function reprintPastInvoice(inv) {
  closeModal('historyModal');
  
  // Fetch items for this invoice
  const itemsRes = await window.db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
  const items = itemsRes.success ? itemsRes.data : [];
  
  // Reuse existing receipt logic
  lastSavedInvoice = {
    ...inv,
    items: items,
    customer_name: inv.customer_name,
    customer_phone: inv.customer_phone
  };
  
  printReceipt();
}

init();

// ─── Quit Confirmation ────────────────────────────────────────────────────────
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