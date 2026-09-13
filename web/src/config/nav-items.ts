import {
  BarChart3,
  Briefcase,
  Clipboard,
  FolderOpen,
  GitCompare,
  GraduationCap,
  History,
  LayoutDashboard,
  Library,
  MessageSquareText,
  Mic,
  Network,
  QrCode,
  Sparkles,
  Upload,
  Wallet,
  Workflow,
  CheckSquare,
  FileStack,
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
  to: string;
  icon: LucideIcon;
}

export interface NavGroupItem {
  type: "group";
  label: string;
  icon: LucideIcon;
  available: boolean;
  basePath: string;
  children: NavGroupChild[];
}

export interface NavSoonItem {
  type: "soon";
  label: string;
  phase?: number;
  icon: LucideIcon;
}

export type NavEntry = NavLinkItem | NavGroupItem | NavSoonItem;

export const NAV_ENTRIES: NavEntry[] = [
  {
    type: "link",
    label: "Dashboard",
    to: "/dashboard",
    available: true,
    icon: LayoutDashboard,
  },
  {
    type: "group",
    label: "Knowledge Vault",
    icon: Library,
    available: true,
    basePath: "/vault",
    children: [
      { label: "Upload", to: "/vault/upload", icon: Upload },
      { label: "Documents", to: "/vault/documents", icon: FileStack },
      { label: "Folders", to: "/vault/folders", icon: FolderOpen },
      { label: "Ask AI", to: "/vault/ask", icon: MessageSquareText },
    ],
  },

  // Coming soon
  { type: "soon", label: "Clipboard Sync", phase: 1, icon: Clipboard },
  { type: "soon", label: "Device Pairing", phase: 1, icon: QrCode },
  { type: "soon", label: "Capture History", phase: 1, icon: History },
  { type: "soon", label: "Projects", phase: 3, icon: FolderOpen },
  { type: "soon", label: "Smart Flows", phase: 4, icon: Workflow },
  { type: "soon", label: "Interview Prep", phase: 4, icon: Briefcase },
  { type: "soon", label: "Study Planner", phase: 4, icon: GraduationCap },
  { type: "soon", label: "Compare Documents", phase: 4, icon: GitCompare },
  { type: "soon", label: "Finance Insights", phase: 4, icon: Wallet },
  { type: "soon", label: "Tasks", phase: 4, icon: CheckSquare },
  { type: "soon", label: "Knowledge Graph", phase: 5, icon: Network },
  { type: "soon", label: "Mock Interview", phase: 5, icon: Mic },
  { type: "soon", label: "Insights", phase: 5, icon: BarChart3 },
  { type: "soon", label: "Custom Flows", phase: 5, icon: Sparkles },
];
