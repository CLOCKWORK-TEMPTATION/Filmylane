# Security Policy / سياسة الأمان

## English

### Reporting Security Vulnerabilities

If you discover a security vulnerability in this project, please report it by emailing the repository maintainers. Please do not create public GitHub issues for security vulnerabilities.

### Environment Variables and Secrets

This project uses environment variables for sensitive configuration. Please follow these guidelines:

#### Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your actual API keys and secrets in the `.env` file
3. **NEVER** commit the `.env` file to version control

#### Required Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Optional | Claude AI features for screenplay classification |
| `GOOGLE_GENAI_API_KEY` | Optional | Genkit AI features (scene generation, formatting) |
| `ANTHROPIC_FAST_MODE` | Optional | Performance mode (set to "1" for fast mode) |

#### Security Best Practices

1. **Keep secrets secure**
   - Never hardcode API keys in source code
   - Use environment variables for all sensitive data
   - Rotate API keys regularly

2. **Git Safety**
   - The `.gitignore` file is configured to exclude `.env*` files
   - Double-check before committing that no secrets are in your code
   - Use `git status` before every commit

3. **API Key Management**
   - Use different API keys for development and production
   - Limit API key permissions to only what's needed
   - Monitor API usage for unexpected activity

4. **Dependencies**
   - Keep dependencies up to date
   - Review dependency security advisories
   - Use `npm audit` or `pnpm audit` regularly

### What's Protected

✅ The following are properly secured in this project:
- API keys are loaded from environment variables only
- `.env` files are excluded from version control
- No hardcoded secrets in the codebase
- Sensitive configuration is documented in `.env.example`

### Development Guidelines

When adding new features that require secrets:
1. Add the variable name and description to `.env.example`
2. Document it in this SECURITY.md file
3. Use `process.env.VARIABLE_NAME` to access the value
4. Add proper error handling if the variable is required

---

## العربية

### الإبلاغ عن الثغرات الأمنية

إذا اكتشفت ثغرة أمنية في هذا المشروع، يرجى الإبلاغ عنها عبر البريد الإلكتروني لمشرفي المستودع. من فضلك لا تنشئ مشكلات عامة على GitHub للثغرات الأمنية.

### المتغيرات البيئية والأسرار

يستخدم هذا المشروع متغيرات بيئية للإعدادات الحساسة. يرجى اتباع هذه الإرشادات:

#### الإعداد
1. انسخ `.env.example` إلى `.env`:
   ```bash
   cp .env.example .env
   ```
2. املأ مفاتيح API والأسرار الفعلية في ملف `.env`
3. **لا تقم أبداً** بإرسال ملف `.env` إلى نظام التحكم في الإصدار

#### المتغيرات البيئية المطلوبة

| المتغير | مطلوب | الغرض |
|---------|-------|-------|
| `ANTHROPIC_API_KEY` | اختياري | ميزات Claude AI لتصنيف السيناريو |
| `GOOGLE_GENAI_API_KEY` | اختياري | ميزات Genkit AI (توليد المشاهد، التنسيق) |
| `ANTHROPIC_FAST_MODE` | اختياري | وضع الأداء (اضبط على "1" للوضع السريع) |

#### أفضل الممارسات الأمنية

1. **حافظ على الأسرار آمنة**
   - لا تكتب مفاتيح API مباشرة في الكود المصدري
   - استخدم المتغيرات البيئية لجميع البيانات الحساسة
   - قم بتدوير مفاتيح API بانتظام

2. **أمان Git**
   - ملف `.gitignore` مُعد لاستبعاد ملفات `.env*`
   - تحقق مرتين قبل الإرسال من عدم وجود أسرار في الكود
   - استخدم `git status` قبل كل commit

3. **إدارة مفاتيح API**
   - استخدم مفاتيح API مختلفة للتطوير والإنتاج
   - قصر أذونات مفتاح API على ما هو مطلوب فقط
   - راقب استخدام API للنشاط غير المتوقع

4. **التبعيات**
   - حافظ على تحديث التبعيات
   - راجع التنبيهات الأمنية للتبعيات
   - استخدم `npm audit` أو `pnpm audit` بانتظام

### ما هو محمي

✅ الآتي محمي بشكل صحيح في هذا المشروع:
- يتم تحميل مفاتيح API من متغيرات البيئة فقط
- ملفات `.env` مستبعدة من نظام التحكم في الإصدار
- لا توجد أسرار مكتوبة مباشرة في الكود
- الإعدادات الحساسة موثقة في `.env.example`

### إرشادات التطوير

عند إضافة ميزات جديدة تتطلب أسراراً:
1. أضف اسم المتغير ووصفه إلى `.env.example`
2. وثّقه في ملف SECURITY.md
3. استخدم `process.env.VARIABLE_NAME` للوصول إلى القيمة
4. أضف معالجة صحيحة للأخطاء إذا كان المتغير مطلوباً
