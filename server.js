'use strict';

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getDb,
  setBagCount,
  confirmBagScan,
  getInvoiceBags,
  getUnprintedBags,
  markBagsPrinted,
  markInvoiceBagsPrinted
} = require('./database/db');

let server = null;
const DEFAULT_PORT = 3141;

const logPath = path.join(os.homedir(), 'Desktop', 'eltarzy-error.txt');
function logServer(msg) {
  console.log(`[API Server] ${msg}`);
  try {
    fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] [API Server] ${msg}`);
  } catch (_) {}
}

function getNetworkIps() {
  const ips = [];
  try {
    const interfaces = os.networkInterfaces();
    const virtualKeywords = [
      'virtual', 'vbox', 'vmware', 'hyper-v', 'vethernet',
      'hamachi', 'radmin', 'tailscale', 'zerotier', 'tap',
      'tun', 'loopback', 'bluetooth', 'pseudo', 'wsl', 'docker'
    ];

    for (const [name, ifaceList] of Object.entries(interfaces)) {
      const lowerName = name.toLowerCase();
      const isVirtual = virtualKeywords.some(kw => lowerName.includes(kw));
      if (isVirtual) continue;

      for (const iface of ifaceList) {
        const isIpv4 = iface.family === 'IPv4' || iface.family === 4;
        if (isIpv4 && !iface.internal && iface.address && !iface.address.startsWith('127.')) {
          ips.push({
            name,
            address: iface.address,
            isPreferred: lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('ethernet') || lowerName.includes('lan')
          });
        }
      }
    }
  } catch (_) {}
  return ips;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*'
  });
  res.end(html);
}

function renderServerDashboardHtml(port, shopName = 'نظام دراي كلين') {
  const ips = getNetworkIps();
  const primaryIp = (ips.find(i => i.isPreferred) || ips[0] || { address: '127.0.0.1' }).address;

  const ipBadges = ips.length > 0 
    ? ips.map(i => `<span style="background:#0284c7;color:#fff;padding:4px 10px;border-radius:6px;font-family:monospace;font-size:14px;direction:ltr;display:inline-block;margin:3px;">${i.address} (${i.name})</span>`).join(' ')
    : '<span style="color:#64748b;">127.0.0.1 (محلي فقط)</span>';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>خادم نظام دراي كلين — متصل 🟢</title>
  <style>
    :root {
      --primary: #2563eb;
      --success: #10b981;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 30px 15px;
      direction: rtl;
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
    }
    .card {
      background: var(--card-bg);
      border-radius: 16px;
      padding: 30px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
      border: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .status-dot {
      width: 18px;
      height: 18px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.25);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    h1 { font-size: 22px; font-weight: 800; color: #1e293b; }
    .subtitle { font-size: 13.5px; color: var(--text-muted); margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .info-box {
      background: #f1f5f9;
      border-radius: 12px;
      padding: 16px;
      border: 1px solid #cbd5e1;
    }
    .info-label { font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; }
    .info-val { font-size: 16px; font-weight: 800; color: #0f172a; font-family: monospace; direction: ltr; text-align: left; }
    .ip-box {
      background: #eff6ff;
      border: 1.5px solid #bfdbfe;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 24px;
    }
    .ip-box h3 { font-size: 15px; font-weight: 800; color: #1d4ed8; margin-bottom: 8px; }
    .btn-group { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13.5px;
      font-weight: 700;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-outline { background: #fff; border: 1px solid #cbd5e1; color: #334155; }
    .btn-outline:hover { background: #f8fafc; border-color: #94a3b8; }
    .tips {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 12px;
      padding: 18px;
      color: #92400e;
      font-size: 13.5px;
    }
    .tips h4 { font-weight: 800; margin-bottom: 8px; font-size: 14px; }
    .tips ol { padding-right: 20px; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="status-dot"></div>
        <div>
          <h1>خادم الربط الشبكي لنظام دراي كلين (جهاز 1)</h1>
          <div class="subtitle">السيرفر يعمل بكفاءة وجاهز لاستقبال اتصالات محطة الأكياس (جهاز 2)</div>
        </div>
      </div>

      <div class="grid">
        <div class="info-box">
          <div class="info-label">حالة السيرفر</div>
          <div class="info-val" style="color:#10b981;">ONLINE 🟢</div>
        </div>
        <div class="info-box">
          <div class="info-label">المنفذ المحلي (Port)</div>
          <div class="info-val">${port}</div>
        </div>
        <div class="info-box">
          <div class="info-label">الاسم التجاري</div>
          <div class="info-val" style="font-family:inherit;direction:rtl;text-align:right;">${shopName}</div>
        </div>
      </div>

      <div class="ip-box">
        <h3>📡 عناوين IP المتاحة للربط مع الجهاز الثاني:</h3>
        <p style="font-size:13px;color:#334155;margin-bottom:10px;">
          أدخل هذا العنوان في إعدادات تطبيق محطة الأكياس على الجهاز الثاني:
        </p>
        <div>${ipBadges}</div>
        <div style="margin-top:14px;background:#fff;padding:10px 14px;border-radius:8px;border:1px solid #bfdbfe;font-family:monospace;direction:ltr;font-size:15px;font-weight:700;">
          عنوان السيرفر الكامل: <span style="color:#2563eb;">http://${primaryIp}:${port}</span>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 15px; font-weight: 800; margin-bottom: 10px;">🧪 فحص المسارات المتاحة (API Test):</h3>
        <div class="btn-group">
          <a class="btn btn-outline" href="/api/ping" target="_blank">🔍 فحص الاتصال (/api/ping)</a>
          <a class="btn btn-outline" href="/api/company-info" target="_blank">🏪 بيانات المحل (/api/company-info)</a>
          <a class="btn btn-outline" href="/api/invoices" target="_blank">📋 الفواتير (/api/invoices)</a>
          <a class="btn btn-outline" href="/api/status-summary" target="_blank">📊 إحصائيات الحالات (/api/status-summary)</a>
        </div>
      </div>

      <div class="tips">
        <h4>💡 إرشادات هامة في حال لم يتصل الجهاز الثاني (Device 2):</h4>
        <ol>
          <li>تأكد من أن جهاز 1 وجهاز 2 متصلان <strong>بنفس شبكة الواي فاي أو نفس الراوتر</strong>.</li>
          <li>في إعدادات برنامج الجهاز الثاني: اكتب الـ IP <code>${primaryIp}</code> وفي خانة المنفذ اكتب <code>${port}</code>.</li>
          <li>إذا كان جدار حماية ويندوز (Windows Firewall) يحظر المنفذ، قم بتشغيل ملف <strong>فتح_منفذ_الربط_في_جدار_الحماية.bat</strong> كمسؤول (Run as administrator) على جهاز 1.</li>
        </ol>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Safeguard against huge payloads
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function startApiServer(app, port = DEFAULT_PORT) {
  if (server) {
    logServer(`Server already running on port ${port}`);
    return server;
  }

  logServer(`Initializing API server on port ${port}...`);

  let db = null;
  function ensureDb() {
    if (!db) {
      try {
        db = getDb(app);
      } catch (e) {
        logServer(`Database connection error: ${e.message}`);
      }
    }
    return db;
  }
  ensureDb();

  server = http.createServer(async (req, res) => {
    // CORS pre-flight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = (parsedUrl.pathname || '/').toLowerCase();
    const query = parsedUrl.query;
    const acceptHeader = (req.headers['accept'] || '').toLowerCase();
    const isHtmlRequest = acceptHeader.includes('text/html') || !acceptHeader.includes('application/json');

    try {
      // ─── Root & Status (Friendly Dashboard for Browsers / Ping for API) ───
      if ((pathname === '/' || pathname === '/status' || pathname === '/api') && req.method === 'GET') {
        if (isHtmlRequest) {
          let companyName = 'نظام دراي كلين';
          try {
            const currentDb = ensureDb();
            if (currentDb) {
              const shop = currentDb.prepare('SELECT company_name FROM company_settings WHERE id = 1').get();
              if (shop && shop.company_name) companyName = shop.company_name;
            }
          } catch (_) {}
          return sendHtml(res, 200, renderServerDashboardHtml(port, companyName));
        }

        const ips = getNetworkIps();
        return sendJson(res, 200, {
          status: 'ok',
          message: 'خادم نظام دراي كلين يعمل بنجاح',
          server: 'Dry Clean API Server',
          port: port,
          ips: ips.map(i => i.address),
          timestamp: new Date().toISOString()
        });
      }

      // ─── Health / Ping ──────────────────────────────────────────────────
      if ((pathname === '/api/ping' || pathname === '/ping') && req.method === 'GET') {
        const ips = getNetworkIps();
        return sendJson(res, 200, {
          status: 'ok',
          server: 'Dry Clean API Server',
          port: port,
          ips: ips.map(i => i.address),
          timestamp: new Date().toISOString()
        });
      }

      // Ensure database is available for all data endpoints
      const currentDb = ensureDb();
      if (!currentDb) {
        return sendJson(res, 503, { success: false, error: 'قاعدة البيانات غير متاحة حالياً، يرجى المحاولة بعد قليل' });
      }

      // ─── Shop / Company Info (for bag tags & branding — NO financial data) ───
      if ((pathname === '/api/company-info' || pathname === '/api/shop-info') && req.method === 'GET') {
        const shop = currentDb.prepare('SELECT company_name, phone, address, tax_number, logo_path FROM company_settings WHERE id = 1').get() || {};
        return sendJson(res, 200, {
          success: true,
          data: {
            company_name: shop.company_name || 'Dry Clean',
            phone: shop.phone || '',
            address: shop.address || '',
            tax_number: shop.tax_number || '',
            logo_path: shop.logo_path || null
          }
        });
      }

      // ─── Status Summary (Count only, NO prices) ───────────────────────────
      if (pathname === '/api/status-summary' && req.method === 'GET') {
        const row = currentDb.prepare(`
          SELECT
            SUM(CASE WHEN status = 'تحت الشغل' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'في انتظار الاستلام' THEN 1 ELSE 0 END) as awaiting,
            SUM(CASE WHEN status = 'خرج للتوصيل' THEN 1 ELSE 0 END) as out_for_delivery,
            SUM(CASE WHEN status = 'تم التسليم' THEN 1 ELSE 0 END) as delivered,
            COUNT(*) as total
          FROM invoices
          WHERE is_returned = 0
        `).get();

        return sendJson(res, 200, {
          success: true,
          data: {
            inProgress: row?.in_progress || 0,
            awaiting: row?.awaiting || 0,
            outForDelivery: row?.out_for_delivery || 0,
            delivered: row?.delivered || 0,
            total: row?.total || 0
          }
        });
      }

      // ─── Invoices List (Strictly NO pricing data) ──────────────────────────
      if (pathname === '/api/invoices' && req.method === 'GET') {
        let sql = `
          SELECT 
            i.id,
            i.invoice_number,
            i.invoice_date,
            i.status,
            i.is_delivery,
            i.is_express,
            i.pieces_count,
            i.garment_type,
            i.has_iron_mark,
            i.bag_count,
            c.name as customer_name,
            c.phone as customer_phone,
            (SELECT COUNT(*) FROM invoice_bags WHERE invoice_id = i.id AND scanned_at IS NOT NULL) as bags_scanned_count
          FROM invoices i
          LEFT JOIN customers c ON i.customer_id = c.id
          WHERE i.is_returned = 0
        `;
        const params = [];

        if (query.status) {
          sql += ` AND i.status = ?`;
          params.push(query.status);
        }

        if (query.from && query.to) {
          sql += ` AND i.invoice_date BETWEEN ? AND ?`;
          params.push(query.from, query.to);
        } else if (query.from) {
          sql += ` AND i.invoice_date >= ?`;
          params.push(query.from);
        } else if (query.to) {
          sql += ` AND i.invoice_date <= ?`;
          params.push(query.to);
        }

        if (query.search) {
          const s = `%${query.search.trim()}%`;
          sql += ` AND (i.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
          params.push(s, s, s);
        }

        sql += ` ORDER BY i.id DESC LIMIT 100`;

        const rows = currentDb.prepare(sql).all(...params);
        return sendJson(res, 200, { success: true, data: rows });
      }

      // ─── Single Invoice Details (Strictly NO pricing data) ─────────────────
      const invoiceDetailMatch = pathname.match(/^\/api\/invoices\/(\d+)$/);
      if (invoiceDetailMatch && req.method === 'GET') {
        const invoiceId = parseInt(invoiceDetailMatch[1], 10);
        const inv = currentDb.prepare(`
          SELECT 
            i.id,
            i.invoice_number,
            i.invoice_date,
            i.status,
            i.is_delivery,
            i.is_express,
            i.pieces_count,
            i.garment_type,
            i.has_iron_mark,
            i.bag_count,
            i.notes,
            c.name as customer_name,
            c.phone as customer_phone
          FROM invoices i
          LEFT JOIN customers c ON i.customer_id = c.id
          WHERE i.id = ?
        `).get(invoiceId);

        if (!inv) {
          return sendJson(res, 404, { success: false, error: 'الفاتورة غير موجودة' });
        }

        // Items without sell_price / cost_price / discount / total
        const items = currentDb.prepare(`
          SELECT id, category_name, service_name, quantity
          FROM invoice_items
          WHERE invoice_id = ?
        `).all(invoiceId);

        const bags = getInvoiceBags(invoiceId).data || [];

        return sendJson(res, 200, {
          success: true,
          data: {
            ...inv,
            items,
            bags
          }
        });
      }

      // ─── Set Ready & Bags (تحت الشغل -> في انتظار الاستلام ONLY) ───────────
      const setReadyMatch = pathname.match(/^\/api\/invoices\/(\d+)\/set-ready$/);
      if (setReadyMatch && req.method === 'POST') {
        const invoiceId = parseInt(setReadyMatch[1], 10);
        const body = await parseBody(req);
        const bagCount = parseInt(body.bagCount, 10);

        if (!bagCount || bagCount < 1) {
          return sendJson(res, 400, { success: false, error: 'عدد الأكياس يجب أن يكون 1 على الأقل' });
        }

        const inv = currentDb.prepare('SELECT id, status, invoice_number FROM invoices WHERE id = ?').get(invoiceId);
        if (!inv) {
          return sendJson(res, 404, { success: false, error: 'الفاتورة غير موجودة' });
        }

        // Device 2 is ONLY allowed to perform status transition from "تحت الشغل" to "في انتظار الاستلام"
        if (inv.status !== 'تحت الشغل' && inv.status !== 'في انتظار الاستلام') {
          return sendJson(res, 403, {
            success: false,
            error: 'لا يمكن تغيير حالة هذه الفاتورة — مسموح فقط بتحويل الفواتير من "تحت الشغل" إلى "في انتظار الاستلام"'
          });
        }

        // Update status to 'في انتظار الاستلام'
        currentDb.prepare("UPDATE invoices SET status = 'في انتظار الاستلام' WHERE id = ?").run(invoiceId);

        // Generate bag records
        const bagRes = setBagCount(invoiceId, bagCount);
        if (!bagRes.success) {
          return sendJson(res, 500, bagRes);
        }

        // إذا طُلب وضع علامة الطباعة فوراً (مثلاً عند الإنشاء والطباعة من الجهاز الثاني مباشرة)
        if (body.markPrinted) {
          markInvoiceBagsPrinted(invoiceId);
          if (bagRes.data && Array.isArray(bagRes.data.bags)) {
            bagRes.data.bags.forEach(b => { b.is_printed = 1; });
          }
        }

        return sendJson(res, 200, {
          success: true,
          message: 'تم تجهيز الأكياس وتحويل الفاتورة إلى "في انتظار الاستلام" بنجاح',
          data: bagRes.data
        });
      }

      // ─── Get Bags for Invoice ─────────────────────────────────────────────
      const getBagsMatch = pathname.match(/^\/api\/invoices\/(\d+)\/bags$/);
      if (getBagsMatch && req.method === 'GET') {
        const invoiceId = parseInt(getBagsMatch[1], 10);
        const resBags = getInvoiceBags(invoiceId);
        return sendJson(res, resBags.success ? 200 : 400, resBags);
      }

      // ─── Unprinted Bags (Polling endpoint for Device 2) ───────────────────
      if (pathname === '/api/unprinted-bags' && req.method === 'GET') {
        const unprinted = getUnprintedBags();
        return sendJson(res, 200, unprinted);
      }

      // ─── Mark Bags Printed (Called by Device 2 after printing) ────────────
      if (pathname === '/api/mark-bags-printed' && req.method === 'POST') {
        const body = await parseBody(req);
        const bagIds = Array.isArray(body.bagIds) ? body.bagIds : [];
        let totalMarked = 0;

        if (body.invoiceId) {
          const invRes = markInvoiceBagsPrinted(parseInt(body.invoiceId, 10));
          totalMarked += invRes.count || 0;
        }

        if (bagIds.length > 0) {
          const markRes = markBagsPrinted(bagIds);
          totalMarked += markRes.count || 0;
        }

        return sendJson(res, 200, { success: true, count: totalMarked });
      }

      // ─── Confirm Bag Scan ─────────────────────────────────────────────────
      if (pathname === '/api/bag-scan' && req.method === 'POST') {
        const body = await parseBody(req);
        const qrCode = (body.qrCode || '').trim();
        if (!qrCode) {
          return sendJson(res, 400, { success: false, error: 'رمز الباركود / QR مطلوب' });
        }
        const scanRes = confirmBagScan(qrCode);
        return sendJson(res, scanRes.success ? 200 : 400, scanRes);
      }

      // 404 Route Not Found
      return sendJson(res, 404, { success: false, error: 'المسار غير موجود' });

    } catch (err) {
      logServer(`[Request Error] ${err.message}`);
      return sendJson(res, 500, { success: false, error: err.message });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logServer(`❌ Port ${port} is already in use by another application!`);
    } else {
      logServer(`❌ Failed to start server: ${err.message} (${err.code})`);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const ips = getNetworkIps();
    logServer(`✅ API server running on port ${port}`);
    logServer(`   👉 Local: http://127.0.0.1:${port}`);
    ips.forEach(i => {
      logServer(`   👉 Network (${i.name}): http://${i.address}:${port}`);
    });
  });

  return server;
}

function stopApiServer() {
  if (server) {
    server.close();
    server = null;
    console.log('[LAN API Server] Stopped');
  }
}

module.exports = {
  startApiServer,
  stopApiServer,
  getNetworkIps,
  DEFAULT_PORT
};
