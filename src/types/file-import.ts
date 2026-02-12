export type FileImportMode = "replace" | "insert";

export type ImportedFileType = "doc" | "docx" | "txt" | "pdf" | "fountain" | "fdx";

export type ExtractionMethod = 
  | "native-text" 
  | "mammoth"
  | "pdf-parse"
  | "antiword" 
  | "word-com" 
  | "ocr-mistral"
  | "unknown";

export interface FileExtractionResult {
  text: string;
  fileType: ImportedFileType;
  method: ExtractionMethod;
  usedOcr: boolean;
  warnings: string[];
  attempts: string[]; // Log of attempts made (e.g., "antiword failed: ...", "ocr success")
  success: boolean;
  error?: string;
}
