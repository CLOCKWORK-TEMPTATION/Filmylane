/**
 * file-extraction.ts - منطق استخراج النصوص من الملفات (Server-side)
 * يدعم: txt, fountain, fdx, docx, pdf, doc مع سلسلة fallback متعددة
 */

import type {
  FileExtractionResult,
  ImportedFileType,
  ExtractionMethod,
} from "@/types/file-import";
import {
  extractTextWithMistralOcr,
  isMistralConfigured,
} from "./mistral-ocr";

// ==================== Text/Fountain/FDX ====================

/**
 * استخراج نص من ملفات نصية بسيطة مع fallback للترميز
 */
function extractTextFromBuffer(buffer: Buffer): string {
  // محاولة UTF-8 أولاً
  const utf8Text = buffer.toString("utf-8");

  // فحص إذا كان الملف يحتوي على أحرف BOM أو أحرف replacement
  const hasReplacementChars =
    utf8Text.includes("\uFFFD") || utf8Text.includes("�");

  if (!hasReplacementChars) {
    return normalizeNewlines(utf8Text);
  }

  // محاولة windows-1256 (الأكثر شيوعاً للعربية)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require("iconv-lite");
    const win1256Text = iconv.decode(buffer, "windows-1256") as string;
    if (win1256Text && !win1256Text.includes("\uFFFD")) {
      return normalizeNewlines(win1256Text);
    }
  } catch {
    // iconv-lite غير متاح، نتابع
  }

  // fallback إلى latin1
  const latin1Text = buffer.toString("latin1");
  return normalizeNewlines(latin1Text);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * توحيد النص المستخرج قبل تمريره إلى مسار التصنيف/اللصق:
 * - تحويل كل أنواع فواصل الأسطر إلى \n
 * - إزالة NUL/BOM والرموز غير المرئية التي تكسر التقسيم سطرًا بسطر
 */
function normalizeExtractedText(text: string): string {
  return normalizeNewlines(text)
    .split("\u0000")
    .join("")
    .split("\u000B")
    .join("\n") // vertical tab
    .replace(/\f/g, "\n")
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/^\uFEFF/, "");
}

// ==================== DOCX ====================

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import("mammoth")) as any;
  const extractRawText =
    mammoth.extractRawText || mammoth.default?.extractRawText;
  const result = await extractRawText({ buffer });
  return result.value as string;
}

// ==================== PDF (Hybrid OCR) ====================

/**
 * محاولة استخراج نص محلي من PDF أولاً
 * إذا كان النص فارغاً/ضعيفاً → OCR عبر Mistral
 */
async function extractTextFromPdf(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; method: ExtractionMethod; usedOcr: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const MIN_TEXT_DENSITY = 20; // حد أدنى للأحرف لاعتبار النص "قوي"

  // محاولة 1: استخراج نص محلي
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import("pdf-parse") as any;
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    const pdfData = await pdfParse(buffer);
    const localText = (pdfData.text || "").trim();

    if (localText.length >= MIN_TEXT_DENSITY) {
      return {
        text: localText,
        method: "native-text",
        usedOcr: false,
        warnings,
      };
    }

    warnings.push(
      `النص المحلي ضعيف (${localText.length} حرف)، سيتم استخدام OCR`
    );
  } catch (localError) {
    warnings.push(
      `فشل parser المحلي: ${localError instanceof Error ? localError.message : "خطأ غير معروف"}`
    );
  }

  // محاولة 2: OCR عبر Mistral
  if (isMistralConfigured()) {
    try {
      const ocrText = await extractTextWithMistralOcr(buffer, filename);
      return {
        text: ocrText,
        method: "ocr-mistral",
        usedOcr: true,
        warnings,
      };
    } catch (ocrError) {
      warnings.push(
        `فشل Mistral OCR: ${ocrError instanceof Error ? ocrError.message : "خطأ غير معروف"}`
      );
    }
  } else {
    warnings.push(
      "MISTRAL_API_KEY غير معرّف. لم يتم تشغيل OCR. أضف المفتاح لاستخراج النص من ملفات PDF الممسوحة."
    );
  }

  // فشل كل المسارات
  throw new Error(
    `فشل استخراج نص من PDF.\nالتحذيرات:\n${warnings.join("\n")}`
  );
}

// ==================== DOC (Fallback Ladder) ====================

/**
 * استخراج نص من ملف .doc مع سلسلة fallback كاملة:
 * 1. antiword عبر WSL (/usr/bin/antiword)
 * 2. antiword من المسار المخصص
 * 3. Word COM automation (نص مباشر)
 * 4. Word COM → PDF → OCR
 * 5. OCR مباشر
 */
async function extractTextFromDoc(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; method: ExtractionMethod; usedOcr: boolean; warnings: string[]; attempts: string[] }> {
  const warnings: string[] = [];
  const attempts: string[] = [];

  // كتابة الملف مؤقتاً
  const { writeFileSync, unlinkSync, existsSync, mkdtempSync, rmSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const { execSync } = await import("child_process");

  const tempDir = mkdtempSync(join(tmpdir(), "doc-extract-"));
  const tempFilePath = join(tempDir, filename);
  writeFileSync(tempFilePath, buffer);

  const cleanup = () => {
    try {
      if (existsSync(tempFilePath)) unlinkSync(tempFilePath);
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // تنظيف ليس حرجاً
    }
  };

  try {
    // === محاولة 1: antiword عبر WSL (مسار النظام) ===
    try {
      attempts.push("antiword (WSL /usr/bin/antiword)");
      const wslPath = tempFilePath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/mnt/$1".toLowerCase());
      const result = execSync(
        `wsl /usr/bin/antiword "${wslPath}"`,
        { encoding: "utf-8", timeout: 30_000 }
      );
      if (result.trim().length > 0) {
        return { text: result, method: "antiword", usedOcr: false, warnings, attempts };
      }
      warnings.push("antiword (WSL) أعاد نصاً فارغاً");
    } catch (e) {
      warnings.push(
        `antiword (WSL): ${e instanceof Error ? e.message : "فشل"}`
      );
    }

    // === محاولة 2: antiword من المسار المخصص ===
    try {
      const customAntiword = "D:\\aanalyze script\\antiword-build\\antiword";
      attempts.push(`antiword (مسار مخصص: ${customAntiword})`);
      const wslPath = tempFilePath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/mnt/$1".toLowerCase());
      const customWslPath = customAntiword.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/mnt/$1".toLowerCase());
      const result = execSync(
        `wsl "${customWslPath}" "${wslPath}"`,
        { encoding: "utf-8", timeout: 30_000 }
      );
      if (result.trim().length > 0) {
        return { text: result, method: "antiword", usedOcr: false, warnings, attempts };
      }
      warnings.push("antiword (مسار مخصص) أعاد نصاً فارغاً");
    } catch (e) {
      warnings.push(
        `antiword (مسار مخصص): ${e instanceof Error ? e.message : "فشل"}`
      );
    }

    // === محاولة 3: Word COM automation (نص مباشر) ===
    try {
      attempts.push("Word COM automation (نص مباشر)");
      const pyScript = `
import sys, os
try:
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    doc = word.Documents.Open(r"${tempFilePath.replace(/\\/g, "\\\\")}")
    text = doc.Content.Text
    doc.Close(False)
    word.Quit()
    print(text)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;
      const pyTempPath = join(tempDir, "extract_doc.py");
      writeFileSync(pyTempPath, pyScript, "utf-8");
      const result = execSync(`python "${pyTempPath}"`, {
        encoding: "utf-8",
        timeout: 60_000,
      });
      if (result.trim().length > 0) {
        return { text: result, method: "word-com", usedOcr: false, warnings, attempts };
      }
      warnings.push("Word COM (نص) أعاد نصاً فارغاً");
    } catch (e) {
      warnings.push(
        `Word COM (نص): ${e instanceof Error ? e.message : "فشل"}`
      );
    }

    // === محاولة 4: Word COM → PDF → OCR ===
    if (isMistralConfigured()) {
      try {
        attempts.push("Word COM → PDF → OCR");
        const pdfTempPath = join(tempDir, "converted.pdf");
        const pyScript = `
import sys
try:
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    doc = word.Documents.Open(r"${tempFilePath.replace(/\\/g, "\\\\")}")
    doc.SaveAs2(r"${pdfTempPath.replace(/\\/g, "\\\\")}", FileFormat=17)
    doc.Close(False)
    word.Quit()
    print("OK")
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;
        const pyTempPath = join(tempDir, "convert_to_pdf.py");
        writeFileSync(pyTempPath, pyScript, "utf-8");
        execSync(`python "${pyTempPath}"`, { encoding: "utf-8", timeout: 60_000 });

        if (existsSync(pdfTempPath)) {
          const { readFileSync } = await import("fs");
          const pdfBuffer = readFileSync(pdfTempPath);
          const ocrText = await extractTextWithMistralOcr(pdfBuffer, "converted.pdf");
          return { text: ocrText, method: "ocr-mistral", usedOcr: true, warnings, attempts };
        }
        warnings.push("Word COM → PDF: لم يتم إنشاء ملف PDF");
      } catch (e) {
        warnings.push(
          `Word COM → PDF → OCR: ${e instanceof Error ? e.message : "فشل"}`
        );
      }
    }

    // === محاولة 5: OCR مباشر على الملف ===
    if (isMistralConfigured()) {
      try {
        attempts.push("OCR مباشر (best-effort)");
        const ocrText = await extractTextWithMistralOcr(buffer, filename);
        if (ocrText.trim().length > 0) {
          return { text: ocrText, method: "ocr-mistral", usedOcr: true, warnings, attempts };
        }
        warnings.push("OCR مباشر أعاد نصاً فارغاً");
      } catch (e) {
        warnings.push(
          `OCR مباشر: ${e instanceof Error ? e.message : "فشل"}`
        );
      }
    }

    // فشل الكل
    throw new Error(
      `فشل استخراج نص من ملف .doc بعد ${attempts.length} محاولة.\n` +
        `المحاولات:\n${attempts.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}\n` +
        `التحذيرات:\n${warnings.map((w) => `  - ${w}`).join("\n")}`
    );
  } finally {
    cleanup();
  }
}

// ==================== Main Extraction Function ====================

/**
 * الدالة الرئيسية لاستخراج النص من أي نوع ملف مدعوم
 */
export async function extractFileText(
  buffer: Buffer,
  filename: string,
  fileType: ImportedFileType
): Promise<FileExtractionResult> {
  switch (fileType) {
    case "txt":
    case "fountain":
    case "fdx": {
      const text = normalizeExtractedText(extractTextFromBuffer(buffer));
      return {
        text,
        fileType,
        method: "native-text",
        usedOcr: false,
        warnings: [],
        attempts: ["native-text"],
      };
    }

    case "docx": {
      const text = normalizeExtractedText(await extractTextFromDocx(buffer));
      return {
        text,
        fileType,
        method: "mammoth",
        usedOcr: false,
        warnings: [],
        attempts: ["mammoth"],
      };
    }

    case "pdf": {
      const pdfResult = await extractTextFromPdf(buffer, filename);
      return {
        text: normalizeExtractedText(pdfResult.text),
        fileType,
        method: pdfResult.method,
        usedOcr: pdfResult.usedOcr,
        warnings: pdfResult.warnings,
        attempts: pdfResult.usedOcr
          ? ["local-parser", "ocr-mistral"]
          : ["local-parser"],
      };
    }

    case "doc": {
      const docResult = await extractTextFromDoc(buffer, filename);
      return {
        text: normalizeExtractedText(docResult.text),
        fileType,
        method: docResult.method,
        usedOcr: docResult.usedOcr,
        warnings: docResult.warnings,
        attempts: docResult.attempts,
      };
    }

    default:
      throw new Error(`نوع الملف غير مدعوم: ${fileType}`);
  }
}
