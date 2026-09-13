import {
  BarChart3,
  BookOpen,
  Briefcase,
  CheckSquare,
  Clipboard,
  Clock,
  FileSearch,
  FileText,
  FolderKanban,
  GitCompare,
  GraduationCap,
  History,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Mic,
  Network,
  QrCode,
  Search,
  Share2,
  Sparkles,
  Upload,
  Wallet,
  Workflow,
  FileStack,
  FolderOpen,
  Tags,
  Image,
  type LucideIcon,
} from "lucide-react";

export interface NavLinkItem {
  type: "link";
  label: string;
  to: string;
  available: boolean;
  icon: LucideIcon;
}

export interface NavGroupChild {
  label: string;
  icon: LucideIcon;
  to?: string;
  available: boolean;
}

export interface NavGroupItem {
  type: "group";
  label: string;
  icon: LucideIcon;
  /** True when at least one child route is live */
  available: boolean;
  basePath: string;
  children: NavGroupChild[];
}

export type NavEntry = NavLinkItem | NavGroupItem;

export const NAV_ENTRIES: NavEntry[] = [
  {
    type: "link",
    label: "Dashboard",
    to: "/dashboard",
    available: true,
    icon: LayoutDashboard,
  },

  // ── Phase 2 — Live ──────────────────────────────────────────────────────────
  {
    type: "group",
    label: "Knowledge Vault",
    icon: Library,
    available: true,
    basePath: "/vault",
    children: [
      { label: "Upload", to: "/vault/upload", icon: Upload, available: true },
      { label: "Documents", to: "/vault/documents", icon: FileStack, available: true },
      { label: "Folders", to: "/vault/folders", icon: FolderOpen, available: true },
      { label: "Ask AI", to: "/vault/ask", icon: MessageSquareText, available: true },
    ],
  },

  // ── Phase 1 — Capture Sync ────────────────────────────────────────────────
  {
    type: "group",
    label: "Capture Sync",
    icon: Share2,
    available: false,
    basePath: "/capture",
    children: [
      { label: "Device Pairing", icon: QrCode, available: false },
      { label: "Clipboard Sync", icon: Clipboard, available: false },
      { label: "Capture History", icon: History, available: false },
      { label: "Screenshot Vault", icon: Image, available: false },
    ],
  },

  // ── Phase 3 — Project Intelligence ────────────────────────────────────────
  {
    type: "group",
    label: "Project Intelligence",
    icon: FolderKanban,
    available: false,
    basePath: "/intelligence",
    children: [
      { label: "Projects", icon: FolderKanban, available: false },
      { label: "Universal Search", icon: Search, available: false },
      { label: "PDF Chat", icon: MessageSquareText, available: false },
      { label: "Folder Q&A", icon: FileText, available: false },
      { label: "Timeline", icon: Clock, available: false },
      { label: "Saved Searches", icon: BookOpen, available: false },
      { label: "OCR Search", icon: FileSearch, available: false },
      { label: "Tags", icon: Tags, available: false },
    ],
  },

  // ── Phase 4 — Smart Flows ───────────────────────────────────────────────────
  {
    type: "group",
    label: "Smart Flows",
    icon: Workflow,
    available: false,
    basePath: "/flows",
    children: [
      { label: "Flow Hub", icon: Workflow, available: false },
      { label: "Interview Prep", icon: Briefcase, available: false },
      { label: "Study Planner", icon: GraduationCap, available: false },
      { label: "Compare Documents", icon: GitCompare, available: false },
      { label: "Finance Insights", icon: Wallet, available: false },
      { label: "Tasks", icon: CheckSquare, available: false },
    ],
  },

  // ── Phase 5 — Advanced Platform ───────────────────────────────────────────
  {
    type: "group",
    label: "Advanced Platform",
    icon: Sparkles,
    available: false,
    basePath: "/advanced",
    children: [
      { label: "Knowledge Graph", icon: Network, available: false },
      { label: "Mock Interview", icon: Mic, available: false },
      { label: "Insights", icon: BarChart3, available: false },
      { label: "Custom Flows", icon: Sparkles, available: false },
    ],
  },
];
