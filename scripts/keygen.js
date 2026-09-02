'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
//  EL-TARZY — مولّد مفاتيح التفعيل (Keygen)
// ───────────────────────────────────────────────────────────────────────────────
//  الاستخدام:
//    تفعيل دائم:  node scripts/keygen.js <hwId> <installId>
//    تفعيل مؤقت: node scripts/keygen.js <hwId> <installId> <days>
//
//  مثال:
//    node scripts/keygen.js A1B2-C3D4-E5F6-G7H8 1234-5678-9ABC-DEF0 30
// ═══════════════════════════════════════════════════════════════════════════════

const { generateSerial, generateTimedSerial } = require('../activation');

const [,, hwId, installId, daysArg] = process.argv;

if (!hwId || !installId) {
  console.error('');
  console.error('  الاستخدام:');
  console.error('    تفعيل دائم:  node scripts/keygen.js <hwId> <installId>');
  console.error('    تفعيل مؤقت: node scripts/keygen.js <hwId> <installId> <days>');
  console.error('');
  process.exit(1);
}

const days = daysArg ? parseInt(daysArg, 10) : 0;

if (daysArg !== undefined && (isNaN(days) || days <= 0)) {
  console.error('  خطأ: عدد الأيام لازم يكون رقم موجب (مثال: 7 أو 30 أو 365)');
  process.exit(1);
}

console.log('');
console.log('══════════════════════════════════════════════════');
console.log('   EL-TARZY — مولّد مفاتيح التفعيل');
console.log('══════════════════════════════════════════════════');
console.log(`   كود الجهاز    : ${hwId}`);
console.log(`   كود التثبيت   : ${installId}`);

if (days === 0) {
  const serial = generateSerial(hwId, installId);
  console.log('   نوع التفعيل   : دائم');
  console.log(`   مفتاح التفعيل : ${serial}`);
  console.log('   عدد الأجزاء   : 4 أجزاء (XXXXX-XXXXX-XXXXX-XXXXX)');
} else {
  const serial = generateTimedSerial(hwId, installId, days);
  console.log(`   نوع التفعيل   : مؤقت (${days} يوم)`);
  console.log(`   مفتاح التفعيل : ${serial}`);
  console.log('   عدد الأجزاء   : 5 أجزاء (XXXXX-XXXXX-XXXXX-XXXXX-NNNNN)');
}

console.log('══════════════════════════════════════════════════');
console.log('');
