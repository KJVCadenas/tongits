import { type Card, createDeck, shuffle, deal } from './deck'

export type PlayerId = 'host' | 'guest' | 'ai'

export type GamePhase =
  | 'LOBBY'
  | 'DEALING'
  | 'PLAYER_TURN'
  | 'AI_TURN'
  | 'ROUND_END'

export type PlayerState = {
  id: PlayerId
  hand: Card[]
  melds: Card[][]
  isOpened: boolean
}

export type GameState = {
  phase: GamePhase
  players: PlayerState[]
  stock: Card[]
  discardPile: Card[]
  currentTurn: PlayerId
  hostIsDealer: boolean
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'END_ROUND' }

// Turn order: host → ai → guest → host (counterclockwise)
const TURN_ORDER: PlayerId[] = ['host', 'ai', 'guest']

function nextTurn(current: PlayerId): PlayerId {
  const idx = TURN_ORDER.indexOf(current)
  return TURN_ORDER[(idx + 1) % TURN_ORDER.length]
}

function getPhaseForTurn(turn: PlayerId): GamePhase {
  return turn === 'ai' ? 'AI_TURN' : 'PLAYER_TURN'
}

export const initialGameState: GameState = {
  phase: 'LOBBY',
  players: [
    { id: 'host', hand: [], melds: [], isOpened: false },
    { id: 'guest', hand: [], melds: [], isOpened: false },
    { id: 'ai', hand: [], melds: [], isOpened: false },
  ],
  stock: [],
  discardPile: [],
  currentTurn: 'host',
  hostIsDealer: true,
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand, stock } = deal(deck)
      const dealer: PlayerId = state.hostIsDealer ? 'host' : 'guest'
      return {
        ...state,
        phase: 'PLAYER_TURN',
        players: [
          { id: 'host', hand: dealerHand, melds: [], isOpened: false },
          { id: 'guest', hand: player2Hand, melds: [], isOpened: false },
          { id: 'ai', hand: aiHand, melds: [], isOpened: false },
        ],
        stock,
        discardPile: [],
        currentTurn: dealer,
      }
    }

    case 'DRAW_FROM_STOCK': {
      if (state.stock.length === 0) return state
      const [topCard, ...remainingStock] = state.stock
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: [...p.hand, topCard] } : p
      )
      return {
        ...state,
        players,
        stock: remainingStock,
      }
    }

    case 'DRAW_FROM_DISCARD': {
      if (state.discardPile.length === 0) return state
      const [topCard, ...remainingDiscard] = state.discardPile
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: [...p.hand, topCard] } : p
      )
      return {
        ...state,
        players,
        discardPile: remainingDiscard,
      }
    }

    case 'DISCARD': {
      const currentPlayer = state.players.find(p => p.id === state.currentTurn)
      if (!currentPlayer) return state
      const card = currentPlayer.hand.find(c => c.id === action.cardId)
      if (!card) return state

      const players = state.players.map(p =>
        p.id === state.currentTurn
          ? { ...p, hand: p.hand.filter(c => c.id !== action.cardId) }
          : p
      )
      const next = nextTurn(state.currentTurn)
      const nextPhase = getPhaseForTurn(next)
      return {
        ...state,
        players,
        discardPile: [card, ...state.discardPile],
        currentTurn: next,
        phase: nextPhase,
      }
    }

    case 'END_ROUND': {
      return { ...state, phase: 'ROUND_END' }
    }

    default:
      return state
  }
}
