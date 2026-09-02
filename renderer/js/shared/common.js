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
      const shopName = setRes.data?.company_name || 'EL-Tarzy';

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
