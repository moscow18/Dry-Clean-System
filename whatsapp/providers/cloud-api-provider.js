'use strict';

/**
 * ============================================================
 * cloud-api-provider.js — مزوّد Meta WhatsApp Cloud API
 * ============================================================
 * يُطبّق عقد BaseWhatsAppProvider باستخدام Meta Cloud API الرسمي.
 *
 * مفهوم "جاهز" هنا: الإعدادات صحيحة ومتحقَّق منها (لا يوجد
 * "اتصال حي" مثل web.js — كل رسالة هي HTTP request مستقل).
 *
 * يستخدم https المدمج في Node — لا حاجة لـ axios أو node-fetch.
 */

const BaseWhatsAppProvider = require('./base-provider');
const https = require('https');

/**
 * ترجمة أكواد أخطاء Meta إلى رسائل عربية واضحة
 */
function translateMetaError(errorObj) {
  // errorObj قد يكون string أو object من Meta API
  const code  = errorObj?.code  || errorObj?.error_code || null;
  const msg   = errorObj?.message || String(errorObj);

  const translations = {
    132001: 'اسم القالب أو كود اللغة غير مطابق لما هو مسجّل على حساب واتساب. تحقق من إعدادات "ربط القوالب" وتأكد أن الاسم واللغة (مثلاً ar_EG) مطابقان تماماً لما هو مسجّل على Meta.',
    132000: 'عدد المتغيرات المرسلة لا يطابق القالب المسجّل على Meta. تحقق من عدد الحقول {{1}} {{2}} ... في القالب.',
    132015: 'رقم الهاتف المرسَل إليه محظور أو غير صالح على منصة Meta.',
    132016: 'الرسالة إلى هذا المستلم محظورة حالياً من قِبَل Meta.',
    130472: 'رقم الهاتف المستلِم غير مسجّل على واتساب.',
    130429: 'تم تجاوز الحد المسموح به من الرسائل — حاول مرة أخرى لاحقاً.',
    131026: 'رقم الهاتف غير صالح أو بصيغة غير معتمدة.',
    131047: 'القالب لم يُراجَع بعد أو تم رفضه من Meta. تحقق من حالة القالب في Meta Business Suite.',
    131030: 'رقم الـ Phone Number ID الذي أدخلته غير مربوط بهذا الـ Access Token.',
    190:    'التوكن (Access Token) غير صالح أو منتهي الصلاحية. أعِد توليد Access Token جديد من Meta Business Suite وأدخله في الإعدادات.',
    200:    'صلاحيات الـ Access Token غير كافية. تأكد من منح صلاحيات whatsapp_business_messaging.',
    4:     'تم تجاوز حد الاستدعاءات (Rate Limit). انتظر بضع دقائق وأعِد المحاولة.',
    10:    'صلاحيات الـ Access Token غير كافية لهذه العملية.',
    100:   'معامِل خاطئ أو مفقود في الطلب المرسَل إلى Meta.',
  };

  if (code && translations[code]) {
    return `[كود ${code}] ${translations[code]}`;
  }

  // محاولة استخراج كود من النص نفسه (مثلاً "(#132001) Template...")
  if (msg) {
    const match = msg.match(/#(\d+)/);
    if (match) {
      const extractedCode = parseInt(match[1]);
      if (translations[extractedCode]) {
        return `[كود ${extractedCode}] ${translations[extractedCode]}`;
      }
    }
  }

  return msg; // إذا لم نجد ترجمة، نرجع الرسالة الأصلية
}

class CloudAPIProvider extends BaseWhatsAppProvider {
  constructor() {
    super();
    this.config = null;
    this.isConfigured = false; // true بعد اختبار ناجح للإعدادات
    this._templateMap = {};    // { logical_key: { actual_template_name, language_code } }
  }

  // ──────────────────────────────────────────────
  // تهيئة المزوّد
  // ──────────────────────────────────────────────
  async initialize(config) {
    if (!config.phoneNumberId || !config.accessToken) {
      throw new Error('Meta Cloud API يتطلب Phone Number ID و Access Token');
    }

    this.config = {
      phoneNumberId:     config.phoneNumberId,
      accessToken:       config.accessToken,
      businessAccountId: config.businessAccountId || null,
      apiVersion:        config.apiVersion || 'v20.0',
    };

    this._templateMap = config.templateMap || {};

    // التحقق من صحة الإعدادات عند التهيئة (بدون إرسال رسالة)
    try {
      await this._verifyCredentials();
      this.isConfigured = true;
      console.log('[CloudAPI] ✅ الإعدادات صحيحة وجاهزة');
    } catch (err) {
      this.isConfigured = false;
      // نرمي الخطأ للـ manager ليتعامل معه (Rollback)
      throw new Error(`فشل التحقق من إعدادات Meta Cloud API: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────
  // حالة المزوّد
  // ──────────────────────────────────────────────
  async getStatus() {
    if (!this.config) {
      return {
        ready: false,
        statusType: 'unconfigured',
        label: '⚙️ يحتاج إعداد Token و Phone Number ID من الإعدادات',
        needsQR: false,
        qrImage: null,
        provider: 'cloud_api',
      };
    }

    if (this.isConfigured) {
      return {
        ready: true,
        statusType: 'configured',
        label: '✅ إعدادات Meta Cloud API صحيحة ونشطة',
        needsQR: false,
        qrImage: null,
        provider: 'cloud_api',
      };
    }

    return {
      ready: false,
      statusType: 'unconfigured',
      label: '⚠️ الإعدادات موجودة لكن التحقق فشل — راجع الـ Token',
      needsQR: false,
      qrImage: null,
      provider: 'cloud_api',
    };
  }

  // ──────────────────────────────────────────────
  // إرسال رسالة عبر Cloud API
  // ──────────────────────────────────────────────
  async sendMessage({ type, phone, payload, settings }) {
    if (!this.isConfigured || !this.config) {
      return { success: false, error: 'Meta Cloud API غير مُهيَّأ — راجع الإعدادات' };
    }
    if (!phone || phone.trim() === '') {
      return { success: false, error: 'رقم الهاتف غير موجود' };
    }

    if (type === 'free_text') {
      // Cloud API لا يدعم رسائل النص الحر بدون قالب مُسجَّل مسبقاً
      return { success: false, error: 'Meta Cloud API لا يدعم الرسائل النصية الحرة — استخدم قالباً مُسجَّلاً' };
    }

    try {
      const formattedPhone = this.formatEgyptianPhone(phone);
      const templateInfo = this._resolveTemplate(type);

      if (!templateInfo) {
        return {
          success: false,
          error: `لم يتم ربط نوع الرسالة "${type}" بقالب Meta — راجع إعدادات القوالب`,
        };
      }

      const bodyParams = this._buildTemplateParams(type, payload, settings);
      const body = this._buildRequestBody(formattedPhone, templateInfo, bodyParams);

      await this._sendRequest(body);
      console.log(`[CloudAPI] ✅ إرسال (${type}) لـ ${phone} بقالب "${templateInfo.actual_template_name}"`);
      return { success: true };

    } catch (err) {
      console.error(`[CloudAPI] ❌ فشل الإرسال لـ ${phone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // تدمير المزوّد (Cloud API لا يحتاج cleanup معقّد)
  // ──────────────────────────────────────────────
  async destroy() {
    this.isConfigured = false;
    this.config = null;
    this._templateMap = {};
    console.log('[CloudAPI] تم إيقاف مزوّد Cloud API');
  }

  // ──────────────────────────────────────────────
  // اختبار الاتصال — GET request فقط (بدون إرسال رسالة)
  // ──────────────────────────────────────────────
  async testConnection(testConfig) {
    const cfg = testConfig || this.config;
    if (!cfg || !cfg.phoneNumberId || !cfg.accessToken) {
      return { success: false, error: 'يرجى إدخال Phone Number ID و Access Token' };
    }
    try {
      const info = await this._verifyCredentials(cfg);
      return {
        success: true,
        data: {
          displayPhoneNumber: info.display_phone_number || '',
          verifiedName:       info.verified_name || '',
          qualityRating:      info.quality_rating || '',
        },
        message: `✅ الاتصال نجح — الرقم: ${info.display_phone_number || 'غير معروف'}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────
  // تحديث خريطة القوالب
  // ──────────────────────────────────────────────
  updateTemplateMap(templateMap) {
    this._templateMap = templateMap || {};
  }

  // ──────────────────────────────────────────────
  // جلب قائمة القوالب من حساب WABA مباشرة
  // GET /{waba-id}/message_templates
  // ──────────────────────────────────────────────
  async fetchAccountTemplates(cfg) {
    const c = cfg || this.config;
    if (!c || !c.businessAccountId || !c.accessToken) {
      throw new Error('يلزم توفّر Business Account ID و Access Token لجلب القوالب');
    }

    const apiPath = `/${c.apiVersion || 'v20.0'}/${c.businessAccountId}/message_templates` +
      `?access_token=${c.accessToken}&fields=name,language,status,components&limit=100`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path:     apiPath,
        method:   'GET',
        headers:  { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(translateMetaError(parsed.error)));
            } else {
              resolve(parsed.data || []);
            }
          } catch (e) {
            reject(new Error('استجابة غير صالحة من Meta API'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`خطأ في الشبكة: ${err.message}`));
      });

      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error('انتهت مهلة الاتصال بـ Meta API (12 ثانية)'));
      });

      req.end();
    });
  }

  // ──────────────────────────────────────────────
  // مساعدات داخلية
  // ──────────────────────────────────────────────

  /**
   * التحقق من صحة الإعدادات عبر GET request — بدون إرسال رسالة
   * يستعلم عن معلومات رقم الهاتف المُسجَّل على Meta
   */
  async _verifyCredentials(cfg) {
    const c = cfg || this.config;
    const apiPath = `/${c.apiVersion || 'v20.0'}/${c.phoneNumberId}?access_token=${c.accessToken}&fields=display_phone_number,verified_name,quality_rating`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: apiPath,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'خطأ من Meta API'));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error('استجابة غير صالحة من Meta API'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`خطأ في الشبكة: ${err.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('انتهت مهلة الاتصال بـ Meta API (10 ثوانٍ)'));
      });

      req.end();
    });
  }

  /**
   * إرسال طلب POST لـ Cloud API
   */
  async _sendRequest(body) {
    const jsonBody = JSON.stringify(body);
    const apiPath = `/${this.config.apiVersion}/` +
                    `${this.config.phoneNumberId}/messages`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'graph.facebook.com',
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(jsonBody),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              // ترجمة رسالة الخطأ إلى العربية
              reject(new Error(translateMetaError(parsed.error)));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error('استجابة غير صالحة من Meta API'));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`خطأ في الشبكة: ${err.message}`));
      });

      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('انتهت مهلة إرسال الرسالة (15 ثانية)'));
      });

      req.write(jsonBody);
      req.end();
    });
  }

  /**
   * حل اسم القالب الفعلي من المفتاح المنطقي
   */
  _resolveTemplate(logicalKey) {
    return this._templateMap[logicalKey] || null;
  }

  /**
   * بناء body الـ POST request لإرسال Template
   */
  _buildRequestBody(phone, templateInfo, bodyParams) {
    const body = {
      messaging_product: 'whatsapp',
      to:                phone,
      type:              'template',
      template: {
        name:     templateInfo.actual_template_name,
        language: { code: templateInfo.language_code || 'ar' },
      },
    };

    // إضافة معامِلات القالب إن وُجدت
    if (bodyParams && bodyParams.length > 0) {
      body.template.components = [{
        type:       'body',
        parameters: bodyParams // _buildTemplateParams الآن يرجع مصفوفة الـ objects جاهزة
      }];
    }

    console.log('---[Meta API Debug]---');
    console.log('Template actual name:', templateInfo.actual_template_name);
    console.log('Raw bodyParams array length:', bodyParams ? bodyParams.length : 0);
    console.log('Raw bodyParams:', bodyParams);
    if (body.template.components) {
       console.log('Constructed parameters length:', body.template.components[0].parameters.length);
       console.log('Constructed parameters:', body.template.components[0].parameters);
    }
    console.log('Full Payload:', JSON.stringify(body, null, 2));
    console.log('----------------------');

    return body;
  }

  /**
   * بناء قائمة معامِلات القالب حسب نوع الرسالة (Named Variables)
   */
  _buildTemplateParams(type, payload, settings) {
    const s = settings || {};
    
    const DEFAULT_VALUES = {
      customer_name: 'عميلنا العزيز',
      shop_name: 'المحل',
      invoice_number: '—',
      total: '0',
      paid: '0',
      remaining: '0',
      tailor_name: '—',
      phone: '—', // رقم المحل للتواصل (وليس رقم العميل المُرسل إليه)
      payment_method: 'غير محدد',
      paid_now: '0',
    };

    const paymentMethodLabel = (method) =>
      method === 'فودافون كاش' ? 'تحويل' : 'نقدي';

    // استخراج القيم الخام من الـ payload
    const rawValues = {
      customer_name:  this.formatCustomerName(payload.customerName),
      shop_name:      s.company_name || payload.shopName,
      invoice_number: payload.invoiceNumber,
      total:          payload.total,
      paid:           payload.paid,
      remaining:      payload.remaining,
      tailor_name:    payload.tailorName,
      phone:          s.wa_phone1 || s.phone || payload.contactPhone,
      payment_method: payload.paymentMethod ? paymentMethodLabel(payload.paymentMethod) : null,
      paid_now:       payload.paidNow || payload.paid,
    };

    // القوالب وترتيبها وأسماء المتغيرات (يطابق بالضبط ما هو مسجّل على Meta)
    const templates = {
      invoice_confirm: [
        'customer_name', 'shop_name', 'invoice_number', 'total', 'paid', 'remaining', 'tailor_name', 'phone'
      ],
      order_ready: [
        'customer_name', 'invoice_number', 'shop_name', 'phone'
      ],
      order_delivered: [
        'customer_name', 'invoice_number', 'shop_name'
      ],
      full_payment: [
        'customer_name', 'invoice_number', 'paid', 'payment_method', 'shop_name'
      ],
      partial_payment: [
        'customer_name', 'invoice_number', 'paid_now', 'payment_method', 'remaining', 'shop_name'
      ]
    };

    const expectedKeys = templates[type] || [];
    
    return expectedKeys.map(paramName => {
      let val = rawValues[paramName];
      
      if (val === undefined || val === null || val === '') {
        // حقول لا تقبل قيماً افتراضية ويجب أن تفشل العملية إذا غابت
        if (paramName === 'invoice_number') {
          throw new Error(`حقل جوهري مفقود أو فارغ: رقم الفاتورة (${paramName})`);
        }
        
        // استخدام القيمة الافتراضية للحقول الأخرى
        val = DEFAULT_VALUES[paramName] ?? '—';
        console.warn(`[WhatsApp] القيمة الافتراضية استُخدمت للمتغير "${paramName}" لأن القيمة الأصلية كانت فارغة`);
      }
      
      return {
        type: 'text',
        parameter_name: paramName,
        text: String(val)
      };
    });
  }
}

module.exports = CloudAPIProvider;
