import type { GameState, GameAction } from '../game/engine'

export type NetworkMessage =
  | { type: 'STATE_SNAPSHOT'; state: GameState }
  | { type: 'ACTION_INTENT'; action: GameAction }
