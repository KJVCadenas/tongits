import { create } from 'zustand'
import { gameReducer, initialGameState, type GameState, type GameAction } from '../game/engine'

type GameStore = {
  game: GameState
  dispatch: (action: GameAction) => void
  syncFromHost: (snapshot: GameState) => void
}

export const useGameStore = create<GameStore>(set => ({
  game: initialGameState,
  dispatch: (action: GameAction) =>
    set(s => ({ game: gameReducer(s.game, action) })),
  syncFromHost: (snapshot: GameState) =>
    set(() => ({ game: snapshot })),
}))
