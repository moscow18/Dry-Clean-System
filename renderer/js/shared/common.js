'use strict';

/**
 * دالة مشتركة لإظهار التنبيهات المنبثقة
 * @param {string} msg الرسالة
 * @param {string} type نوع التنبيه (success, error, warning, info)
 */
function showToast(msg, type = 'success') {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type,
      title: msg,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  } else {
    console.log(`[Toast ${type}] ${msg}`);
  }
}

/**
 * فتح المودال بناء على الـ ID
 * @param {string} id 
 */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

/**
 * إغلاق المودال بناء على الـ ID
 * @param {string} id 
 */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/**
 * الانتقال لصفحة أخرى مع تأثير انتقال ناعم
 * @param {string} page 
 */
function navigate(page) {
  document.body.style.transition = 'opacity 0.15s ease';
  document.body.style.opacity = '0';
  setTimeout(() => {
    if (window.electron && window.electron.navigate) {
      window.electron.navigate(page);
    } else {
      window.location.href = page;
    }
  }, 150);
}

/**
 * الرجوع للصفحة الرئيسية
 */
function goBack() {
  navigate('main-dashboard.html');
}

/**
 * تنسيق الأرقام لخانة عشرية واحدة أو اثنتين
 * @param {number|string} n 
 * @returns {string}
 */
function fmt(n) {
  return Number(n || 0).toFixed(2);
}

/**
 * التحقق مما إذا كان المستخدم مديراً بناءً على الـ Session Storage
 * @returns {boolean}
 */
function checkAdmin() {
  const role = sessionStorage.getItem('elTarzy_role');
  return role === 'admin';
}

/**
 * تطبيق قيود العرض للمدير فقط
 * إخفاء أي عنصر يحمل كلاس .admin-only لو لم يكن المستخدم مديراً
 */
function enforceAdminUI() {
  if (!checkAdmin()) {
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = 'none';
    });
  }
}

async function sendDailyReportAndQuit() {
  try {
    const setRes = await window.db.getSettings();
    if (setRes && setRes.success && setRes.data) {
      sessionStorage.setItem('elTarzy_dayCutoffHour', setRes.data.day_cutoff_hour || 0);
    }
    const phone = setRes.data?.admin_wa_phone;
    const today = getLocalISODate();

    if (phone) {
      // ── جلب إعدادات المحل لاسم الملف ──
      const shopName = setRes.data?.company_name || 'Dry Clean';

      // ── مسار حفظ PDF ──
      const basePath = (setRes.data?.report_save_path || '').replace(/[/\\]+$/, '');
      let savePath;
      if (basePath) {
        savePath = basePath + '\\' + `تقرير-${today}.pdf`;
      } else {
        // استخدم مجلد AppData/Temp كمسار مؤقت
        const userData = await window.electron.getUserDataPath();
        savePath = userData + '\\تقرير-' + today + '.pdf';
      }

      // ── توليد الـ PDF من نافذة مخفية ──
      const pdfRes = await window.electron.generateAndSendReport({
        date: today,
        savePath: savePath,
        phone: phone
      });

      if (pdfRes && pdfRes.success) {
        // ── التحقق من حالة واتساب ──
        const waStatus = await window.whatsapp.getStatus().catch(() => ({ ready: false }));

        // ── نص الرسالة المرافقة ──
        const res = await window.db.getDailyReport(today);
        let caption = `📊 ${shopName} — تقرير يوم ${today}`;
        if (res && res.success) {
          const { summary, treasuryBalances } = res.data;
          const totInc = (summary.invoices_paid || 0) + (summary.revenues || 0);
          const totExp = (summary.expenses || 0) + (summary.returns || 0);
          const totAdv = (summary.advances || 0) + (summary.salaries || 0);
          const net = totInc - (totExp + totAdv);
          let netCash = 0, netVodafone = 0, netInstapay = 0;
          (treasuryBalances || []).forEach(t => {
            if (t.treasury_type === 'الخزينة') netCash = t.balance;
            else if (t.treasury_type === 'فودافون كاش') netVodafone = t.balance;
            else if (t.treasury_type === 'إنستا باي') netInstapay = t.balance;
          });
          caption = `📊 ${shopName} — تقرير يوم ${today}\n\n• إجمالي الدخل: ${fmt(totInc)} ج\n• المصروفات: ${fmt(totExp)} ج\n• السلف والرواتب: ${fmt(totAdv)} ج\n*• صافي اليوم: ${fmt(net)} ج*\n\n💳 الخزائن:\n• 💵 نقدي: ${fmt(netCash)} ج\n• 📱 فودافون: ${fmt(netVodafone)} ج\n• 💳 إنستا باي: ${fmt(netInstapay)} ج\n\n(أُرسل تلقائياً عند الإغلاق)`;
        }

        if (waStatus && waStatus.ready) {
          // إرسال الـ PDF عبر واتساب
          await window.whatsapp.sendFile(phone, caption, pdfRes.path).catch(e => {
            console.error('WhatsApp PDF send error:', e);
          });
        } else {
          // Fallback: إرسال نص فقط
          await window.whatsapp.sendMessage(phone, caption).catch(e => {
            console.error('WhatsApp text fallback error:', e);
          });
        }
      } else {
        // فشل توليد الـ PDF — fallback للنص فقط
        const res = await window.db.getDailyReport(today);
        if (res && res.success) {
          const { summary, treasuryBalances } = res.data;
          const totInc = (summary.invoices_paid || 0) + (summary.revenues || 0);
          const totExp = (summary.expenses || 0) + (summary.returns || 0);
          const totAdv = (summary.advances || 0) + (summary.salaries || 0);
          const net = totInc - (totExp + totAdv);
          let netCash = 0, netVodafone = 0, netInstapay = 0;
          (treasuryBalances || []).forEach(t => {
            if (t.treasury_type === 'الخزينة') netCash = t.balance;
            else if (t.treasury_type === 'فودافون كاش') netVodafone = t.balance;
            else if (t.treasury_type === 'إنستا باي') netInstapay = t.balance;
          });
          let text = `*📊 تقرير الإغلاق ليوم: ${today}*\n\n`;
          text += `• إجمالي الدخل: ${fmt(totInc)} ج\n`;
          text += `• إجمالي المصروفات: ${fmt(totExp)} ج\n`;
          text += `• السلف والرواتب: ${fmt(totAdv)} ج\n`;
          text += `• *صافي اليوم: ${fmt(net)} ج*\n\n`;
          text += `💳 الخزائن:\n• 💵 نقدي: ${fmt(netCash)} ج\n• 📱 فودافون: ${fmt(netVodafone)} ج\n• 💳 إنستا باي: ${fmt(netInstapay)} ج\n\n(أُرسل تلقائياً عند الإغلاق)`;
          await window.whatsapp.sendMessage(phone, text).catch(e => console.error(e));
        }
      }
    }
  } catch(e) {
    console.error('Error sending daily report:', e);
  }
  // ── نسخة احتياطية تلقائية قبل الإغلاق ──
  if (typeof showToast === 'function') {
    showToast('✅ تم الإرسال — جاري أخذ نسخة احتياطية...', 'success');
  }
  await new Promise(r => setTimeout(r, 1500)); // انتظر عشان تظهر الرسالة
  window.electron.quitWithBackup();
}

function getLocalISODate(d = new Date()) {
  const cutoffHour = parseInt(sessionStorage.getItem('elTarzy_dayCutoffHour') || '0', 10);
  const offset = d.getTimezoneOffset() * 60000;
  const localDate = new Date(d.getTime() - offset);
  const currentHour = localDate.getUTCHours();
  if (cutoffHour > 0 && currentHour < cutoffHour) {
    localDate.setUTCDate(localDate.getUTCDate() - 1);
  }
  return localDate.toISOString().split('T')[0];
}

// Auto-sync dayCutoffHour on startup
(async function autoSyncCutoffHour() {
  try {
    if (window.db && window.db.getSettings) {
      const setRes = await window.db.getSettings();
      if (setRes && setRes.success && setRes.data) {
        sessionStorage.setItem('elTarzy_dayCutoffHour', setRes.data.day_cutoff_hour || 0);
      }
    }
  } catch (e) {}
})();

// Auto-sync shop name and logo across all pages
(async function autoSyncShopBranding() {
  try {
    if (!window.db || !window.db.getSettings) return;
    const res = await window.db.getSettings();
    if (!res || !res.success || !res.data) return;

    let logoUrl = null;
    if (res.data.logo_path) {
      if (window.electron && window.electron.getLogoPath) {
        logoUrl = await window.electron.getLogoPath(res.data.logo_path);
      }
      if (!logoUrl && res.data.logo_path) {
        logoUrl = 'file:///' + res.data.logo_path.replace(/\\/g, '/');
      }
    }

    const filename = res.data.logo_path ? res.data.logo_path.split(/[\\/]/).pop().toLowerCase() : '';
    const isOldDefaultLogo = filename.includes('sewing') || filename === 'el-tarzy-logo.png';

    function applyBranding() {
      // 1. Apply Shop Name
      if (res.data.company_name) {
        const name = res.data.company_name.trim();
        if (name) {
          const navText = document.getElementById('navbarLogoText');
          if (navText) navText.textContent = name;

          const sidebarText = document.getElementById('sidebarLogoText') || document.querySelector('.sidebar-logo .logo-text');
          if (sidebarText) sidebarText.textContent = name;

          const shopFooters = document.querySelectorAll('#sidebarShopName, .sidebar-footer-shop');
          shopFooters.forEach(el => el.textContent = name);
        }
      }

      // 2. Apply Shop Logo Image
      if (logoUrl && !isOldDefaultLogo) {
        const navIcon = document.getElementById('navbarLogoIcon');
        if (navIcon) {
          navIcon.innerHTML = `<img src="${logoUrl}" style="width:100%; height:100%; object-fit:contain; border-radius:10px;">`;
          navIcon.style.background = 'transparent';
          navIcon.style.boxShadow = 'none';
        }

        const sidebarIcon = document.getElementById('sidebarLogoIcon') || document.querySelector('.sidebar-logo .logo-icon');
        if (sidebarIcon) {
          sidebarIcon.innerHTML = `<img src="${logoUrl}" style="width:100%; height:100%; object-fit:contain; border-radius:10px;">`;
          sidebarIcon.style.background = 'transparent';
          sidebarIcon.style.boxShadow = 'none';
        }
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyBranding);
    } else {
      applyBranding();
    }
  } catch (e) {
    console.warn('[Branding] Failed to sync branding:', e);
  }
})();


/**
 * فحص ومطابقة جميع أكياس الطلب عبر مسح باركود/QR كل كيس
 * @param {number} invoiceId 
 * @param {string} invoiceNumber 
 * @param {string} reasonTitle 
 * @returns {Promise<boolean>} returns true if all bags verified or no bags exist, false if cancelled
 */
async function verifyAllBagsScanned(invoiceId, invoiceNumber, reasonTitle = 'تأكيد الطلب') {
  try {
    if (!window.db || !window.db.getInvoiceBags) return true;

    const bagsRes = await window.db.getInvoiceBags(invoiceId);
    if (!bagsRes || !bagsRes.success || !bagsRes.data || bagsRes.data.length === 0) {
      // لا توجد أكياس مسجلة لهذه الفاتورة
      return true;
    }

    let bags = bagsRes.data;
    const totalBags = bags.length;

    // لو كل الأكياس ممسوحة مسبقاً
    const alreadyAllScanned = bags.every(b => b.scanned_at !== null && b.scanned_at !== undefined);
    if (alreadyAllScanned) {
      return true;
    }

    // بناء واجهة فحص الأكياس بالـ SweetAlert2
    return new Promise((resolve) => {
      let currentBags = [...bags];

      function renderBagsList() {
        return currentBags.map(b => {
          const isDone = Boolean(b.scanned_at);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:8px;border-radius:10px;border:1.5px solid ${isDone ? '#10B981' : '#E2E8F0'};background:${isDone ? '#ECFDF5' : '#F8FAFC'};font-family:'Cairo',sans-serif;">
              <div style="text-align:right;">
                <span style="font-weight:700;color:${isDone ? '#065F46' : '#1E293B'};">🛍️ كيس رقم ${b.bag_number} من ${totalBags}</span>
                <div style="font-size:12px;color:#64748B;direction:ltr;text-align:right;font-family:monospace;">${b.qr_code}</div>
              </div>
              <div>
                ${isDone 
                  ? '<span style="background:#10B981;color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;">✅ تم الفحص</span>' 
                  : '<span style="background:#F1F5F9;color:#64748B;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">⏳ في الانتظار</span>'}
              </div>
            </div>
          `;
        }).join('');
      }

      function getScannedCount() {
        return currentBags.filter(b => Boolean(b.scanned_at)).length;
      }

      Swal.fire({
        title: `🛍️ فحص أكياس الفاتورة (${invoiceNumber})`,
        html: `
          <div style="font-family:'Cairo',sans-serif;text-align:right;margin-bottom:12px;">
            <p style="color:#475569;font-size:14px;margin-bottom:14px;">
              ${reasonTitle} — يجب مسح كود كل كيس للتأكد من عدم نسيان أو خلط أي كيس قبل المتابعة.
            </p>

            <div style="margin-bottom:14px;">
              <input id="swalBagScanInput" type="text" placeholder="امسح باركود الكيس هنا باستخدام القارئ..." 
                     style="width:100%;box-sizing:border-box;padding:12px 14px;border:2px solid #3B82F6;border-radius:10px;font-size:15px;direction:ltr;text-align:center;font-family:monospace;outline:none;background:#EFF6FF;" />
              <div id="swalBagScanFeedback" style="font-size:13px;margin-top:6px;min-height:20px;font-weight:600;text-align:center;"></div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px;color:#334155;">
              <span>حالة الأكياس:</span>
              <span id="swalBagScanCounter" style="font-weight:700;color:#2563EB;">${getScannedCount()} من ${totalBags} ممسوحة</span>
            </div>

            <div id="swalBagsContainer" style="max-height:220px;overflow-y:auto;padding-right:4px;">
              ${renderBagsList()}
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تأكيد واكتمال الفحص ✅',
        cancelButtonText: 'إلغاء ❌',
        confirmButtonColor: '#10B981',
        cancelButtonColor: '#64748B',
        didOpen: () => {
          const input = document.getElementById('swalBagScanInput');
          const feedback = document.getElementById('swalBagScanFeedback');
          const container = document.getElementById('swalBagsContainer');
          const counter = document.getElementById('swalBagScanCounter');
          const confirmBtn = Swal.getConfirmButton();

          function updateConfirmState() {
            const count = getScannedCount();
            if (counter) counter.textContent = `${count} من ${totalBags} ممسوحة`;
            if (count === totalBags) {
              confirmBtn.disabled = false;
              confirmBtn.style.opacity = '1';
            } else {
              confirmBtn.disabled = true;
              confirmBtn.style.opacity = '0.5';
            }
          }

          updateConfirmState();

          if (input) {
            input.focus();
            // إعادة التركيز دائماً عند النقر في أي مكان بالنافذة
            const modalPopup = Swal.getPopup();
            if (modalPopup) {
              modalPopup.addEventListener('click', () => { input.focus(); });
            }

            async function processScannedCode(rawVal) {
              const code = String(rawVal || '').trim();
              input.value = '';
              if (!code) return;

              // مطابقة الكود
              const scanRes = await window.db.confirmBagScan(code);
              if (!scanRes.success) {
                feedback.style.color = '#EF4444';
                feedback.textContent = `❌ ${scanRes.error || 'كود غير صحيح'}`;
                input.focus();
                return;
              }

              const data = scanRes.data;
              if (data.invoiceId !== invoiceId) {
                feedback.style.color = '#DC2626';
                feedback.textContent = `⚠️ تحذير: هذا الكيس ينتمي لفاتورة أخرى (${data.invoiceNumber || 'أخرى'})!`;
                input.focus();
                return;
              }

              // تحديث الكيس في القائمة
              const idx = currentBags.findIndex(b => b.bag_number === data.bagNumber);
              if (idx !== -1) {
                currentBags[idx].scanned_at = new Date().toISOString();
              }

              container.innerHTML = renderBagsList();
              feedback.style.color = '#10B981';
              feedback.textContent = data.alreadyScanned 
                ? `ℹ️ الكيس رقم ${data.bagNumber} تم فحصه مسبقاً`
                : `✅ تم فحص كيس رقم ${data.bagNumber} بنجاح!`;

              updateConfirmState();
              input.focus();

              if (getScannedCount() === totalBags) {
                feedback.textContent = '🎉 تم فحص جميع الأكياس بنجاح!';
                setTimeout(() => {
                  Swal.clickConfirm();
                }, 500);
              }
            }

            input.addEventListener('keydown', async (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                await processScannedCode(input.value);
              }
            });
          }
        },
        preConfirm: () => {
          if (getScannedCount() < totalBags) {
            Swal.showValidationMessage(`يجب مسح جميع الأكياس (${totalBags} أكياس) لإتمام العملية!`);
            return false;
          }
          return true;
        }
      }).then((result) => {
        if (result.isConfirmed) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });

  } catch (err) {
    console.error('Error in verifyAllBagsScanned:', err);
    return false;
  }
}

// ─── Global Sidebar State & Toggle ───────────────────────────────────────────
window.toggleSidebar = function toggleSidebar() {
  const layout = document.querySelector('.app-layout, .hr-layout, .fin-layout');
  if (!layout) return;
  layout.classList.toggle('sidebar-collapsed');
  const isCollapsed = layout.classList.contains('sidebar-collapsed');
  localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
};

(function initGlobalSidebar() {
  function applySidebarState() {
    if (localStorage.getItem('sidebar_collapsed') === '1') {
      const layout = document.querySelector('.app-layout, .hr-layout, .fin-layout');
      if (layout) layout.classList.add('sidebar-collapsed');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySidebarState);
  } else {
    applySidebarState();
  }
})();

