import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  isOpen: boolean;
  isCollapsed: boolean;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  toggleCollapsed: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isOpen: true,
      isCollapsed: false,
      toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (open) => set({ isOpen: open }),
      toggleCollapsed: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
    }),
    {
      name: "snapbridge-sidebar",
      partialize: (state) => ({
        isOpen: state.isOpen,
        isCollapsed: state.isCollapsed,
      }),
    },
  ),
);
