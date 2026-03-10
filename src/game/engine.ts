import { type Card, createDeck, shuffle, deal } from './deck'
import { handTotal, isValidMeld, canExtendMeld, detectMelds } from './melds'

export type PlayerId = 'host' | 'guest' | 'guest2' | 'bot1' | 'bot2'

export type GameMode = 'solo' | 'duo' | 'trio'

export type GamePhase =
  | 'LOBBY'
  | 'DEALING'
  | 'PLAYER_TURN'
  | 'BOT_TURN'
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
  gameMode: GameMode
  playerNames: Record<PlayerId, string>
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
  nextRoundVotes?: PlayerId[]
}

export type GameAction =
  | { type: 'START_GAME'; gameMode: GameMode; hostName: string; guestNames?: Partial<Record<PlayerId, string>> }
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
  | { type: 'VOTE_NEXT_ROUND'; playerId: PlayerId }

// Turn order depends on game mode:
//   solo:  host → bot1 → bot2 → host (counterclockwise)
//   duo:   host → bot1 → guest → host
//   trio:  host → guest2 → guest → host
function getTurnOrder(mode: GameMode): PlayerId[] {
  if (mode === 'solo') return ['host', 'bot1', 'bot2']
  if (mode === 'duo') return ['host', 'bot1', 'guest']
  return ['host', 'guest2', 'guest']
}

function getPlayersForMode(mode: GameMode): PlayerId[] {
  return getTurnOrder(mode)
}

function getHumanPlayers(mode: GameMode): PlayerId[] {
  if (mode === 'solo') return ['host']
  if (mode === 'duo') return ['host', 'guest']
  return ['host', 'guest', 'guest2']
}

export function selectDealer(mode: GameMode): PlayerId {
  const players = getPlayersForMode(mode)
  return players[Math.floor(Math.random() * players.length)]
}

function nextTurn(current: PlayerId, mode: GameMode): PlayerId {
  const order = getTurnOrder(mode)
  const idx = order.indexOf(current)
  return order[(idx + 1) % order.length]
}

function getPhaseForTurn(turn: PlayerId): GamePhase {
  return (turn === 'bot1' || turn === 'bot2') ? 'BOT_TURN' : 'PLAYER_TURN'
}

function getBurnedPlayers(players: PlayerState[]): PlayerId[] {
  return players.filter(p => !p.isOpened).map(p => p.id)
}

function unmatchedTotal(hand: Card[]): number {
  const melds = detectMelds(hand)
  const meldedIds = new Set(melds.flat().map(c => c.id))
  return handTotal(hand.filter(c => !meldedIds.has(c.id)))
}

function buildRoundResult(
  players: PlayerState[],
  winner: PlayerId,
  reason: RoundReason,
  burned: PlayerId[] = []
): RoundResult {
  const totals = Object.fromEntries(
    players.map(p => [p.id, unmatchedTotal(p.hand)])
  ) as Record<PlayerId, number>
  return { winner, reason, totals, burned }
}

function lowestTotalWinner(
  players: PlayerState[],
  callerTiebreak: PlayerId,
  mode: GameMode,
  lastStockDrawer?: PlayerId
): PlayerId {
  const minTotal = Math.min(...players.map(p => unmatchedTotal(p.hand)))
  const tied = players.filter(p => unmatchedTotal(p.hand) === minTotal)

  if (tied.length === 1) return tied[0].id

  // Tiebreaker 1: last stock drawer wins (TC-TIE-1)
  if (lastStockDrawer !== undefined && tied.some(p => p.id === lastStockDrawer)) {
    return lastStockDrawer
  }

  const turnOrder = getTurnOrder(mode)

  // Tiebreaker 2: next in turn order after the current player (TC-TIE-2)
  for (let i = 1; i <= turnOrder.length; i++) {
    const candidate = turnOrder[(turnOrder.indexOf(callerTiebreak) + i) % turnOrder.length]
    if (tied.some(p => p.id === candidate)) {
      return candidate
    }
  }

  return tied[0].id
}

function resolveDrawChallenge(
  players: PlayerState[],
  caller: PlayerId,
  challengers: PlayerId[],
  mode: GameMode
): PlayerId {
  const participants = players.filter(p => p.id === caller || challengers.includes(p.id))
  const minTotal = Math.min(...participants.map(p => unmatchedTotal(p.hand)))
  const tied = participants.filter(p => unmatchedTotal(p.hand) === minTotal)

  if (tied.length === 1) return tied[0].id

  // If caller is in the tie → challenger wins (TC-TIE-3)
  const nonCallerTied = tied.filter(p => p.id !== caller)
  if (nonCallerTied.length > 0) {
    const turnOrder = getTurnOrder(mode)
    // Multiple challengers tie → right of caller in turn order wins (TC-TIE-4)
    for (let i = 1; i <= turnOrder.length; i++) {
      const candidate = turnOrder[(turnOrder.indexOf(caller) + i) % turnOrder.length]
      if (nonCallerTied.some(p => p.id === candidate)) {
        return candidate
      }
    }
  }

  return tied[0].id
}

// Assigns deal output to the right player IDs based on turn order.
// Dealer gets dealerHand (13 cards), others get p2Hand and p3Hand (12 each).
function assignHands(
  dealer: PlayerId,
  dealerHand: Card[],
  p2Hand: Card[],
  p3Hand: Card[],
  turnOrder: PlayerId[]
): Record<PlayerId, Card[]> {
  const result: Partial<Record<PlayerId, Card[]>> = {}
  const nonDealers = turnOrder.filter(id => id !== dealer)
  result[dealer] = dealerHand
  result[nonDealers[0]] = p2Hand
  result[nonDealers[1]] = p3Hand
  return result as Record<PlayerId, Card[]>
}

const DEFAULT_PLAYER_NAMES: Record<PlayerId, string> = {
  host: 'Host',
  guest: 'Guest',
  guest2: 'Guest 2',
  bot1: 'Bot 1',
  bot2: 'Bot 2',
}

export const initialGameState: GameState = {
  phase: 'LOBBY',
  gameMode: 'solo',
  playerNames: { ...DEFAULT_PLAYER_NAMES },
  players: [
    { id: 'host', hand: [], melds: [], secretSets: [], isOpened: false },
    { id: 'bot1', hand: [], melds: [], secretSets: [], isOpened: false },
    { id: 'bot2', hand: [], melds: [], secretSets: [], isOpened: false },
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
  if (state.phase === 'ROUND_END' && action.type !== 'NEXT_ROUND' && action.type !== 'VOTE_NEXT_ROUND') return state

  switch (action.type) {
    case 'START_GAME': {
      const { gameMode, hostName, guestNames } = action
      const turnOrder = getTurnOrder(gameMode)
      const dealer = selectDealer(gameMode)
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand: p3Hand, stock } = deal(deck)
      const hands = assignHands(dealer, dealerHand, player2Hand, p3Hand, turnOrder)

      const playerNames: Record<PlayerId, string> = {
        ...DEFAULT_PLAYER_NAMES,
        host: hostName,
        ...guestNames,
      }

      return {
        ...state,
        gameMode,
        playerNames,
        phase: getPhaseForTurn(dealer),
        players: turnOrder.map(id => ({
          id,
          hand: hands[id],
          melds: [],
          secretSets: [],
          isOpened: false,
        })),
        stock,
        discardPile: [],
        currentTurn: dealer,
        dealer,
        hostIsDealer: dealer === 'host',
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
        const winner = lowestTotalWinner(scoringPool, state.currentTurn, state.gameMode, state.lastStockDrawer)
        return {
          ...state,
          players,
          discardPile: newDiscardPile,
          phase: 'ROUND_END',
          roundResult: buildRoundResult(players, winner, 'stock', burned),
        }
      }

      const next = nextTurn(state.currentTurn, state.gameMode)
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
      const winner = lowestTotalWinner(state.players, action.playerId, state.gameMode)
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
      const winner = resolveDrawChallenge(state.players, state.drawCaller, challengers, state.gameMode)
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

    case 'VOTE_NEXT_ROUND': {
      const existing = state.nextRoundVotes ?? []
      if (existing.includes(action.playerId)) return state
      const updated = [...existing, action.playerId]
      const humanPlayers = getHumanPlayers(state.gameMode)
      const allVoted = humanPlayers.every(p => updated.includes(p))
      if (!allVoted) return { ...state, nextRoundVotes: updated }

      // All humans voted — start next round
      const newDealer = state.roundResult?.winner ?? state.dealer
      const turnOrder = getTurnOrder(state.gameMode)
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand: p3Hand, stock } = deal(deck)
      const hands = assignHands(newDealer, dealerHand, player2Hand, p3Hand, turnOrder)
      return {
        ...state,
        dealer: newDealer,
        hostIsDealer: newDealer === 'host',
        phase: getPhaseForTurn(newDealer),
        players: turnOrder.map(id => ({
          id,
          hand: hands[id],
          melds: [],
          secretSets: [],
          isOpened: false,
        })),
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
        nextRoundVotes: undefined,
      }
    }

    case 'NEXT_ROUND': {
      const newDealer = state.roundResult?.winner ?? state.dealer
      const turnOrder = getTurnOrder(state.gameMode)
      const deck = shuffle(createDeck())
      const { dealerHand, player2Hand, aiHand: p3Hand, stock } = deal(deck)
      const hands = assignHands(newDealer, dealerHand, player2Hand, p3Hand, turnOrder)
      return {
        ...state,
        dealer: newDealer,
        hostIsDealer: newDealer === 'host',
        phase: getPhaseForTurn(newDealer),
        players: turnOrder.map(id => ({
          id,
          hand: hands[id],
          melds: [],
          secretSets: [],
          isOpened: false,
        })),
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
        nextRoundVotes: undefined,
      }
    }

    default:
      return state
  }
}
