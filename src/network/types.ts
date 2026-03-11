import type { GameState, GameAction, PlayerId, GameMode } from '../game/engine'

export type NetworkMessage =
  | { type: 'STATE_SNAPSHOT'; state: GameState }
  | { type: 'ACTION_INTENT'; action: GameAction }
  | { type: 'PLAYER_JOIN'; name: string }
  | { type: 'PLAYER_ASSIGNMENT'; playerId: PlayerId }
  | { type: 'LOBBY_SNAPSHOT'; gameMode: GameMode; hostName: string; guestNames: Partial<Record<PlayerId, string>>; guestReady: Partial<Record<PlayerId, boolean>> }
  | { type: 'GUEST_READY'; playerId: PlayerId; ready: boolean }
