import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-table view preferences persisted to the browser (localStorage) so a
 * user's column order, sort, and manager-grouping choice survive reloads.
 * Keyed by a stable `tableId` (e.g. "summary", "section-channel-partners").
 */
export interface TablePrefs {
  /** Explicit left-to-right leaf-column order (TanStack columnOrder). */
  columnOrder?: string[];
  /** Active sort state (TanStack SortingState shape). */
  sorting?: { id: string; desc: boolean }[];
  /** Manager row-grouping toggle. Undefined = use the table's default. */
  grouped?: boolean;
}

interface TableStore {
  prefs: Record<string, TablePrefs>;
  setPrefs: (id: string, patch: Partial<TablePrefs>) => void;
  /** Clear column order + sorting for a table (keeps the grouping toggle). */
  resetLayout: (id: string) => void;
}

export const useTableStore = create<TableStore>()(
  persist(
    (set) => ({
      prefs: {},
      setPrefs: (id, patch) =>
        set((s) => ({
          prefs: { ...s.prefs, [id]: { ...s.prefs[id], ...patch } },
        })),
      resetLayout: (id) =>
        set((s) => ({
          prefs: {
            ...s.prefs,
            [id]: { ...s.prefs[id], columnOrder: undefined, sorting: undefined },
          },
        })),
    }),
    { name: "ae-tables" },
  ),
);
