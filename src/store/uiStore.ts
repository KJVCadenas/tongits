import { create } from 'zustand'

type Role = 'host' | 'guest' | 'guest2' | null

type UIStore = {
  selectedCardIds: string[]
  toggleCardSelection: (id: string) => void
  clearCardSelection: () => void
  pendingMeldGroups: string[][]
  groupSelection: () => void
  addPendingMeld: (cardIds: string[]) => void
  setPendingMeldGroups: (groups: string[][]) => void
  clearPendingMelds: () => void
  role: Role
  setRole: (role: Role) => void
  hasDrawnThisTurn: boolean
  setHasDrawnThisTurn: (val: boolean) => void
  highlightedPile: 'stock' | 'discard' | null
  setHighlightedPile: (pile: 'stock' | 'discard' | null) => void
}

export const useUIStore = create<UIStore>(set => ({
  selectedCardIds: [],
  toggleCardSelection: (id: string) =>
    set(s => ({
      selectedCardIds: s.selectedCardIds.includes(id)
        ? s.selectedCardIds.filter(x => x !== id)
        : [...s.selectedCardIds, id],
    })),
  clearCardSelection: () => set({ selectedCardIds: [] }),
  pendingMeldGroups: [],
  groupSelection: () =>
    set(s => ({
      pendingMeldGroups: s.selectedCardIds.length > 0
        ? [...s.pendingMeldGroups, [...s.selectedCardIds]]
        : s.pendingMeldGroups,
      selectedCardIds: [],
    })),
  addPendingMeld: (cardIds: string[]) =>
    set(s => ({ pendingMeldGroups: [...s.pendingMeldGroups, cardIds] })),
  setPendingMeldGroups: (groups: string[][]) => set({ pendingMeldGroups: groups }),
  clearPendingMelds: () => set({ pendingMeldGroups: [] }),
  role: null,
  setRole: (role: Role) => set({ role }),
  hasDrawnThisTurn: false,
  setHasDrawnThisTurn: (val: boolean) => set({ hasDrawnThisTurn: val }),
  highlightedPile: null,
  setHighlightedPile: (pile: 'stock' | 'discard' | null) => set({ highlightedPile: pile }),
}))
