/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * اختبارات وحدة لاستخراج الملفات
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractFileText } from "./file-extraction";

// Mock mammoth
vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(),
  },
  extractRawText: vi.fn(),
}));

// Mock pdf-parse
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock mistral-ocr
vi.mock("./mistral-ocr", () => ({
  isMistralConfigured: vi.fn(() => false),
  extractTextWithMistralOcr: vi.fn(),
}));

// Mock child_process, fs, os, path for doc extraction
vi.mock("child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("not available in test");
  }),
}));

describe("extractFileText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("txt extraction", () => {
    it("should extract UTF-8 text from buffer", async () => {
      const text = "مرحباً بالعالم\nسطر ثاني";
      const buffer = Buffer.from(text, "utf-8");

      const result = await extractFileText(buffer, "test.txt", "txt");

      expect(result.text).toBe(text);
      expect(result.fileType).toBe("txt");
      expect(result.method).toBe("native-text");
      expect(result.usedOcr).toBe(false);
    });

    it("should normalize CRLF to LF", async () => {
      const text = "سطر أول\r\nسطر ثاني\r\nسطر ثالث";
      const buffer = Buffer.from(text, "utf-8");

      const result = await extractFileText(buffer, "test.txt", "txt");

      expect(result.text).toBe("سطر أول\nسطر ثاني\nسطر ثالث");
    });
  });

  describe("fountain extraction", () => {
    it("should extract fountain file as plain text", async () => {
      const text = "INT. مكتب - صباحاً\n\nأحمد يدخل المكتب.";
      const buffer = Buffer.from(text, "utf-8");

      const result = await extractFileText(buffer, "screenplay.fountain", "fountain");

      expect(result.text).toBe(text);
      expect(result.fileType).toBe("fountain");
      expect(result.method).toBe("native-text");
    });
  });

  describe("docx extraction", () => {
    it("should extract text via mammoth", async () => {
      const mammoth = await import("mammoth");
      const extractFn = mammoth.extractRawText ?? (mammoth as any).default?.extractRawText;
      (extractFn as any).mockResolvedValueOnce({
        value: "نص مستخرج من docx",
      });

      const buffer = Buffer.from("fake-docx-content");
      const result = await extractFileText(buffer, "test.docx", "docx");

      expect(result.text).toBe("نص مستخرج من docx");
      expect(result.fileType).toBe("docx");
      expect(result.method).toBe("mammoth");
      expect(result.usedOcr).toBe(false);
    });
  });

  describe("pdf extraction", () => {
    it("should use local parser when text is sufficient", async () => {
      const pdfParse = (await import("pdf-parse")).default as any;
      pdfParse.mockResolvedValueOnce({
        text: "هذا نص PDF طويل بما يكفي ليعتبر نصاً قوياً للاستخراج المحلي",
      });

      const buffer = Buffer.from("fake-pdf");
      const result = await extractFileText(buffer, "test.pdf", "pdf");

      expect(result.method).toBe("native-text");
      expect(result.usedOcr).toBe(false);
    });

    it("should fallback to OCR when text is weak and Mistral configured", async () => {
      const pdfParse = (await import("pdf-parse")).default as any;
      pdfParse.mockResolvedValueOnce({ text: "" });

      const { isMistralConfigured, extractTextWithMistralOcr } = await import(
        "./mistral-ocr"
      );
      (isMistralConfigured as any).mockReturnValue(true);
      (extractTextWithMistralOcr as any).mockResolvedValueOnce(
        "نص مستخرج عبر OCR"
      );

      const buffer = Buffer.from("fake-pdf");
      const result = await extractFileText(buffer, "scan.pdf", "pdf");

      expect(result.method).toBe("ocr-mistral");
      expect(result.usedOcr).toBe(true);
      expect(result.text).toBe("نص مستخرج عبر OCR");
    });

    it("should report warnings when OCR is not configured", async () => {
      const pdfParse = (await import("pdf-parse")).default as any;
      pdfParse.mockResolvedValueOnce({ text: "" });

      const { isMistralConfigured } = await import("./mistral-ocr");
      (isMistralConfigured as any).mockReturnValue(false);

      const buffer = Buffer.from("fake-pdf");

      await expect(
        extractFileText(buffer, "scan.pdf", "pdf")
      ).rejects.toThrow("فشل استخراج نص من PDF");
    });
  });

  describe("doc extraction fallback chain", () => {
    it("should throw detailed error when all fallbacks fail", async () => {
      const buffer = Buffer.from("fake-doc");

      await expect(
        extractFileText(buffer, "test.doc", "doc")
      ).rejects.toThrow(/فشل استخراج نص من ملف .doc/);
    });
  });
});
