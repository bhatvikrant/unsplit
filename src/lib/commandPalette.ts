import { createContext, useContext } from "react";

/**
 * Opens the search palette from anywhere: the desktop top bar's search box, the search button in
 * every page header on phones, and ⌘K. Provided by AppShell (src/components/layout/AppShell.tsx).
 */
export const CommandPaletteContext = createContext<{ open: () => void }>({ open: () => {} });

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}
