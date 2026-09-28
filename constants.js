'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  ثوابت النظام — constants.js
//  تُستخدم في backend و frontend (عبر preload)
// ═══════════════════════════════════════════════════════════════════════════════

const ROLES = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
};

const SHIFT_STATUS = {
  OPEN: 'مفتوح',
  CLOSED: 'مغلق',
};

const INVOICE_STATUS = {
  IN_PROGRESS: 'تحت الشغل',
  READY: 'جاهز للاستلام',
  AWAITING: 'في انتظار الاستلام',
  DELIVERED: 'تم التسليم',
  RETURNED: 'مرتجع',
  OUT_FOR_DELIVERY: 'خرج للتوصيل',
};

const TREASURY_TYPES = {
  CASH: 'الخزينة',
  VODAFONE: 'فودافون كاش',
  INSTAPAY: 'إنستا باي',
};

const ENTRY_TYPES = {
  INCOME: 'إيراد',
  EXPENSE: 'مصروف',
};

const PAYMENT_METHODS = {
  CASH: 'نقدي',
  VODAFONE: 'فودافون كاش',
  INSTAPAY: 'إنستا باي',
  DEFERRED: 'آجل',
};

// نقشة treasury_type → payment_method
function treasuryTypeToPaymentMethod(treasuryType, isDeferred) {
  if (isDeferred) return PAYMENT_METHODS.DEFERRED;
  switch (treasuryType) {
    case TREASURY_TYPES.VODAFONE: return PAYMENT_METHODS.VODAFONE;
    case TREASURY_TYPES.INSTAPAY: return PAYMENT_METHODS.INSTAPAY;
    default: return PAYMENT_METHODS.CASH; // 'الخزينة' → 'نقدي'
  }
}

const EMPLOYEE_TYPES = {
  REGULAR: 'موظف عادي',
  MANAGER: 'مدير',
  DELIVERY_DRIVER: 'مندوب توصيل',
};

const SALARY_TYPES = {
  FIXED: 'ثابت',
  COMMISSION: 'عمولة',
  MIXED: 'مختلط',
};

module.exports = {
  ROLES,
  SHIFT_STATUS,
  INVOICE_STATUS,
  TREASURY_TYPES,
  ENTRY_TYPES,
  PAYMENT_METHODS,
  EMPLOYEE_TYPES,
  SALARY_TYPES,
  treasuryTypeToPaymentMethod,
};
