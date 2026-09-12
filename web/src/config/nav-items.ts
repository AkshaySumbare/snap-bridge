import {
  BarChart3,
  BookOpen,
  Briefcase,
  Clipboard,
  FileSearch,
  FileText,
  FolderKanban,
  GitCompare,
  GraduationCap,
  History,
  Image,
  LayoutDashboard,
  MessageSquareText,
  Mic,
  Network,
  QrCode,
  Search,
  Sparkles,
  Upload,
  Wallet,
  Workflow,
  CheckSquare,
  FolderOpen,
  Tags,
  Clock,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to?: string;
  available: boolean;
  phase?: number;
  icon: LucideIcon;
}

/** All features grouped by roadmap phase. Only Dashboard is live. */
export const NAV_ITEMS: NavItem[] = [
  // Live
  { label: "Dashboard", to: "/dashboard", available: true, icon: LayoutDashboard },

  // Phase 1 — Foundation & Capture Sync
  { label: "Clipboard Sync", available: false, phase: 1, icon: Clipboard },
  { label: "Device Pairing", available: false, phase: 1, icon: QrCode },
  { label: "Capture History", available: false, phase: 1, icon: History },

  // Phase 2 — Vault & Document Storage
  { label: "Screenshot Vault", available: false, phase: 2, icon: Image },
  { label: "Document Vault", available: false, phase: 2, icon: Upload },
  { label: "OCR Search", available: false, phase: 2, icon: FileSearch },
  { label: "Smart Folders", available: false, phase: 2, icon: FolderOpen },
  { label: "Tags", available: false, phase: 2, icon: Tags },

  // Phase 3 — Universal Search & Intelligence
  { label: "Universal Search", available: false, phase: 3, icon: Search },
  { label: "Projects", available: false, phase: 3, icon: FolderKanban },
  { label: "PDF Chat", available: false, phase: 3, icon: MessageSquareText },
  { label: "Folder Q&A", available: false, phase: 3, icon: FileText },
  { label: "Timeline", available: false, phase: 3, icon: Clock },
  { label: "Saved Searches", available: false, phase: 3, icon: BookOpen },

  // Phase 4 — Smart Flows & Actions
  { label: "Smart Flows", available: false, phase: 4, icon: Workflow },
  { label: "Interview Prep", available: false, phase: 4, icon: Briefcase },
  { label: "Study Planner", available: false, phase: 4, icon: GraduationCap },
  { label: "Compare Documents", available: false, phase: 4, icon: GitCompare },
  { label: "Finance Insights", available: false, phase: 4, icon: Wallet },
  { label: "Tasks", available: false, phase: 4, icon: CheckSquare },

  // Phase 5 — Advanced Intelligence & Platform
  { label: "Knowledge Graph", available: false, phase: 5, icon: Network },
  { label: "Mock Interview", available: false, phase: 5, icon: Mic },
  { label: "Insights", available: false, phase: 5, icon: BarChart3 },
  { label: "Custom Flows", available: false, phase: 5, icon: Sparkles },
];
