import {
  BookHeart,
  Film,
  MapPin,
  Camera,
  Feather,
  UserSquare,
  Parentheses,
  MessageCircle,
  FastForward,
  SeparatorHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ScreenplayFormat {
  id: string;
  label: string;
  shortcut: string;
  color: string;
  icon: LucideIcon;
}

export const screenplayFormats: ScreenplayFormat[] = [
  {
    id: "basmala",
    label: "بسملة",
    shortcut: "",
    color: "bg-purple-200/50 dark:bg-purple-800/50",
    icon: BookHeart,
  },
  {
    id: "scene-header-top-line",
    label: "عنوان المشهد (سطر علوي)",
    shortcut: "",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: SeparatorHorizontal,
  },
  {
    id: "scene-header-1",
    label: "عنوان المشهد (1)",
    shortcut: "Ctrl+1",
    color: "bg-blue-200/50 dark:bg-blue-800/50",
    icon: Film,
  },
  {
    id: "scene-header-2",
    label: "عنوان المشهد (2)",
    shortcut: "Tab",
    color: "bg-sky-200/50 dark:bg-sky-800/50",
    icon: MapPin,
  },
  {
    id: "scene-header-3",
    label: "عنوان المشهد (3)",
    shortcut: "Tab",
    color: "bg-cyan-200/50 dark:bg-cyan-800/50",
    icon: Camera,
  },
  {
    id: "action",
    label: "الفعل/الحدث",
    shortcut: "Ctrl+4",
    color: "bg-gray-200/50 dark:bg-gray-700/50",
    icon: Feather,
  },
  {
    id: "character",
    label: "شخصية",
    shortcut: "Ctrl+2",
    color: "bg-green-200/50 dark:bg-green-800/50",
    icon: UserSquare,
  },
  {
    id: "parenthetical",
    label: "بين قوسين",
    shortcut: "Tab",
    color: "bg-yellow-200/50 dark:bg-yellow-800/50",
    icon: Parentheses,
  },
  {
    id: "dialogue",
    label: "حوار",
    shortcut: "Ctrl+3",
    color: "bg-orange-200/50 dark:bg-orange-800/50",
    icon: MessageCircle,
  },
  {
    id: "transition",
    label: "انتقال",
    shortcut: "Ctrl+6",
    color: "bg-red-200/50 dark:bg-red-800/50",
    icon: FastForward,
  },
];

export const formatClassMap: { [key: string]: string } =
  screenplayFormats.reduce(
    (acc, format) => {
      acc[format.id] = `format-${format.id}`;
      return acc;
    },
    {} as { [key: string]: string }
  );

export const fonts = [
  { value: "Amiri", label: "أميري" },
  { value: "Noto Sans Arabic", label: "نوتو سانس عربي" },
  { value: "Cairo", label: "القاهرة" },
  { value: "Tajawal", label: "تجوّل" },
  { value: "Almarai", label: "المراي" },
  { value: "Markazi Text", label: "مركزي" },
  { value: "Reem Kufi", label: "ريم كوفي" },
  { value: "Scheherazade New", label: "شهرزاد الجديد" },
  { value: "Lateef", label: "لطيف" },
  { value: "Aref Ruqaa", label: "عارف رقعة" },
  { value: "Arial", label: "Arial" },
  { value: "Tahoma", label: "Tahoma" },
];

export const textSizes = [
  { value: "8pt", label: "8" },
  { value: "9pt", label: "9" },
  { value: "10pt", label: "10" },
  { value: "11pt", label: "11" },
  { value: "12pt", label: "12" },
  { value: "14pt", label: "14" },
  { value: "16pt", label: "16" },
  { value: "18pt", label: "18" },
  { value: "24pt", label: "24" },
  { value: "36pt", label: "36" },
];

export const colors = [
  "#000000",
  "#e03131",
  "#c2255c",
  "#9c36b5",
  "#6741d9",
  "#3b5bdb",
  "#1b6ec2",
  "#0c8599",
  "#099268",
  "#2f9e44",
  "#66a80f",
  "#f08c00",
  "#e8590c",
  "#868e96",
  "#343a40",
];

export const A4_PAGE_HEIGHT_PX = 1123;
