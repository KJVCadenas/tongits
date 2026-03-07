import { create } from 'zustand'

type UIStore = {
  selectedCardIds: string[]
  toggleCardSelection: (id: string) => void
  clearCardSelection: () => void
  pendingMeldGroups: string[][]
  groupSelection: () => void
  addPendingMeld: (cardIds: string[]) => void
  setPendingMeldGroups: (groups: string[][]) => void
  clearPendingMelds: () => void
  role: 'host' | 'guest' | null
  setRole: (role: 'host' | 'guest' | null) => void
  hasDrawnThisTurn: boolean
  setHasDrawnThisTurn: (val: boolean) => void
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
  setRole: (role: 'host' | 'guest' | null) => set({ role }),
  hasDrawnThisTurn: false,
  setHasDrawnThisTurn: (val: boolean) => set({ hasDrawnThisTurn: val }),
}))
