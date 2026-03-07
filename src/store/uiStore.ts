import { create } from 'zustand'

type UIStore = {
  selectedCardId: string | null
  setSelectedCard: (id: string | null) => void
  role: 'host' | 'guest' | null
  setRole: (role: 'host' | 'guest' | null) => void
  hasDrawnThisTurn: boolean
  setHasDrawnThisTurn: (val: boolean) => void
}

export const useUIStore = create<UIStore>(set => ({
  selectedCardId: null,
  setSelectedCard: (id: string | null) => set({ selectedCardId: id }),
  role: null,
  setRole: (role: 'host' | 'guest' | null) => set({ role }),
  hasDrawnThisTurn: false,
  setHasDrawnThisTurn: (val: boolean) => set({ hasDrawnThisTurn: val }),
}))
