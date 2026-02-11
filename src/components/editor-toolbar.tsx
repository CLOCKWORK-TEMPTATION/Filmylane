"use client";
import {
  Bold,
  Italic,
  Underline,
  Palette,
  AlignRight,
  AlignCenter,
  AlignLeft,
  ChevronDown,
  Bot,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  screenplayFormats,
  fonts,
  textSizes,
  colors,
} from "@/lib/screenplay-config";
import type { ScreenplayFormat } from "@/lib/screenplay-config";

interface EditorToolbarProps {
  currentFormat: string;
  setCurrentFormat: (format: string) => void;
  selectedFont: string;
  setSelectedFont: (font: string) => void;
  selectedSize: string;
  setSelectedSize: (size: string) => void;
  onFormatCommand: (command: string, value?: string) => void;
  onAutoFormat: () => void;
  isProcessingAI: boolean;
}

export function EditorToolbar({
  currentFormat,
  setCurrentFormat,
  selectedFont,
  setSelectedFont,
  selectedSize,
  setSelectedSize,
  onFormatCommand,
  onAutoFormat,
  isProcessingAI,
}: EditorToolbarProps) {
  const handleFormatChange = (formatId: string) => {
    if (!formatId) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    let element: HTMLElement | null =
      range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement;

    while (
      element &&
      element.parentElement &&
      element.tagName !== "DIV" &&
      element.parentElement.contentEditable !== "true"
    ) {
      element = element.parentElement!;
    }

    if (
      element &&
      element instanceof HTMLElement &&
      element.tagName === "DIV"
    ) {
      element.className = `format-${formatId}`;
      setCurrentFormat(formatId);
    }
  };

  return (
    <div className="bg-background/80 sticky top-0 z-20 border-b p-2 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[calc(21cm+4rem)] space-y-2">
        <div
          className="flex items-center gap-1 overflow-x-auto rounded-md border bg-card p-1"
          style={{ direction: "ltr" }}
        >
          <TooltipProvider>
            {screenplayFormats.map((format: ScreenplayFormat) => (
              <Tooltip key={format.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleFormatChange(format.id)}
                    className={`transition-all duration-200 ${currentFormat === format.id ? "bg-secondary text-secondary-foreground" : ""}`}
                  >
                    <format.icon size={18} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {format.label} ({format.shortcut || "Tab/Enter"})
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md border bg-card p-1"
          style={{ direction: "ltr" }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="min-w-[120px] justify-between">
                <span style={{ fontFamily: selectedFont }}>
                  {fonts.find((f) => f.value === selectedFont)?.label}
                </span>
                <ChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {fonts.map((font) => (
                <DropdownMenuItem
                  key={font.value}
                  onSelect={() => setSelectedFont(font.value)}
                  style={{ fontFamily: font.value }}
                >
                  {font.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-[70px] justify-between">
                {selectedSize.replace("pt", "")}
                <ChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {textSizes.map((size) => (
                <DropdownMenuItem
                  key={size.value}
                  onSelect={() => setSelectedSize(size.value)}
                >
                  {size.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6" />

          <TooltipProvider>
            <ToggleGroup type="multiple" aria-label="Text formatting">
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="bold"
                    aria-label="Toggle bold"
                    onClick={() => onFormatCommand("bold")}
                  >
                    <Bold size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>عريض</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="italic"
                    aria-label="Toggle italic"
                    onClick={() => onFormatCommand("italic")}
                  >
                    <Italic size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>مائل</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="underline"
                    aria-label="Toggle underline"
                    onClick={() => onFormatCommand("underline")}
                  >
                    <Underline size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>تسطير</p>
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Palette size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="grid grid-cols-5 gap-1 p-2">
                    {colors.map((color) => (
                      <DropdownMenuItem
                        key={color}
                        className="p-0"
                        onSelect={() => onFormatCommand("foreColor", color)}
                      >
                        <div
                          className="h-6 w-6 cursor-pointer rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent>
                <p>لون النص</p>
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6" />

            <ToggleGroup
              type="single"
              defaultValue="right"
              aria-label="Text alignment"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="right"
                    aria-label="Align right"
                    onClick={() => onFormatCommand("justifyRight")}
                  >
                    <AlignRight size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>محاذاة لليمين</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="center"
                    aria-label="Align center"
                    onClick={() => onFormatCommand("justifyCenter")}
                  >
                    <AlignCenter size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>توسيط</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="left"
                    aria-label="Align left"
                    onClick={() => onFormatCommand("justifyLeft")}
                  >
                    <AlignLeft size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  <p>محاذاة لليسار</p>
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>

            <Separator orientation="vertical" className="h-6" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onAutoFormat}
                  disabled={isProcessingAI}
                >
                  <Bot size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>تنسيق بالذكاء الاصطناعي</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
