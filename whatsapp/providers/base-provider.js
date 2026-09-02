'use strict';

/**
 * ============================================================
 * base-provider.js — العقد المشترك لجميع مزوّدي الواتساب
 * ============================================================
 * كل مزوّد (cloud-api-provider أو web-js-provider) لازم يرث
 * هذه الكلاس ويُطبّق جميع الدوال المطلوبة.
 *
 * الدوال المطلوبة:
 *   initialize(config)   — تهيئة المزوّد بإعداداته
 *   getStatus()          — إرجاع حالة المزوّد
 *   sendMessage({type, phone, payload, settings}) — إرسال رسالة
 *   destroy()            — إيقاف المزوّد وتحرير الموارد
 */

class BaseWhatsAppProvider {
  /**
   * تهيئة المزوّد بإعداداته الخاصة
   * @param {Object} config — الإعدادات المطلوبة للمزوّد
   */
  async initialize(config) {
    throw new Error('[BaseProvider] initialize() غير مُطبَّق في هذا المزوّد');
  }

  /**
   * إرجاع حالة المزوّد الحالية
   * @returns {{ ready: boolean, statusType: string, label: string, needsQR?: boolean, qrImage?: string|null }}
   *
   * statusType القيم الممكنة:
   *   'connected'    — Web.js متصل بجلسة واتساب نشطة
   *   'configured'   — Cloud API إعداداته صحيحة ونشطة
   *   'unconfigured' — Cloud API يحتاج إعداد
   *   'disconnected' — Web.js منفصل
   *   'loading'      — Web.js يحمّل
   *   'qr_pending'   — Web.js ينتظر مسح QR
   */
  async getStatus() {
    throw new Error('[BaseProvider] getStatus() غير مُطبَّق في هذا المزوّد');
  }

  /**
   * إرسال رسالة واتساب
   * @param {Object} params
   * @param {string} params.type    — نوع الرسالة المنطقي:
   *                                  'invoice_confirm' | 'order_ready' | 'order_delivered' |
   *                                  'full_payment' | 'partial_payment' | 'free_text'
   * @param {string} params.phone   — رقم الهاتف (سيُنظَّف داخلياً)
   * @param {Object} params.payload — البيانات المطلوبة للرسالة
   * @param {Object} params.settings — إعدادات المحل (اسم المحل، العنوان، إلخ)
   * @returns {{ success: boolean, error?: string }}
   */
  async sendMessage({ type, phone, payload, settings }) {
    throw new Error('[BaseProvider] sendMessage() غير مُطبَّق في هذا المزوّد');
  }

  /**
   * إيقاف المزوّد وتحرير جميع الموارد (اتصالات، processes، إلخ)
   * يجب استدعاؤه قبل التبديل لمزوّد آخر أو عند إغلاق التطبيق
   */
  async destroy() {
    throw new Error('[BaseProvider] destroy() غير مُطبَّق في هذا المزوّد');
  }

  /**
   * مساعد مشترك: تنسيق رقم الهاتف المصري
   * @param {string} phone
   * @returns {string} رقم منسّق بصيغة دولية (20xxxxxxxxxx)
   */
  formatEgyptianPhone(phone) {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('20')) return clean;
    if (clean.startsWith('01')) return '2' + clean;
    if (clean.startsWith('1') && clean.length === 10) return '20' + clean;
    return '20' + clean;
  }

  /**
   * مساعد مشترك: تنسيق اسم العميل بصيغة مؤدبة
   * @param {string} name
   * @returns {string}
   */
  formatCustomerName(name) {
    if (!name || name === 'عميل نقدي') return 'عميلنا العزيز';
    if (name.startsWith('أ/') || name.startsWith('م/')) return name;
    return 'أ/ ' + name;
  }
}

module.exports = BaseWhatsAppProvider;
