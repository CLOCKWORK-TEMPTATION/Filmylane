"use client";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Moon,
  Sun,
  FilePlus,
  FolderOpen,
  Save,
  Download,
  Upload,
  Printer,
  Undo,
  Redo,
  Scissors,
  Copy,
  FileText,
  Search,
  Replace,
  Pencil,
  Bot,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import type { FormEvent } from "react";

interface EditorHeaderProps {
  onGenerateIdeas: (theme: string) => void;
  isProcessingAI: boolean;
}

export function EditorHeader({
  onGenerateIdeas,
  isProcessingAI,
}: EditorHeaderProps) {
  const { theme, setTheme } = useTheme();
  const [ideaTheme, setIdeaTheme] = useState("");
  const [isIdeaDialogOpen, setIdeaDialogOpen] = useState(false);

  const handleIdeaSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (ideaTheme.trim()) {
      onGenerateIdeas(ideaTheme);
      setIdeaDialogOpen(false);
      setIdeaTheme("");
    }
  };

  return (
    <header className="z-30 flex-shrink-0 border-b bg-card px-4 pb-1 pt-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-accent" />
          <span className="font-headline text-lg font-bold">Filmlane</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            variant="ghost"
            size="icon"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
      <Menubar className="border-none p-0">
        <MenubarMenu>
          <MenubarTrigger>ملف</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              <FilePlus className="ml-2 h-4 w-4" /> جديد
            </MenubarItem>
            <MenubarItem>
              <FolderOpen className="ml-2 h-4 w-4" /> فتح...
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              <Save className="ml-2 h-4 w-4" /> حفظ
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              <Download className="ml-2 h-4 w-4" /> تصدير كـ PDF
            </MenubarItem>
            <MenubarItem>
              <Upload className="ml-2 h-4 w-4" /> استيراد...
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => window.print()}>
              <Printer className="ml-2 h-4 w-4" /> طباعة
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>تحرير</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => document.execCommand("undo")}>
              <Undo className="ml-2 h-4 w-4" /> تراجع
            </MenubarItem>
            <MenubarItem onClick={() => document.execCommand("redo")}>
              <Redo className="ml-2 h-4 w-4" /> إعادة
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => document.execCommand("cut")}>
              <Scissors className="ml-2 h-4 w-4" /> قص
            </MenubarItem>
            <MenubarItem onClick={() => document.execCommand("copy")}>
              <Copy className="ml-2 h-4 w-4" /> نسخ
            </MenubarItem>
            <MenubarItem onClick={() => document.execCommand("paste")}>
              <FileText className="ml-2 h-4 w-4" /> لصق
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              <Search className="ml-2 h-4 w-4" /> بحث...
            </MenubarItem>
            <MenubarItem>
              <Replace className="ml-2 h-4 w-4" /> بحث واستبدال...
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>أدوات</MenubarTrigger>
          <MenubarContent>
            <Dialog open={isIdeaDialogOpen} onOpenChange={setIdeaDialogOpen}>
              <DialogTrigger asChild>
                <MenubarItem onSelect={(e) => e.preventDefault()}>
                  <Bot className="ml-2 h-4 w-4" /> إنشاء أفكار مشاهد
                </MenubarItem>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleIdeaSubmit}>
                  <DialogHeader>
                    <DialogTitle>إنشاء أفكار مشاهد</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="idea-theme"
                        className="col-span-1 text-right"
                      >
                        الفكرة
                      </Label>
                      <Input
                        id="idea-theme"
                        value={ideaTheme}
                        onChange={(e) => setIdeaTheme(e.target.value)}
                        className="col-span-3"
                        placeholder="مثال: رجل يكتشف أنه يستطيع السفر عبر الزمن"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={isProcessingAI || !ideaTheme.trim()}
                    >
                      {isProcessingAI ? "...جاري الإنشاء" : "إنشاء"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <MenubarItem>
              <Pencil className="ml-2 h-4 w-4" /> إعادة تسمية شخصية
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </header>
  );
}
