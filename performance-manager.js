'use strict';

// ─── Performance Manager ──────────────────────────────────────────────────────
// يمنع تثقيل السيستم بمرور الوقت على الأجهزة الضعيفة
// يشتغل في Main Process بس

const GC_INTERVAL_MS    = 30 * 60 * 1000; // Garbage Collection كل 30 دقيقة
const MEM_CHECK_MS      = 5  * 60 * 1000; // فحص الذاكرة كل 5 دقائق
const HEAP_FORCE_GC_MB  = 380;            // إجبار GC لو الـ heap تجاوز 380MB
const WWEBJS_CACHE_DAYS = 7;              // حذف كاش واتساب الأقدم من 7 أيام

let _gcTimer    = null;
let _memTimer   = null;

// ─── تنظيف كاش WhatsApp القديم ────────────────────────────────────────────────
function cleanWhatsAppCache(projectRoot) {
  const path = require('path');
  const fs   = require('fs');
  try {
    const cacheDir = path.join(projectRoot, '.wwebjs_cache');
    if (!fs.existsSync(cacheDir)) return;

    const cutoff = Date.now() - WWEBJS_CACHE_DAYS * 24 * 60 * 60 * 1000;
    let cleaned  = 0;

    function rmOld(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
      catch (_) { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs < cutoff) {
            if (e.isDirectory()) fs.rmdirSync(full, { recursive: true });
            else { fs.unlinkSync(full); cleaned++; }
          } else if (e.isDirectory()) {
            rmOld(full);
          }
        } catch (_) { /* تجاهل أخطاء الملفات المقفولة */ }
      }
    }

    rmOld(cacheDir);
    if (cleaned > 0) console.log(`[Perf] تم تنظيف ${cleaned} ملف من كاش واتساب`);
  } catch (e) {
    console.warn('[Perf] تنظيف كاش واتساب فشل:', e.message);
  }
}

// ─── تشغيل GC مع قياس ما تحرر ───────────────────────────────────────────────
function runGC(reason) {
  if (typeof global.gc !== 'function') return;
  try {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const freed  = Math.round((before - process.memoryUsage().heapUsed) / 1024 / 1024);
    console.log(`[Perf] GC (${reason}) — تحرر: ${Math.max(0, freed)} MB`);
  } catch (e) {
    console.warn('[Perf] GC فشل:', e.message);
  }
}

// ─── بدء Performance Manager ─────────────────────────────────────────────────
function startPerformanceManager(projectRoot) {
  if (typeof global.gc === 'function') {
    // GC دوري كل 30 دقيقة
    _gcTimer = setInterval(() => runGC('دوري'), GC_INTERVAL_MS);
    console.log('[Perf] Performance Manager شغال ✅ — GC كل 30 دقيقة');
  } else {
    console.warn('[Perf] ⚠️  GC غير متاح — تأكد من --expose-gc في js-flags');
  }

  // مراقبة الذاكرة كل 5 دقائق
  _memTimer = setInterval(() => {
    const mem    = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB  = Math.round(mem.rss      / 1024 / 1024);
    console.log(`[Perf] Heap: ${heapMB} MB | RSS: ${rssMB} MB`);
    if (heapMB > HEAP_FORCE_GC_MB) runGC('إجباري — تجاوز الحد');
  }, MEM_CHECK_MS);

  // تنظيف كاش واتساب مرة واحدة بعد دقيقة من الفتح
  if (projectRoot) {
    setTimeout(() => cleanWhatsAppCache(projectRoot), 60 * 1000);
  }
}

// ─── إيقاف Performance Manager ───────────────────────────────────────────────
function stopPerformanceManager() {
  if (_gcTimer)  { clearInterval(_gcTimer);  _gcTimer  = null; }
  if (_memTimer) { clearInterval(_memTimer); _memTimer = null; }
  console.log('[Perf] Performance Manager أوقف');
}

module.exports = { startPerformanceManager, stopPerformanceManager };
