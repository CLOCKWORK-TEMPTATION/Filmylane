/**
 * mistral-ocr.ts - دمج Mistral OCR 3
 * استخراج النصوص من الملفات الممسوحة (PDF images) باستخدام Mistral OCR API
 */

const MISTRAL_OCR_MODEL =
  process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest";
const MISTRAL_API_BASE = "https://api.mistral.ai/v1";
const OCR_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

interface MistralOcrPage {
  index: number;
  markdown: string;
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
}

/**
 * التحقق من توفر مفتاح Mistral API
 */
export function isMistralConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

/**
 * رفع ملف إلى Mistral لغرض OCR
 */
async function uploadFileToMistral(
  fileBuffer: Buffer,
  filename: string
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY غير مُعرَّف. يرجى إضافته في متغيرات البيئة."
    );
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: "application/octet-stream" });
  formData.append("file", blob, filename);
  formData.append("purpose", "ocr");

  const response = await fetchWithTimeout(`${MISTRAL_API_BASE}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    throw new Error(
      `فشل رفع الملف إلى Mistral: ${response.status} - ${errorBody}`
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * تشغيل OCR على ملف مرفوع
 */
async function runOcr(fileId: string): Promise<MistralOcrResponse> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY غير مُعرَّف.");
  }

  const body = JSON.stringify({
    model: MISTRAL_OCR_MODEL,
    document: {
      type: "file_id",
      file_id: fileId,
    },
  });

  const response = await fetchWithTimeout(`${MISTRAL_API_BASE}/ocr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    throw new Error(`فشل OCR من Mistral: ${response.status} - ${errorBody}`);
  }

  return (await response.json()) as MistralOcrResponse;
}

/**
 * fetch مع timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = OCR_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * استخراج نص من ملف باستخدام Mistral OCR مع retry بسيط
 * @param fileBuffer - محتوى الملف كـ Buffer
 * @param filename - اسم الملف الأصلي
 * @returns النص المستخرج من جميع الصفحات
 */
export async function extractTextWithMistralOcr(
  fileBuffer: Buffer,
  filename: string
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fileId = await uploadFileToMistral(fileBuffer, filename);
      const ocrResult = await runOcr(fileId);

      // دمج النصوص من جميع الصفحات
      const fullText = ocrResult.pages
        .sort((a, b) => a.index - b.index)
        .map((page) => page.markdown)
        .join("\n\n");

      return fullText;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // إذا كان الخطأ abort (timeout) أو أخيرة محاولة، لا نعيد
      if (
        lastError.name === "AbortError" ||
        attempt === MAX_RETRIES
      ) {
        break;
      }

      // انتظار قبل إعادة المحاولة
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (attempt + 1))
      );
    }
  }

  throw lastError ?? new Error("فشل OCR لسبب غير معروف");
}
