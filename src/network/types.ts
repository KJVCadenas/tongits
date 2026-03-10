import type { GameState, GameAction, PlayerId } from '../game/engine'

export type NetworkMessage =
  | { type: 'STATE_SNAPSHOT'; state: GameState }
  | { type: 'ACTION_INTENT'; action: GameAction }
  | { type: 'PLAYER_JOIN'; name: string }
  | { type: 'PLAYER_ASSIGNMENT'; playerId: PlayerId }
