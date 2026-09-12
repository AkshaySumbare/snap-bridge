import {
  Clipboard,
  History,
  Image,
  LayoutDashboard,
  QrCode,
  Search,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to?: string;
  available: boolean;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", available: true, icon: LayoutDashboard },
  { label: "Clipboard Sync", available: false, icon: Clipboard },
  { label: "Device Pairing", available: false, icon: QrCode },
  { label: "Capture History", available: false, icon: History },
  { label: "Screenshot Vault", available: false, icon: Image },
  { label: "OCR Search", available: false, icon: Search },
];
