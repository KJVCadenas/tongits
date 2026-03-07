import { type Card, createDeck, shuffle, deal } from './deck'
import { handTotal, isValidMeld, canExtendMeld, detectMelds } from './melds'

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

export type RoundReason = 'tongit' | 'draw' | 'stock'

export type RoundResult = {
  winner: PlayerId
  reason: RoundReason
  totals: Record<PlayerId, number>
}

export type GameState = {
  phase: GamePhase
  players: PlayerState[]
  stock: Card[]
  discardPile: Card[]
  currentTurn: PlayerId
  hostIsDealer: boolean
  roundResult?: RoundResult
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'LAY_MELD'; playerId: PlayerId; cardIds: string[] }
  | { type: 'SAPAW'; playerId: PlayerId; cardId: string; targetPlayerId: PlayerId; meldIndex: number }
  | { type: 'CALL_DRAW'; playerId: PlayerId }
  | { type: 'END_ROUND' }
  | { type: 'NEXT_ROUND' }

// Turn order: host → ai → guest → host (counterclockwise)
const TURN_ORDER: PlayerId[] = ['host', 'ai', 'guest']

function nextTurn(current: PlayerId): PlayerId {
  const idx = TURN_ORDER.indexOf(current)
  return TURN_ORDER[(idx + 1) % TURN_ORDER.length]
}

function getPhaseForTurn(turn: PlayerId): GamePhase {
  return turn === 'ai' ? 'AI_TURN' : 'PLAYER_TURN'
}

function buildRoundResult(
  players: PlayerState[],
  winner: PlayerId,
  reason: RoundReason
): RoundResult {
  const totals = Object.fromEntries(
    players.map(p => [p.id, handTotal(p.hand)])
  ) as Record<PlayerId, number>
  return { winner, reason, totals }
}

function lowestTotalWinner(players: PlayerState[], callerTiebreak: PlayerId): PlayerId {
  let winner = players[0]
  for (const p of players) {
    const pTotal = handTotal(p.hand)
    const wTotal = handTotal(winner.hand)
    if (pTotal < wTotal || (pTotal === wTotal && p.id === callerTiebreak)) {
      winner = p
    }
  }
  return winner.id
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
  // Block all actions except NEXT_ROUND when round is over
  if (state.phase === 'ROUND_END' && action.type !== 'NEXT_ROUND') return state

  switch (action.type) {
    case 'START_GAME': {
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand, stock } = deal(deck)
      const dealer: PlayerId = state.hostIsDealer ? 'host' : 'guest'
      return {
        ...state,
        phase: getPhaseForTurn(dealer),
        players: [
          { id: 'host', hand: dealerHand, melds: [], isOpened: false },
          { id: 'guest', hand: player2Hand, melds: [], isOpened: false },
          { id: 'ai', hand: aiHand, melds: [], isOpened: false },
        ],
        stock,
        discardPile: [],
        currentTurn: dealer,
        roundResult: undefined,
      }
    }

    case 'DRAW_FROM_STOCK': {
      if (state.stock.length === 0) return state
      const [topCard, ...remainingStock] = state.stock
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: [...p.hand, topCard] } : p
      )
      return { ...state, players, stock: remainingStock }
    }

    case 'DRAW_FROM_DISCARD': {
      if (state.discardPile.length === 0) return state
      const [topCard, ...remainingDiscard] = state.discardPile
      const player = state.players.find(p => p.id === state.currentTurn)
      if (!player) return state
      // Enforce: drawn card must participate in at least one valid meld
      const possibleMelds = detectMelds([...player.hand, topCard])
      if (!possibleMelds.some(m => m.some(c => c.id === topCard.id))) return state
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: [...p.hand, topCard] } : p
      )
      return { ...state, players, discardPile: remainingDiscard }
    }

    case 'DISCARD': {
      const currentPlayer = state.players.find(p => p.id === state.currentTurn)
      if (!currentPlayer) return state
      const card = currentPlayer.hand.find(c => c.id === action.cardId)
      if (!card) return state

      const newHand = currentPlayer.hand.filter(c => c.id !== action.cardId)
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: newHand } : p
      )
      const newDiscardPile = [card, ...state.discardPile]

      // Tongit: discarding player's hand is now empty
      if (newHand.length === 0) {
        return {
          ...state,
          players,
          discardPile: newDiscardPile,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, state.currentTurn, 'tongit'),
        }
      }

      // Stock depleted: no more draws possible after this turn
      if (state.stock.length === 0) {
        const winner = lowestTotalWinner(players, state.currentTurn)
        return {
          ...state,
          players,
          discardPile: newDiscardPile,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, winner, 'stock'),
        }
      }

      const next = nextTurn(state.currentTurn)
      return {
        ...state,
        players,
        discardPile: newDiscardPile,
        currentTurn: next,
        phase: getPhaseForTurn(next),
      }
    }

    case 'LAY_MELD': {
      if (state.currentTurn !== action.playerId) return state
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return state

      const cards = action.cardIds
        .map(id => player.hand.find(c => c.id === id))
        .filter(Boolean) as Card[]
      if (cards.length !== action.cardIds.length) return state
      if (!isValidMeld(cards)) return state

      const newHand = player.hand.filter(c => !action.cardIds.includes(c.id))
      const players = state.players.map(p =>
        p.id === action.playerId
          ? { ...p, hand: newHand, melds: [...p.melds, cards], isOpened: true }
          : p
      )

      // Tongit: hand empty after laying meld
      if (newHand.length === 0) {
        return {
          ...state,
          players,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, action.playerId, 'tongit'),
        }
      }

      return { ...state, players }
    }

    case 'SAPAW': {
      if (state.currentTurn !== action.playerId) return state
      const actingPlayer = state.players.find(p => p.id === action.playerId)
      if (!actingPlayer) return state

      const card = actingPlayer.hand.find(c => c.id === action.cardId)
      if (!card) return state

      const targetPlayer = state.players.find(p => p.id === action.targetPlayerId)
      if (!targetPlayer) return state
      const targetMeld = targetPlayer.melds[action.meldIndex]
      if (!targetMeld) return state

      if (!canExtendMeld(card, targetMeld)) return state

      const newHand = actingPlayer.hand.filter(c => c.id !== action.cardId)
      const players = state.players.map(p => {
        if (p.id === action.targetPlayerId && p.id === action.playerId) {
          // Sapawing own meld
          const newMelds = p.melds.map((m, i) =>
            i === action.meldIndex ? [...m, card] : m
          )
          return { ...p, hand: newHand, melds: newMelds }
        }
        if (p.id === action.targetPlayerId) {
          const newMelds = p.melds.map((m, i) =>
            i === action.meldIndex ? [...m, card] : m
          )
          return { ...p, melds: newMelds }
        }
        if (p.id === action.playerId) {
          return { ...p, hand: newHand }
        }
        return p
      })

      // Tongit: hand empty after sapaw
      if (newHand.length === 0) {
        return {
          ...state,
          players,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, action.playerId, 'tongit'),
        }
      }

      return { ...state, players }
    }

    case 'CALL_DRAW': {
      if (state.currentTurn !== action.playerId) return state
      if (state.phase !== 'PLAYER_TURN') return state
      const caller = state.players.find(p => p.id === action.playerId)
      if (!caller?.isOpened) return state

      const winner = lowestTotalWinner(state.players, action.playerId)
      return {
        ...state,
        phase: 'ROUND_END',
        roundResult: buildRoundResult(state.players, winner, 'draw'),
      }
    }

    case 'END_ROUND': {
      return { ...state, phase: 'ROUND_END' }
    }

    case 'NEXT_ROUND': {
      const newHostIsDealer = !state.hostIsDealer
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand, stock } = deal(deck)
      const dealer: PlayerId = newHostIsDealer ? 'host' : 'guest'
      return {
        ...state,
        hostIsDealer: newHostIsDealer,
        phase: getPhaseForTurn(dealer),
        players: [
          { id: 'host', hand: dealerHand, melds: [], isOpened: false },
          { id: 'guest', hand: player2Hand, melds: [], isOpened: false },
          { id: 'ai', hand: aiHand, melds: [], isOpened: false },
        ],
        stock,
        discardPile: [],
        currentTurn: dealer,
        roundResult: undefined,
      }
    }

    default:
      return state
  }
}
