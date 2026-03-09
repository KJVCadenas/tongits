import { type Card, createDeck, shuffle, deal } from './deck'
import { handTotal, isValidMeld, canExtendMeld, detectMelds } from './melds'

export type PlayerId = 'host' | 'guest' | 'ai'

export type GamePhase =
  | 'LOBBY'
  | 'DEALING'
  | 'PLAYER_TURN'
  | 'AI_TURN'
  | 'DRAW_RESOLUTION'
  | 'ROUND_END'

export type PlayerState = {
  id: PlayerId
  hand: Card[]
  melds: Card[][]
  secretSets?: Card[][]
  isOpened: boolean
}

export type DrawRestriction = {
  playerId: PlayerId
  reason: 'self_sapawed' | 'opponent_sapawed'
}

export type RoundReason = 'tongit' | 'draw' | 'stock'

export type RoundResult = {
  winner: PlayerId
  reason: RoundReason
  totals: Record<PlayerId, number>
  burned?: PlayerId[]
}

export type GameState = {
  phase: GamePhase
  players: PlayerState[]
  stock: Card[]
  discardPile: Card[]
  currentTurn: PlayerId
  dealer: PlayerId
  hostIsDealer: boolean
  dealerFirstTurn: boolean
  drawPhase: boolean
  drawRestriction?: DrawRestriction
  drawCaller?: PlayerId
  drawResponses?: Record<string, 'fold' | 'challenge'>
  lastStockDrawer?: PlayerId
  roundResult?: RoundResult
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'LAY_MELD'; playerId: PlayerId; cardIds: string[] }
  | { type: 'LAY_SECRET_SET'; playerId: PlayerId; cardIds: string[] }
  | { type: 'SAPAW'; playerId: PlayerId; cardId: string; targetPlayerId: PlayerId; meldIndex: number }
  | { type: 'CALL_DRAW'; playerId: PlayerId }
  | { type: 'RESPOND_DRAW'; playerId: PlayerId; response: 'fold' | 'challenge' }
  | { type: 'END_ROUND' }
  | { type: 'NEXT_ROUND' }

// Turn order: host → ai → guest → host (counterclockwise)
const TURN_ORDER: PlayerId[] = ['host', 'ai', 'guest']

const ALL_PLAYERS: PlayerId[] = ['host', 'guest', 'ai']

export function selectDealer(): PlayerId {
  return ALL_PLAYERS[Math.floor(Math.random() * ALL_PLAYERS.length)]
}

function nextTurn(current: PlayerId): PlayerId {
  const idx = TURN_ORDER.indexOf(current)
  return TURN_ORDER[(idx + 1) % TURN_ORDER.length]
}

function getPhaseForTurn(turn: PlayerId): GamePhase {
  return turn === 'ai' ? 'AI_TURN' : 'PLAYER_TURN'
}

function getBurnedPlayers(players: PlayerState[]): PlayerId[] {
  return players.filter(p => !p.isOpened).map(p => p.id)
}

function buildRoundResult(
  players: PlayerState[],
  winner: PlayerId,
  reason: RoundReason,
  burned: PlayerId[] = []
): RoundResult {
  const totals = Object.fromEntries(
    players.map(p => [p.id, handTotal(p.hand)])
  ) as Record<PlayerId, number>
  return { winner, reason, totals, burned }
}

function lowestTotalWinner(
  players: PlayerState[],
  callerTiebreak: PlayerId,
  lastStockDrawer?: PlayerId
): PlayerId {
  const minTotal = Math.min(...players.map(p => handTotal(p.hand)))
  const tied = players.filter(p => handTotal(p.hand) === minTotal)

  if (tied.length === 1) return tied[0].id

  // Tiebreaker 1: last stock drawer wins (TC-TIE-1)
  if (lastStockDrawer !== undefined && tied.some(p => p.id === lastStockDrawer)) {
    return lastStockDrawer
  }

  // Tiebreaker 2: next in turn order after the current player (TC-TIE-2)
  for (let i = 1; i <= TURN_ORDER.length; i++) {
    const candidate = TURN_ORDER[(TURN_ORDER.indexOf(callerTiebreak) + i) % TURN_ORDER.length]
    if (tied.some(p => p.id === candidate)) {
      return candidate
    }
  }

  return tied[0].id
}

function resolveDrawChallenge(
  players: PlayerState[],
  caller: PlayerId,
  challengers: PlayerId[]
): PlayerId {
  const participants = players.filter(p => p.id === caller || challengers.includes(p.id))
  const minTotal = Math.min(...participants.map(p => handTotal(p.hand)))
  const tied = participants.filter(p => handTotal(p.hand) === minTotal)

  if (tied.length === 1) return tied[0].id

  // If caller is in the tie → challenger wins (TC-TIE-3)
  const nonCallerTied = tied.filter(p => p.id !== caller)
  if (nonCallerTied.length > 0) {
    // Multiple challengers tie → right of caller in turn order wins (TC-TIE-4)
    for (let i = 1; i <= TURN_ORDER.length; i++) {
      const candidate = TURN_ORDER[(TURN_ORDER.indexOf(caller) + i) % TURN_ORDER.length]
      if (nonCallerTied.some(p => p.id === candidate)) {
        return candidate
      }
    }
  }

  return tied[0].id
}

function assignHands(
  dealer: PlayerId,
  dealerHand: Card[],
  player2Hand: Card[],
  aiHand: Card[]
): { host: Card[]; guest: Card[]; ai: Card[] } {
  if (dealer === 'host') return { host: dealerHand, guest: player2Hand, ai: aiHand }
  if (dealer === 'guest') return { host: player2Hand, guest: dealerHand, ai: aiHand }
  // dealer === 'ai'
  return { host: player2Hand, guest: aiHand, ai: dealerHand }
}

export const initialGameState: GameState = {
  phase: 'LOBBY',
  players: [
    { id: 'host', hand: [], melds: [], secretSets: [], isOpened: false },
    { id: 'guest', hand: [], melds: [], secretSets: [], isOpened: false },
    { id: 'ai', hand: [], melds: [], secretSets: [], isOpened: false },
  ],
  stock: [],
  discardPile: [],
  currentTurn: 'host',
  dealer: 'host',
  hostIsDealer: true,
  dealerFirstTurn: false,
  drawPhase: false,
}

// ─── Chip Calculation ────────────────────────────────────────────────────────

export type ChipCalculationInput = {
  winner: PlayerId
  reason: RoundReason
  totals: Record<PlayerId, number>
  burned: PlayerId[]
  secretSets: Partial<Record<PlayerId, number>>
  winnerAces?: number
  challenged?: boolean
  players: PlayerId[]
}

export type ChipResult = Record<string, number>

export function calculateChips(input: ChipCalculationInput): ChipResult {
  const {
    winner,
    reason,
    burned,
    secretSets,
    winnerAces = 0,
    challenged = false,
    players,
  } = input

  const losers = players.filter(p => p !== winner)

  // Tongit or challenged-draw win pays +3 per loser instead of +1
  const baseChipPerLoser = reason === 'tongit' || (reason === 'draw' && challenged) ? 3 : 1

  const result: Record<string, number> = {}
  players.forEach(p => {
    result[p] = 0
  })

  for (const loser of losers) {
    const isBurned = burned.includes(loser)
    const chips = baseChipPerLoser + (isBurned ? 1 : 0)
    result[winner] += chips
    result[loser] -= chips
  }

  // Ace bonus: +1 per ace held by winner
  result[winner] += winnerAces

  // Secret set bonus: +3 per secret set-of-4
  result[winner] += (secretSets[winner] ?? 0) * 3

  return result
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  // Block all actions except NEXT_ROUND when round is over
  if (state.phase === 'ROUND_END' && action.type !== 'NEXT_ROUND') return state

  switch (action.type) {
    case 'START_GAME': {
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand, stock } = deal(deck)
      const dealer = state.dealer
      const hands = assignHands(dealer, dealerHand, player2Hand, aiHand)
      return {
        ...state,
        phase: getPhaseForTurn(dealer),
        players: [
          { id: 'host', hand: hands.host, melds: [], secretSets: [], isOpened: false },
          { id: 'guest', hand: hands.guest, melds: [], secretSets: [], isOpened: false },
          { id: 'ai', hand: hands.ai, melds: [], secretSets: [], isOpened: false },
        ],
        stock,
        discardPile: [],
        currentTurn: dealer,
        dealerFirstTurn: true,
        drawPhase: false,
        drawRestriction: undefined,
        drawCaller: undefined,
        drawResponses: undefined,
        lastStockDrawer: undefined,
        roundResult: undefined,
      }
    }

    case 'DRAW_FROM_STOCK': {
      if (!state.drawPhase) return state
      if (state.stock.length === 0) return state
      const [topCard, ...remainingStock] = state.stock
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: [...p.hand, topCard] } : p
      )
      return {
        ...state,
        players,
        stock: remainingStock,
        drawPhase: false,
        lastStockDrawer: state.currentTurn,
      }
    }

    case 'DRAW_FROM_DISCARD': {
      if (!state.drawPhase) return state
      if (state.discardPile.length === 0) return state
      const [topCard, ...remainingDiscard] = state.discardPile
      const player = state.players.find(p => p.id === state.currentTurn)
      if (!player) return state
      // Enforce: drawn card must participate in at least one valid NEW meld with ≥2 hand cards
      const combinedHand = [...player.hand, topCard]
      const possibleMelds = detectMelds(combinedHand)
      const meldWithDrawn = possibleMelds.find(m => m.some(c => c.id === topCard.id))
      if (!meldWithDrawn) return state
      // Atomically expose the meld containing the drawn card
      const meldIds = new Set(meldWithDrawn.map(c => c.id))
      const newHand = combinedHand.filter(c => !meldIds.has(c.id))
      const players = state.players.map(p =>
        p.id === state.currentTurn
          ? { ...p, hand: newHand, melds: [...p.melds, meldWithDrawn], isOpened: true }
          : p
      )
      if (newHand.length === 0) {
        return {
          ...state,
          players,
          discardPile: remainingDiscard,
          phase: 'ROUND_END',
          drawPhase: false,
          roundResult: buildRoundResult(players, state.currentTurn, 'tongit'),
        }
      }
      return { ...state, players, discardPile: remainingDiscard, drawPhase: false }
    }

    case 'DISCARD': {
      if (state.drawPhase) return state
      const currentPlayer = state.players.find(p => p.id === state.currentTurn)
      if (!currentPlayer) return state
      const card = currentPlayer.hand.find(c => c.id === action.cardId)
      if (!card) return state

      const newHand = currentPlayer.hand.filter(c => c.id !== action.cardId)
      const players = state.players.map(p =>
        p.id === state.currentTurn ? { ...p, hand: newHand } : p
      )
      const newDiscardPile = [card, ...state.discardPile]

      // Tongit: hand empty after discarding
      if (newHand.length === 0) {
        return {
          ...state,
          players,
          discardPile: newDiscardPile,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, state.currentTurn, 'tongit', getBurnedPlayers(players)),
        }
      }

      // Stock depleted: round ends after this discard
      if (state.stock.length === 0) {
        const burned = getBurnedPlayers(players)
        const openedPlayers = players.filter(p => p.isOpened)
        const scoringPool = openedPlayers.length > 0 ? openedPlayers : players
        const winner = lowestTotalWinner(scoringPool, state.currentTurn, state.lastStockDrawer)
        return {
          ...state,
          players,
          discardPile: newDiscardPile,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, winner, 'stock', burned),
        }
      }

      const next = nextTurn(state.currentTurn)
      return {
        ...state,
        players,
        discardPile: newDiscardPile,
        currentTurn: next,
        phase: getPhaseForTurn(next),
        dealerFirstTurn: false,
        drawPhase: true,
        drawRestriction: undefined,
      }
    }

    case 'LAY_MELD': {
      if (state.drawPhase) return state
      if (state.currentTurn !== action.playerId) return state
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return state

      const cards = action.cardIds
        .map(id => player.hand.find(c => c.id === id))
        .filter(Boolean) as Card[]
      if (cards.length !== action.cardIds.length) return state
      if (!isValidMeld(cards)) return state

      // Ensure no card ID already exists in an existing exposed meld
      const existingMeldIds = new Set(player.melds.flat().map(c => c.id))
      if (action.cardIds.some(id => existingMeldIds.has(id))) return state

      const newHand = player.hand.filter(c => !action.cardIds.includes(c.id))
      const players = state.players.map(p =>
        p.id === action.playerId
          ? { ...p, hand: newHand, melds: [...p.melds, cards], isOpened: true }
          : p
      )

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

    case 'LAY_SECRET_SET': {
      if (state.drawPhase) return state
      if (state.currentTurn !== action.playerId) return state
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return state

      const cards = action.cardIds
        .map(id => player.hand.find(c => c.id === id))
        .filter(Boolean) as Card[]
      if (cards.length !== 4) return state

      // Must be 4 of same rank, all different suits
      const rank = cards[0].rank
      if (!cards.every(c => c.rank === rank)) return state
      const suits = new Set(cards.map(c => c.suit))
      if (suits.size !== 4) return state

      const newHand = player.hand.filter(c => !action.cardIds.includes(c.id))
      const players = state.players.map(p =>
        p.id === action.playerId
          ? { ...p, hand: newHand, secretSets: [...(p.secretSets ?? []), cards], isOpened: true }
          : p
      )

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
      if (state.drawPhase) return state
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

      const isOnOwnMeld = action.targetPlayerId === action.playerId
      const restriction: DrawRestriction = isOnOwnMeld
        ? { playerId: action.playerId, reason: 'self_sapawed' }
        : { playerId: action.targetPlayerId, reason: 'opponent_sapawed' }

      const players = state.players.map(p => {
        if (p.id === action.targetPlayerId && p.id === action.playerId) {
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

      if (newHand.length === 0) {
        return {
          ...state,
          players,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, action.playerId, 'tongit'),
        }
      }

      return { ...state, players, drawRestriction: restriction }
    }

    case 'CALL_DRAW': {
      if (state.currentTurn !== action.playerId) return state
      if (state.phase !== 'PLAYER_TURN') return state
      const caller = state.players.find(p => p.id === action.playerId)
      if (!caller?.isOpened) return state

      // Block if draw restriction applies to this player
      if (state.drawRestriction?.playerId === action.playerId) return state

      const burned = getBurnedPlayers(state.players)
      const winner = lowestTotalWinner(state.players, action.playerId)
      return {
        ...state,
        phase: 'ROUND_END',
        roundResult: buildRoundResult(state.players, winner, 'draw', burned),
      }
    }

    case 'RESPOND_DRAW': {
      if (state.phase !== 'DRAW_RESOLUTION') return state
      if (!state.drawCaller) return state
      if (action.playerId === state.drawCaller) return state

      const newResponses = { ...(state.drawResponses ?? {}), [action.playerId]: action.response }

      const nonCallerPlayers = state.players.filter(p => p.id !== state.drawCaller)
      const allResponded = nonCallerPlayers.every(p => newResponses[p.id] !== undefined)

      if (!allResponded) {
        return { ...state, drawResponses: newResponses }
      }

      const challengers = nonCallerPlayers
        .filter(p => newResponses[p.id] === 'challenge')
        .map(p => p.id)

      const burned = getBurnedPlayers(state.players)

      if (challengers.length === 0) {
        // All folded → caller wins
        return {
          ...state,
          drawResponses: newResponses,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(state.players, state.drawCaller, 'draw', burned),
        }
      }

      // Challenger(s) present — compare totals with tiebreakers
      const winner = resolveDrawChallenge(state.players, state.drawCaller, challengers)
      return {
        ...state,
        drawResponses: newResponses,
        phase: 'ROUND_END',
        roundResult: buildRoundResult(state.players, winner, 'draw', burned),
      }
    }

    case 'END_ROUND': {
      return { ...state, phase: 'ROUND_END' }
    }

    case 'NEXT_ROUND': {
      const newDealer = state.roundResult?.winner ?? state.dealer
      const newHostIsDealer = newDealer === 'host'
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand, stock } = deal(deck)
      const hands = assignHands(newDealer, dealerHand, player2Hand, aiHand)
      return {
        ...state,
        dealer: newDealer,
        hostIsDealer: newHostIsDealer,
        phase: getPhaseForTurn(newDealer),
        players: [
          { id: 'host', hand: hands.host, melds: [], secretSets: [], isOpened: false },
          { id: 'guest', hand: hands.guest, melds: [], secretSets: [], isOpened: false },
          { id: 'ai', hand: hands.ai, melds: [], secretSets: [], isOpened: false },
        ],
        stock,
        discardPile: [],
        currentTurn: newDealer,
        dealerFirstTurn: true,
        drawPhase: false,
        drawRestriction: undefined,
        drawCaller: undefined,
        drawResponses: undefined,
        lastStockDrawer: undefined,
        roundResult: undefined,
      }
    }

    default:
      return state
  }
}
