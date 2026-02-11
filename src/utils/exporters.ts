/**
 * @description
 * مصدّر السيناريو - Screenplay Exporter
 * أدوات لتصدير السيناريو بصيغ مختلفة
 *
 * @responsibilities
 * - تصدير إلى صيغة Fountain (نص عادي)
 * - تصدير إلى PDF مع دعم العربية RTL
 * - تنزيل الملفات للمستخدم
 * - الحفاظ على التنسيقات أثناء التصدير
 *
 * @dependencies
 * - لا يعتمد على وحدات أخرى
 *
 * @stateManagement
 * - Stateless: دوال نقية بدون حالة
 *
 * @example
 * ```typescript
 * import { exportToFountain, downloadFile } from '@/utils/exporters';
 *
 * const fountain = exportToFountain(htmlContent);
 * downloadFile(fountain, 'script.fountain');
 * ```
 */
export const exportToFountain = (htmlContent: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  let fountain = "";

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const className = element.className;
      const text = element.textContent?.trim() || "";

      if (className.includes("scene-heading")) {
        fountain += `${text.toUpperCase()}\n\n`;
      } else if (className.includes("character")) {
        fountain += `${text.toUpperCase()}\n`;
      } else if (className.includes("dialogue")) {
        fountain += `${text}\n\n`;
      } else if (className.includes("action")) {
        fountain += `${text}\n\n`;
      } else if (className.includes("transition")) {
        fountain += `${text.toUpperCase()}\n\n`;
      }
    }
  });

  return fountain;
};

/**
 * @description
 * تنزيل الملف - Download File
 * ينشئ وينزل ملف للمستخدم
 *
 * @param content - محتوى الملف
 * @param filename - اسم الملف
 * @param mimeType - نوع MIME (افتراضي: text/plain)
 *
 * @returns void
 *
 * @example
 * ```typescript
 * downloadFile('Hello World', 'hello.txt', 'text/plain');
 * ```
 *
 * @complexity O(1)
 * @sideEffects
 * - ينشئ عناصر DOM مؤقتة
 * - يفتح نافذة تنزيل الملف
 */
export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string = "text/plain"
) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * @description
 * تصدير إلى PDF - Export to PDF
 * يصدّر السيناريو إلى PDF مع دعم كامل للعربية وRTL
 *
 * @param content - المحتوى HTML من المحرر
 * @param filename - اسم الملف (افتراضي: screenplay)
 *
 * @returns Promise<void>
 *
 * @throws {Error} عند فشل فتح نافذة الطباعة
 *
 * @example
 * ```typescript
 * await exportToPDF(editorContent, 'my-script');
 * ```
 *
 * @complexity O(1)
 * @sideEffects
 * - يفتح نافذة طباعة جديدة
 * - يعدل DOM النافذة الجديدة
 */
export const exportToPDF = async (
  content: string,
  filename: string = "screenplay"
) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    @page { margin: 1in; size: A4; }
    * { box-sizing: border-box; }
    body { 
      font-family: "Traditional Arabic", "Arial", sans-serif; 
      font-size: 14pt; 
      line-height: 1.6;
      direction: rtl;
      text-align: right;
      padding: 20px;
    }
    div { margin-bottom: 12pt; }
    .format-scene-header-1 { font-weight: bold; margin: 24pt 0 12pt; text-transform: uppercase; }
    .format-character { text-align: center; margin: 12pt 0 0; font-weight: bold; }
    .format-dialogue { margin: 0 10% 12pt 20%; text-align: justify; }
    .format-parenthetical { margin: 0 15% 6pt 25%; font-style: italic; }
    .format-action { margin: 12pt 0; text-align: justify; }
    .format-transition { text-align: left; margin: 12pt 0; }
  </style>
</head>
<body>${content}</body>
</html>`;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();

  // Wait for content to load then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  // Fallback if onload doesn't fire
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 1000);
};

/**
 * تصدير إلى DOCX - Export to DOCX
 * يصدّر السيناريو إلى ملف Word باستخدام تنسيق HTML-in-Word
 */
export const exportToDocx = (
  content: string,
  filename: string = "screenplay.docx"
) => {
  const htmlContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { size: A4; margin: 1in; }
    body {
      font-family: "Traditional Arabic", "Arial", sans-serif;
      font-size: 14pt;
      line-height: 1.6;
      direction: rtl;
      text-align: right;
    }
    .format-basmala { text-align: center; font-weight: bold; margin: 12pt 0; }
    .format-scene-header-1 { font-weight: bold; margin: 24pt 0 12pt; }
    .format-scene-header-2 { margin: 6pt 0; }
    .format-scene-header-3 { text-align: center; margin: 6pt 0; }
    .format-scene-header-top-line { display: flex; justify-content: space-between; margin: 12pt 0; }
    .format-character { text-align: center; margin: 12pt 0 0; font-weight: bold; }
    .format-dialogue { margin: 0 10% 12pt 20%; text-align: justify; }
    .format-parenthetical { margin: 0 15% 6pt 25%; font-style: italic; }
    .format-action { margin: 12pt 0; text-align: justify; }
    .format-transition { text-align: left; margin: 12pt 0; }
  </style>
</head>
<body>${content}</body>
</html>`;

  const blob = new Blob(["\ufeff" + htmlContent], {
    type: "application/msword",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Legacy PDF export - kept for compatibility
 * @deprecated Use exportToPDF(content, filename) instead
 */
export const exportToPDFLegacy = async (
  element: HTMLElement,
  filename: string
) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const styles = `
    <style>
      @page { margin: 1in; }
      body { font-family: 'Courier New', monospace; font-size: 12pt; line-height: 14pt; }
      .scene-heading { text-transform: uppercase; font-weight: bold; margin: 2em 0 1em; }
      .character { text-transform: uppercase; margin: 1em 0 0 2in; }
      .dialogue { margin: 0 1.5in 1em 1in; }
      .action { margin: 1em 0; }
      .transition { text-transform: uppercase; text-align: right; margin: 1em 0; }
    </style>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        ${styles}
      </head>
      <body>${element.innerHTML}</body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};
