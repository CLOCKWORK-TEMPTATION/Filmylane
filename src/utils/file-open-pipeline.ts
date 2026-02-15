import type { FileExtractionResult, FileImportMode } from "@/types/file-import";

type SuccessVariant = "default";
type ErrorVariant = "destructive";

type FileOpenToast = {
  title: string;
  description: string;
  variant?: SuccessVariant | ErrorVariant;
};

type FileOpenPipelineTelemetry = {
  openPipeline: "paste-classifier";
  method: FileExtractionResult["method"];
  source: "structured-blocks" | "extracted-text";
  usedOcr: boolean;
  qualityScore?: number;
  warnings: string[];
  preprocessedSteps: string[];
};

type ImportClassifiedAction = {
  kind: "import-classified-text";
  mode: FileImportMode;
  text: string;
  toast: FileOpenToast;
  telemetry: FileOpenPipelineTelemetry;
};

type RejectAction = {
  kind: "reject";
  mode: FileImportMode;
  toast: FileOpenToast & { variant: ErrorVariant };
  telemetry: FileOpenPipelineTelemetry;
};

export type FileOpenPipelineAction =
  | ImportClassifiedAction
  | RejectAction;

const buildModeLabel = (mode: FileImportMode): string =>
  mode === "replace" ? "تم فتح" : "تم إدراج";

const buildTelemetry = (
  extraction: FileExtractionResult,
  source: FileOpenPipelineTelemetry["source"]
): FileOpenPipelineTelemetry => ({
  openPipeline: "paste-classifier",
  method: extraction.method,
  source,
  usedOcr: extraction.usedOcr,
  qualityScore: extraction.qualityScore,
  warnings: extraction.warnings,
  preprocessedSteps: [],
});

export function buildFileOpenPipelineAction(
  extraction: FileExtractionResult,
  mode: FileImportMode
): FileOpenPipelineAction {
  const modeLabel = buildModeLabel(mode);
  let preferredSource: FileOpenPipelineTelemetry["source"] = "extracted-text";
  let sourceText = extraction.text ?? "";

  if (!sourceText.trim()) {
    const textFromBlocks = (extraction.structuredBlocks ?? [])
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n");
    if (textFromBlocks.trim()) {
      preferredSource = "structured-blocks";
      sourceText = textFromBlocks;
    }
  }

  if (!sourceText.trim()) {
    return {
      kind: "reject",
      mode,
      toast: {
        title: "ملف فارغ",
        description: "لم يتم العثور على نص في الملف المحدد.",
        variant: "destructive",
      },
      telemetry: buildTelemetry(extraction, preferredSource),
    };
  }
  let description = `${modeLabel} الملف بنجاح\nتم تطبيق تصنيف اللصق`;
  if (extraction.usedOcr) {
    description += " (تم استخدام OCR)";
  }
  if (extraction.method === "app-payload") {
    description += "\n(تم تحويل payload إلى نص للتصنيف)";
  }
  if (preferredSource === "structured-blocks") {
    description += "\n(مصدر التصنيف: structured blocks)";
  }
  if (extraction.warnings.length > 0) {
    description += `\n⚠️ ${extraction.warnings[0]}`;
  }

  return {
    kind: "import-classified-text",
    mode,
    text: sourceText,
    toast: {
      title: modeLabel,
      description,
    },
    telemetry: buildTelemetry(extraction, preferredSource),
  };
}
