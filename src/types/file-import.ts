/**
 * file-import.ts - الأنواع التعاقدية لاستيراد الملفات
 * تعريف الواجهات والأنواع المستخدمة في مسار فتح/إدراج الملفات
 */

/** وضع استيراد الملف */
export type FileImportMode = "replace" | "insert";

/** أنواع الملفات المدعومة */
export type ImportedFileType =
  | "doc"
  | "docx"
  | "txt"
  | "pdf"
  | "fountain"
  | "fdx";

/** طريقة الاستخراج المستخدمة */
export type ExtractionMethod =
  | "native-text"
  | "mammoth"
  | "antiword"
  | "word-com"
  | "ocr-mistral";

/** نتيجة استخراج نص من ملف */
export interface FileExtractionResult {
  /** النص المستخرج */
  text: string;
  /** نوع الملف الأصلي */
  fileType: ImportedFileType;
  /** الطريقة المستخدمة للاستخراج */
  method: ExtractionMethod;
  /** هل تم استخدام OCR */
  usedOcr: boolean;
  /** تحذيرات غير حرجة */
  warnings: string[];
  /** سجل المحاولات */
  attempts: string[];
}

/** طلب استخراج ملف للـ API */
export interface FileExtractionRequest {
  /** اسم الملف الأصلي */
  filename: string;
  /** امتداد الملف */
  extension: ImportedFileType;
}

/** استجابة API الاستخراج */
export interface FileExtractionResponse {
  success: boolean;
  data?: FileExtractionResult;
  error?: string;
}

/** امتدادات الملفات المقبولة */
export const ACCEPTED_FILE_EXTENSIONS =
  ".doc,.docx,.txt,.pdf,.fountain,.fdx" as const;

/** Map من الامتدادات إلى أنواع الملفات */
export function getFileType(filename: string): ImportedFileType | null {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "doc":
      return "doc";
    case "docx":
      return "docx";
    case "txt":
      return "txt";
    case "pdf":
      return "pdf";
    case "fountain":
      return "fountain";
    case "fdx":
      return "fdx";
    default:
      return null;
  }
}
