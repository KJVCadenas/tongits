import { describe, it, expect } from 'vitest'
import { createDeck, deal, shuffle } from './deck'
import type { Card, Rank, Suit } from './deck'
import { getCardValue, handTotal, isValidMeld, canExtendMeld, detectMelds } from './melds'
import {
  gameReducer,
  initialGameState,
  calculateChips,
  selectDealer,
} from './engine'
import type { GameState, PlayerId } from './engine'
import type { NetworkMessage } from '../network/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function card(rank: Rank, suit: Suit): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...initialGameState, ...overrides }
}

// ─── 1. Game Setup ───────────────────────────────────────────────────────────

describe('TC-SETUP-1 — Correct player count', () => {
  it('initializes with exactly 3 players', () => {
    expect(initialGameState.players).toHaveLength(3)
  })
})

describe('TC-SETUP-2 — Deck composition', () => {
  it('creates 52 cards with no jokers', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    // 4 suits × 13 ranks, all unique ids
    const ids = deck.map(c => c.id)
    expect(new Set(ids).size).toBe(52)
    // No jokers — only standard ranks
    const validRanks = new Set(['A','2','3','4','5','6','7','8','9','10','J','Q','K'])
    deck.forEach(c => expect(validRanks.has(c.rank)).toBe(true))
  })
})

describe('TC-SETUP-3 — Initial dealing', () => {
  it('deals 13 to dealer, 12 to others, rest becomes stock', () => {
    const deck = createDeck()
    const result = deal(deck)
    expect(result.dealerHand).toHaveLength(13)
    expect(result.player2Hand).toHaveLength(12)
    expect(result.aiHand).toHaveLength(12)
    expect(result.stock).toHaveLength(52 - 13 - 12 - 12)
  })
})

describe('TC-SETUP-4 — Dealer selection (first round random)', () => {
  it('selects a valid player as dealer randomly in solo mode', () => {
    const validDealers: PlayerId[] = ['host', 'bot1', 'bot2']
    const dealer = selectDealer('solo')
    expect(validDealers).toContain(dealer)
  })

  it('selects a valid player as dealer randomly in duo mode', () => {
    const validDealers: PlayerId[] = ['host', 'bot1', 'guest']
    const dealer = selectDealer('duo')
    expect(validDealers).toContain(dealer)
  })

  it('selects a valid player as dealer randomly in trio mode', () => {
    const validDealers: PlayerId[] = ['host', 'guest2', 'guest']
    const dealer = selectDealer('trio')
    expect(validDealers).toContain(dealer)
  })
})

describe('TC-SETUP-5 — Next dealer is previous winner', () => {
  it('makes the previous round winner the dealer for the next round', () => {
    const state = makeState({
      phase: 'ROUND_END',
      roundResult: { winner: 'bot1', reason: 'stock', totals: { host: 10, bot1: 5, bot2: 8 } },
    })
    const next = gameReducer(state, { type: 'NEXT_ROUND' })
    expect(next.dealer).toBe('bot1')
  })
})

// ─── 2. Card Value Rules ─────────────────────────────────────────────────────

describe('TC-VALUE-1 — Ace value', () => {
  it('Ace has value 1', () => {
    expect(getCardValue('A')).toBe(1)
  })
})

describe('TC-VALUE-2 — Face cards', () => {
  it('J, Q, K each have value 10', () => {
    expect(getCardValue('J')).toBe(10)
    expect(getCardValue('Q')).toBe(10)
    expect(getCardValue('K')).toBe(10)
  })
})

describe('TC-VALUE-3 — Numeric cards', () => {
  it('cards 2-10 have their face value', () => {
    for (let n = 2; n <= 10; n++) {
      expect(getCardValue(String(n) as Rank)).toBe(n)
    }
  })
})

// ─── 3. Meld Validation ──────────────────────────────────────────────────────

describe('TC-MELD-1 — Valid run', () => {
  it('accepts 3+ consecutive same-suit cards as a run', () => {
    const run3 = [card('3','S'), card('4','S'), card('5','S')]
    expect(isValidMeld(run3)).toBe(true)

    const run5 = [card('7','H'), card('8','H'), card('9','H'), card('10','H'), card('J','H')]
    expect(isValidMeld(run5)).toBe(true)
  })
})

describe('TC-MELD-2 — Invalid run (A-K-Q wrap-around)', () => {
  it('rejects A-K-Q as a run (no wrap-around)', () => {
    const wrap = [card('A','S'), card('K','S'), card('Q','S')]
    expect(isValidMeld(wrap)).toBe(false)
  })
})

describe('TC-MELD-3 — Valid set', () => {
  it('accepts 3 or 4 cards of same rank as a set', () => {
    const set3 = [card('7','S'), card('7','H'), card('7','D')]
    expect(isValidMeld(set3)).toBe(true)

    const set4 = [card('K','S'), card('K','H'), card('K','D'), card('K','C')]
    expect(isValidMeld(set4)).toBe(true)
  })
})

describe('TC-MELD-4 — Single card reuse', () => {
  it('a card used in one meld cannot be part of another meld', () => {
    // 5S is used in both a run and a set - isValidMeld checks individual melds
    // The engine ensures no card is in two exposed melds simultaneously
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      players: [
        {
          id: 'host',
          hand: [card('5','S'), card('5','H'), card('5','D')],
          melds: [[card('5','S'), card('6','S'), card('7','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    // 5S is already in a meld; attempting to lay a meld with a card not in hand should fail
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['5S', '5H', '5D'] })
    // 5S is not in hand (it's in melds), so the action should be rejected
    expect(next).toEqual(state)
  })
})

describe('TC-MELD-5 — Secret set-of-4', () => {
  it('4-of-same-rank placed face-down counts as open meld and is eligible for secret bonus', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      players: [
        {
          id: 'host',
          hand: [card('Q','S'), card('Q','H'), card('Q','D'), card('Q','C'), card('A','S')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'LAY_SECRET_SET',
      playerId: 'host',
      cardIds: ['QS', 'QH', 'QD', 'QC'],
    })
    const host = next.players.find(p => p.id === 'host')!
    expect(host.isOpened).toBe(true)
    expect(host.secretSets).toHaveLength(1)
    expect(host.hand).toHaveLength(1)
  })
})

// ─── 4. Turn Flow — Draw Phase ───────────────────────────────────────────────

describe('TC-TURN-1 — Draw required before other actions', () => {
  it('player cannot discard before drawing', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('3','S')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next).toEqual(state) // action rejected
  })
})

describe('TC-TURN-2 — Draw from stock', () => {
  it('adds top stock card to current player hand', () => {
    const topCard = card('K','C')
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [topCard, card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_STOCK' })
    const host = next.players.find(p => p.id === 'host')!
    expect(host.hand).toContainEqual(topCard)
    expect(next.stock).toHaveLength(1)
    expect(next.drawPhase).toBe(false)
  })
})

describe('TC-TURN-3 — Draw from discard (valid)', () => {
  it('allows picking discard when it completes a new meld with 2+ hand cards, and exposes meld immediately', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('4','S'), card('5','S')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [card('6','S'), card('9','D')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    const host = next.players.find(p => p.id === 'host')!
    expect(host.isOpened).toBe(true)
    expect(host.melds).toHaveLength(1)
    expect(next.drawPhase).toBe(false)
  })
})

describe('TC-TURN-4 — Draw from discard (invalid)', () => {
  it('rejects discard draw when it does not form a new meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('4','S'), card('5','H')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [card('K','D')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    expect(next).toEqual(state)
  })
})

describe('TC-TURN-5 — Discard pickup restriction (layoff only)', () => {
  it('rejects discard draw when the card would only be used for layoff, not new meld', () => {
    // host has an exposed meld [3S,4S,5S]; discard is 6S which extends that meld but
    // does NOT form a NEW meld with ≥2 hand cards
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('A','H'), card('2','D')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [card('6','S')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    expect(next).toEqual(state)
  })
})

// ─── 4. Turn Flow — Expose Melds ────────────────────────────────────────────

describe('TC-TURN-6 — Opening hand', () => {
  it('player status becomes opened after exposing ≥1 meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('3','S'), card('4','S'), card('5','S'), card('K','H')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['3S','4S','5S'] })
    const host = next.players.find(p => p.id === 'host')!
    expect(host.isOpened).toBe(true)
  })
})

describe('TC-TURN-7 — Hidden meld protection', () => {
  it('secret set-of-3 in hand is detected and excluded from unmatched score', () => {
    const hand = [card('K','S'), card('K','H'), card('K','D'), card('2','C')]
    const melds = detectMelds(hand)
    const meldedIds = new Set(melds.flat().map(c => c.id))
    const unmatched = hand.filter(c => !meldedIds.has(c.id))
    // Three Kings form a set → excluded; only 2C remains unmatched
    expect(unmatched).toHaveLength(1)
    expect(handTotal(unmatched)).toBe(2)
  })

  it('secret set-of-4 in hand scores 0 unmatched points', () => {
    const hand = [card('8','S'), card('8','H'), card('8','D'), card('8','C')]
    const melds = detectMelds(hand)
    const meldedIds = new Set(melds.flat().map(c => c.id))
    const unmatched = hand.filter(c => !meldedIds.has(c.id))
    expect(unmatched).toHaveLength(0)
    expect(handTotal(unmatched)).toBe(0)
  })

  it('secret sequence in hand is excluded from unmatched score', () => {
    const hand = [card('5','S'), card('6','S'), card('7','S'), card('K','H')]
    const melds = detectMelds(hand)
    const meldedIds = new Set(melds.flat().map(c => c.id))
    const unmatched = hand.filter(c => !meldedIds.has(c.id))
    // 5-6-7 of spades is a sequence → only KH unmatched
    expect(unmatched).toHaveLength(1)
    expect(handTotal(unmatched)).toBe(10)
  })

  it('round result totals exclude secret melds held in hand', () => {
    // Host holds three 10s (a valid set) + one stray card; should score only the stray
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('10','S'), card('10','H'), card('10','D'), card('3','C')],
          melds: [],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: true },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: true },
      ],
      stock: [],
      discardPile: [],
    })
    // Host discards the 3C; now hand = [10S,10H,10D] which is a full secret set → 0 unmatched
    const next = gameReducer(state, { type: 'DISCARD', cardId: '3C' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.totals['host']).toBe(0)
    // Host wins with 0 pts vs bot1 10 pts and bot2 7 pts
    expect(next.roundResult?.winner).toBe('host')
  })

  it('secret meld beats higher raw total — player with secret set scores lower than non-meld holder', () => {
    // Guest holds a secret set-of-3 Kings (raw 30 pts, but unmatched = 0)
    // Host has a stray 5C (5 pts unmatched), bot1 has 2C+3H and discards one
    // Without the fix, guest would appear to have 30 pts and lose; with fix guest wins with 0 pts
    const state = makeState({
      gameMode: 'duo',
      phase: 'PLAYER_TURN',
      currentTurn: 'bot1',
      drawPhase: false,
      players: [
        { id: 'host',  hand: [card('5','C')], melds: [], isOpened: true },
        {
          id: 'guest',
          hand: [card('K','S'), card('K','H'), card('K','D')], // secret set → 0 pts
          melds: [],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('2','C'), card('3','H')], melds: [], isOpened: true }, // keeps 3H (3 pts)
      ],
      stock: [],
      discardPile: [card('2','H')],
    })
    // bot1 discards 2C; remaining hand = [3H] = 3 pts unmatched
    const next = gameReducer(state, { type: 'DISCARD', cardId: '2C' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.totals['guest']).toBe(0)  // secret set counts 0
    expect(next.roundResult?.totals['host']).toBe(5)
    expect(next.roundResult?.totals['bot1']).toBe(3)
    expect(next.roundResult?.winner).toBe('guest')
  })
})

// ─── 4. Turn Flow — Layoff / Sapaw ───────────────────────────────────────────

describe('TC-TURN-8 — Layoff allowed on any exposed meld', () => {
  it('attaches a card to an existing exposed meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('6','S'), card('K','H')],
          melds: [],
          isOpened: false,
        },
        {
          id: 'bot1',
          hand: [card('A','C')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    const bot1 = next.players.find(p => p.id === 'bot1')!
    expect(bot1.melds[0]).toHaveLength(4)
    const host = next.players.find(p => p.id === 'host')!
    expect(host.hand).toHaveLength(1)
  })
})

describe('TC-TURN-9 — Layoff allowed without player having opened', () => {
  it('player can sapaw an opponent meld without having opened themselves', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('6','S'), card('K','H')],
          melds: [],
          isOpened: false, // not opened
        },
        {
          id: 'bot1',
          hand: [],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    // action should succeed
    const host = next.players.find(p => p.id === 'host')!
    expect(host.hand).toHaveLength(1) // 6S was sapawed
  })
})

describe('TC-TURN-10 — Opponent meld layoff restricts Draw call for opponent', () => {
  it('opponent cannot call Draw if the current player laid off on their meld last turn', () => {
    // host laid off on guest's meld; guest cannot call Draw on their next turn
    const state = makeState({
      gameMode: 'duo',
      phase: 'PLAYER_TURN',
      currentTurn: 'guest',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('K','S')], melds: [], isOpened: false },
        {
          id: 'guest',
          hand: [card('A','S'), card('2','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawRestriction: { playerId: 'guest', reason: 'opponent_sapawed' },
    })
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'guest' })
    expect(next.phase).not.toBe('ROUND_END') // draw call blocked
    expect(next).toEqual(state)
  })
})

describe('TC-TURN-11 — Self meld layoff restricts Draw call', () => {
  it('player cannot call Draw if they laid off on their own meld last turn', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawRestriction: { playerId: 'host', reason: 'self_sapawed' },
    })
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'host' })
    expect(next).toEqual(state)
  })
})

// ─── 4. Turn Flow — Discard Phase ───────────────────────────────────────────

describe('TC-TURN-12 — Discard required', () => {
  it('player must discard exactly 1 card to end their turn', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('3','D')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next.discardPile[0].id).toBe('AS')
    const host = next.players.find(p => p.id === 'host')!
    expect(host.hand).toHaveLength(1)
  })
})

describe('TC-TURN-13 — Tongit exception skips discard', () => {
  it('player with no remaining unmatched cards wins instantly without discarding', () => {
    const state2 = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const next2 = gameReducer(state2, { type: 'DISCARD', cardId: 'AS' })
    expect(next2.phase).toBe('ROUND_END')
    expect(next2.roundResult?.winner).toBe('host')
    expect(next2.roundResult?.reason).toBe('tongit')
  })
})

// ─── 5. End Conditions — Stock Exhausted ────────────────────────────────────

describe('TC-END-1 — Round terminates when stock empties', () => {
  it('ends round after last drawer finishes turn when stock is empty', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','H')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('K','D')],
          melds: [],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.reason).toBe('stock')
  })
})

describe('TC-END-2 — Burned players (never opened)', () => {
  it('marks players who never opened as burned when round ends', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('K','D'), card('Q','D')],
          melds: [],
          isOpened: false, // never opened — will be burned
        },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.burned).toContain('bot1')
    expect(next.roundResult?.burned).toContain('bot2')
  })
})

describe('TC-END-3 — Lowest unmatched points wins', () => {
  it('player with lowest unmatched hand total wins', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','H')], // 3 points
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('K','D')], // 10 points
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot2',
          hand: [card('7','C')], // 7 points
          melds: [],
          isOpened: true,
        },
      ],
      stock: [],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    // After discarding, host has [2H] = 2 points; winner has lowest total
    expect(next.roundResult?.winner).toBe('host')
  })
})

describe('TC-END-4 — Tongit declaration', () => {
  it('player with no unmatched cards wins instantly', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('5','S'), card('6','S'), card('7','S')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['5S','6S','7S'] })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('host')
    expect(next.roundResult?.reason).toBe('tongit')
  })
})

describe('TC-END-5 — Valid draw call', () => {
  it('opened player may call Draw at start of their turn', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: true },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'host' })
    expect(next.phase).toBe('ROUND_END')
  })
})

describe('TC-END-6 — Invalid draw call after self sapaw', () => {
  it('player cannot call Draw if they laid off on their own meld last turn', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawRestriction: { playerId: 'host', reason: 'self_sapawed' },
    })
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'host' })
    expect(next).toEqual(state)
  })
})

describe('TC-END-7 — Opponent laid-off on caller meld', () => {
  it('caller cannot call Draw if an opponent laid off on their exposed meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('A','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawRestriction: { playerId: 'host', reason: 'opponent_sapawed' },
    })
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'host' })
    expect(next).toEqual(state)
  })
})

// ─── 6. Draw Resolution ──────────────────────────────────────────────────────

describe('TC-DRAW-1 — All fold → caller wins', () => {
  it('caller wins if all opponents fold', () => {
    // After CALL_DRAW, opponents respond with FOLD_DRAW
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','H')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'fold' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('host')
    expect(next.roundResult?.reason).toBe('draw')
  })
})

describe('TC-DRAW-2 — Challenge compares unmatched card points', () => {
  it('when ≥1 opponent challenges, compare unmatched totals', () => {
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('A','S'), card('2','H')], // 3 points unmatched
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('K','D')], // 10 points — challenger loses
          melds: [],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    // host has 3 pts, bot1 has 10 pts → host wins
    expect(next.roundResult?.winner).toBe('host')
  })
})

describe('TC-DRAW-3 — Lowest score wins draw resolution', () => {
  it('player with lowest unmatched total wins the draw', () => {
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('K','S'), card('Q','H')], // 20 points
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('2','D')], // 2 points — challenger wins
          melds: [],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('bot1')
  })
})

// ─── 7. Tiebreakers ──────────────────────────────────────────────────────────

describe('TC-TIE-1 — Stock exhaustion tie: last stock drawer wins', () => {
  it('when tie on stock exhaustion, last stock drawer wins', () => {
    // host drew last from stock (lastStockDrawer: 'host') and ties with bot1
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      lastStockDrawer: 'host',
      players: [
        {
          id: 'host',
          hand: [card('5','S')], // 5 points
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('5','H')], // 5 points — tie
          melds: [],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('K','C')], melds: [], isOpened: true },
      ],
      stock: [],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: '5S' })
    // host and bot1 tie; host was last stock drawer → host wins
    expect(next.roundResult?.winner).toBe('host')
  })
})

describe('TC-TIE-2 — Non-stock-exhaustion tie: next in turn order wins', () => {
  it('when two non-last-drawer players tie, player next in turn order wins', () => {
    // Draw call with tie between bot1 and guest; host is caller
    // solo turn order: host → bot1 → bot2; if caller is host, next in order after host = bot1
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('K','S'), card('Q','H')], // 20 pts
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('5','C')], // 5 pts — tie with bot2
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot2',
          hand: [card('5','D')], // 5 pts — tie with bot1
          melds: [],
          isOpened: true,
        },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'challenge' })
    // bot1 and bot2 both tie at 5 pts; solo turn order after host is bot1 → bot1 wins
    expect(next.roundResult?.winner).toBe('bot1')
  })
})

describe('TC-TIE-3 — Caller vs challenger tie: challenger wins', () => {
  it('when caller and challenger tie, challenger wins', () => {
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('5','S')], // 5 pts
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('5','H')], // 5 pts — tie with caller
          melds: [],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('K','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'fold' })
    // caller (host) ties with challenger (bot1) → challenger wins
    expect(next.roundResult?.winner).toBe('bot1')
  })
})

describe('TC-TIE-4 — Two challengers tie: challenger right of caller wins', () => {
  it('when two challengers tie, the one right of caller in turn order wins', () => {
    // solo turn order: host → bot1 → bot2; caller = host; right of caller = bot1 (first after host)
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('K','S'), card('Q','H')], // 20 pts
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot1',
          hand: [card('5','C')], // 5 pts — ties with bot2
          melds: [],
          isOpened: true,
        },
        {
          id: 'bot2',
          hand: [card('5','D')], // 5 pts — ties with bot1
          melds: [],
          isOpened: true,
        },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'challenge' })
    // bot1 is right of caller (host) in solo turn order; bot1 wins tie
    expect(next.roundResult?.winner).toBe('bot1')
  })
})

// ─── 8. Lose Conditions ──────────────────────────────────────────────────────

describe('TC-LOSE-1 — Higher unmatched score loses', () => {
  it('player with higher unmatched total loses scoring comparison', () => {
    // Verified implicitly by TC-END-3 and TC-DRAW-3
    const hand1 = [card('K','S')] // 10 pts
    const hand2 = [card('2','D')] // 2 pts
    expect(handTotal(hand1)).toBeGreaterThan(handTotal(hand2))
  })
})

describe('TC-LOSE-2 — Burn penalty', () => {
  it('burned player causes loser extra chip penalty in scoring', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 3, guest: 15, bot1: 20 },
      burned: ['guest', 'bot1'],
      secretSets: {},
      players: ['host', 'guest', 'bot1'],
    })
    // base: +1 per loser = +2; burn bonus: +1 per burned = +2; total for host = +4
    expect(result.host).toBeGreaterThanOrEqual(4)
    expect(result.guest).toBeLessThan(0)
    expect(result.bot1).toBeLessThan(0)
  })
})

describe('TC-LOSE-3 — Draw fold causes loss', () => {
  it('player who folds loses the round', () => {
    const afterCallState = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        {
          id: 'host',
          hand: [card('A','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'fold' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'bot2', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    const chips = calculateChips({
      winner: next.roundResult!.winner,
      reason: next.roundResult!.reason,
      totals: next.roundResult!.totals,
      burned: next.roundResult!.burned ?? [],
      secretSets: {},
      players: ['host', 'bot1', 'bot2'],
    })
    expect(chips.bot1).toBeLessThan(0)
    expect(chips.bot2).toBeLessThan(0)
  })
})

// ─── 9. Scoring ──────────────────────────────────────────────────────────────

describe('TC-SCORE-1 — Base win: +1 chip per loser', () => {
  it('winner gains +1 chip per losing player in standard win', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 1, bot1: 10, bot2: 8 },
      burned: [],
      secretSets: {},
      players: ['host', 'bot1', 'bot2'],
    })
    expect(result.host).toBe(2) // +1 per loser (2 losers)
    expect(result.bot1).toBe(-1)
    expect(result.bot2).toBe(-1)
  })
})

describe('TC-SCORE-2 — Ace bonus: +1 chip per Ace held', () => {
  it('winner gains +1 chip for each Ace in their hand', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 2, bot1: 10, bot2: 8 },
      burned: [],
      secretSets: {},
      winnerAces: 2,
      players: ['host', 'bot1', 'bot2'],
    })
    // base +2, ace bonus +2 = +4
    expect(result.host).toBe(4)
  })
})

describe('TC-SCORE-3 — Burn bonus: +1 extra chip per burned loser', () => {
  it('winner gains +1 extra chip for each burned player', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 1, bot1: 10, bot2: 8 },
      burned: ['bot1'],
      secretSets: {},
      players: ['host', 'bot1', 'bot2'],
    })
    // base +2 (2 losers), burn bonus +1 (1 burned) = +3
    expect(result.host).toBe(3)
    expect(result.bot1).toBe(-2) // normal -1 + burn penalty -1
    expect(result.bot2).toBe(-1)
  })
})

describe('TC-SCORE-4 — Secret set bonus: +3 chips per secret set-of-4', () => {
  it('winner gains +3 chips per secret set-of-4', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 1, bot1: 10, bot2: 8 },
      burned: [],
      secretSets: { host: 1 },
      players: ['host', 'bot1', 'bot2'],
    })
    // base +2, secret set +3 = +5
    expect(result.host).toBe(5)
  })
})

describe('TC-SCORE-5 — Tongit bonus: +3 chips instead of base +1', () => {
  it('winner gains +3 chips per loser on Tongit win instead of +1', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'tongit',
      totals: { host: 0, bot1: 10, bot2: 8 },
      burned: [],
      secretSets: {},
      players: ['host', 'bot1', 'bot2'],
    })
    // tongit: +3 per loser (2 losers) = +6
    expect(result.host).toBe(6)
    expect(result.bot1).toBe(-3)
    expect(result.bot2).toBe(-3)
  })
})

describe('TC-SCORE-6 — Draw challenge win bonus: +3 chips instead of base +1', () => {
  it('winner of challenged Draw gains +3 chips per loser instead of +1', () => {
    const result = calculateChips({
      winner: 'bot1', // challenger wins
      reason: 'draw',
      totals: { host: 20, bot1: 2, bot2: 8 },
      burned: [],
      secretSets: {},
      challenged: true,
      players: ['host', 'bot1', 'bot2'],
    })
    // challenged draw win: +3 per loser = +6
    expect(result.bot1).toBe(6)
    expect(result.host).toBe(-3)
    expect(result.bot2).toBe(-3)
  })
})

describe('TC-DISCARD-MELDS — Discard does not wipe player melds', () => {
  it('keeps laid melds intact after a discard', () => {
    const meldCards = [card('A', 'S'), card('A', 'H'), card('A', 'C')]
    const state = makeState({
      currentTurn: 'host',
      phase: 'PLAYER_TURN',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('5', 'H'), card('6', 'C')], melds: [meldCards], isOpened: true },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: '5H' })
    const host = next.players.find(p => p.id === 'host')!
    expect(host.melds).toHaveLength(1)
    expect(host.melds[0]).toHaveLength(3)
    expect(host.hand).toHaveLength(1)
    expect(host.hand[0].id).toBe('6C')
  })
})

describe('TC-BOT-DRAW — DRAW_FROM_DISCARD rejected when top card forms no meld', () => {
  it('returns unchanged state when top discard cannot form a valid meld with bot hand', () => {
    const state = makeState({
      currentTurn: 'bot1',
      phase: 'BOT_TURN',
      drawPhase: true,
      players: [
        { id: 'host', hand: [], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('2', 'H'), card('7', 'S'), card('K', 'C')], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      discardPile: [card('A', 'D')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    expect(next).toBe(state)
  })
})

// ─── Deck — shuffle ──────────────────────────────────────────────────────────

describe('TC-DECK-SHUFFLE-1 — shuffle preserves all cards', () => {
  it('returns a deck with the same 52 cards in a different order', () => {
    const deck = createDeck()
    const shuffled = shuffle(deck)
    expect(shuffled).toHaveLength(deck.length)
    const sortById = (a: Card, b: Card) => a.id.localeCompare(b.id)
    expect([...shuffled].sort(sortById)).toEqual([...deck].sort(sortById))
  })
})

describe('TC-DECK-SHUFFLE-2 — shuffle returns a new array', () => {
  it('does not mutate or return the original array reference', () => {
    const deck = createDeck()
    const shuffled = shuffle(deck)
    expect(shuffled).not.toBe(deck)
  })
})

describe('TC-DECK-SHUFFLE-3 — shuffle produces different orderings', () => {
  it('two independent shuffles of a 52-card deck are rarely identical', () => {
    const deck = createDeck()
    const a = shuffle(deck)
    const b = shuffle(deck)
    const same = a.every((c, i) => c.id === b[i].id)
    expect(same).toBe(false)
  })
})

// ─── Melds — canExtendMeld ───────────────────────────────────────────────────

describe('TC-MELD-EXT-1 — canExtendMeld rejects empty meld', () => {
  it('returns false for an empty meld', () => {
    expect(canExtendMeld(card('A', 'S'), [])).toBe(false)
  })
})

describe('TC-MELD-EXT-2 — canExtendMeld extends a set', () => {
  it('accepts a card of the same rank with a new suit', () => {
    const meld = [card('7', 'S'), card('7', 'H'), card('7', 'D')]
    expect(canExtendMeld(card('7', 'C'), meld)).toBe(true)
  })
})

describe('TC-MELD-EXT-3 — canExtendMeld rejects wrong rank for set', () => {
  it('returns false when card rank does not match the set', () => {
    const meld = [card('7', 'S'), card('7', 'H'), card('7', 'D')]
    expect(canExtendMeld(card('8', 'C'), meld)).toBe(false)
  })
})

describe('TC-MELD-EXT-4 — canExtendMeld rejects duplicate suit in set', () => {
  it('returns false when the suit is already present in the set', () => {
    const meld = [card('7', 'S'), card('7', 'H'), card('7', 'D')]
    expect(canExtendMeld(card('7', 'D'), meld)).toBe(false)
  })
})

describe('TC-MELD-EXT-5 — canExtendMeld rejects extending a full set', () => {
  it('returns false when set already has 4 cards', () => {
    const meld = [card('7', 'S'), card('7', 'H'), card('7', 'D'), card('7', 'C')]
    expect(canExtendMeld(card('7', 'S'), meld)).toBe(false)
  })
})

describe('TC-MELD-EXT-6 — canExtendMeld extends a sequence on the low end', () => {
  it('accepts a card one rank below the lowest in the sequence', () => {
    const meld = [card('5', 'H'), card('6', 'H'), card('7', 'H')]
    expect(canExtendMeld(card('4', 'H'), meld)).toBe(true)
  })
})

describe('TC-MELD-EXT-7 — canExtendMeld extends a sequence on the high end', () => {
  it('accepts a card one rank above the highest in the sequence', () => {
    const meld = [card('5', 'H'), card('6', 'H'), card('7', 'H')]
    expect(canExtendMeld(card('8', 'H'), meld)).toBe(true)
  })
})

describe('TC-MELD-EXT-8 — canExtendMeld rejects wrong suit for sequence', () => {
  it('returns false when card suit does not match the sequence', () => {
    const meld = [card('5', 'H'), card('6', 'H'), card('7', 'H')]
    expect(canExtendMeld(card('8', 'S'), meld)).toBe(false)
  })
})

describe('TC-MELD-EXT-9 — canExtendMeld rejects non-adjacent card for sequence', () => {
  it('returns false when card does not connect to either end', () => {
    const meld = [card('5', 'H'), card('6', 'H'), card('7', 'H')]
    expect(canExtendMeld(card('9', 'H'), meld)).toBe(false)
  })
})

// ─── 10. Game Modes ──────────────────────────────────────────────────────────

describe('TC-MODE-1 — Solo mode players', () => {
  it('START_GAME with solo mode creates host, bot1, bot2 players', () => {
    const state = makeState({ dealer: 'host' })
    const next = gameReducer(state, {
      type: 'START_GAME',
      gameMode: 'solo',
      hostName: 'Alice',
    })
    const ids = next.players.map(p => p.id)
    expect(ids).toContain('host')
    expect(ids).toContain('bot1')
    expect(ids).toContain('bot2')
    expect(ids).not.toContain('guest')
    expect(ids).not.toContain('guest2')
  })
})

describe('TC-MODE-2 — Duo mode players', () => {
  it('START_GAME with duo mode creates host, bot1, guest players', () => {
    const state = makeState({ dealer: 'host' })
    const next = gameReducer(state, {
      type: 'START_GAME',
      gameMode: 'duo',
      hostName: 'Alice',
      guestNames: { guest: 'Bob' },
    })
    const ids = next.players.map(p => p.id)
    expect(ids).toContain('host')
    expect(ids).toContain('bot1')
    expect(ids).toContain('guest')
    expect(ids).not.toContain('bot2')
    expect(ids).not.toContain('guest2')
  })
})

describe('TC-MODE-3 — Trio mode players', () => {
  it('START_GAME with trio mode creates host, guest2, guest players', () => {
    const state = makeState({ dealer: 'host' })
    const next = gameReducer(state, {
      type: 'START_GAME',
      gameMode: 'trio',
      hostName: 'Alice',
      guestNames: { guest: 'Bob', guest2: 'Carol' },
    })
    const ids = next.players.map(p => p.id)
    expect(ids).toContain('host')
    expect(ids).toContain('guest')
    expect(ids).toContain('guest2')
    expect(ids).not.toContain('bot1')
    expect(ids).not.toContain('bot2')
  })
})

describe('TC-MODE-4 — playerNames populated from START_GAME', () => {
  it('host name and guest names are stored in playerNames', () => {
    const state = makeState({ dealer: 'host' })
    const next = gameReducer(state, {
      type: 'START_GAME',
      gameMode: 'duo',
      hostName: 'Alice',
      guestNames: { guest: 'Bob' },
    })
    expect(next.playerNames.host).toBe('Alice')
    expect(next.playerNames.guest).toBe('Bob')
    expect(next.playerNames.bot1).toBe('Bot 1') // default
  })
})

describe('TC-MODE-5 — BOT_TURN phase for bot player', () => {
  it('phase transitions to BOT_TURN when it is a bot\'s turn', () => {
    // solo: host → bot1 → bot2; after host discards, turn goes to bot1
    const state = makeState({
      gameMode: 'solo',
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next.phase).toBe('BOT_TURN')
    expect(next.currentTurn).toBe('bot1')
  })
})

describe('TC-MODE-6 — VOTE_NEXT_ROUND: solo only needs host', () => {
  it('next round starts after only host votes in solo mode', () => {
    const state = makeState({
      gameMode: 'solo',
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'stock', totals: { host: 0, bot1: 10, bot2: 8 } },
    })
    const next = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    // Solo: only host is human → all humans voted → advance to next round
    expect(next.phase).not.toBe('ROUND_END')
  })
})

describe('TC-MODE-7 — VOTE_NEXT_ROUND: duo needs host and guest', () => {
  it('next round does not start until both host and guest vote in duo mode', () => {
    const state = makeState({
      gameMode: 'duo',
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'stock', totals: { host: 0, bot1: 10, guest: 8 } },
    })
    const afterHost = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    // Not all voted yet
    expect(afterHost.phase).toBe('ROUND_END')
    const afterBoth = gameReducer(afterHost, { type: 'VOTE_NEXT_ROUND', playerId: 'guest' })
    // Now all humans voted → next round
    expect(afterBoth.phase).not.toBe('ROUND_END')
  })
})

describe('TC-MODE-8 — VOTE_NEXT_ROUND: trio needs host, guest, guest2', () => {
  it('next round does not start until all three humans vote in trio mode', () => {
    const state = makeState({
      gameMode: 'trio',
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'stock', totals: { host: 0, guest2: 8, guest: 10 } },
    })
    const s1 = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    expect(s1.phase).toBe('ROUND_END')
    const s2 = gameReducer(s1, { type: 'VOTE_NEXT_ROUND', playerId: 'guest' })
    expect(s2.phase).toBe('ROUND_END')
    const s3 = gameReducer(s2, { type: 'VOTE_NEXT_ROUND', playerId: 'guest2' })
    expect(s3.phase).not.toBe('ROUND_END')
  })
})

describe('TC-MODE-9 — Correct turn order per mode', () => {
  it('solo discard cycles host → bot1 → bot2 → host', () => {
    // Each player has 2 cards so discarding one doesn't trigger Tongit
    const base = (currentTurn: PlayerId): GameState => makeState({
      gameMode: 'solo',
      phase: currentTurn === 'host' ? 'PLAYER_TURN' : 'BOT_TURN',
      currentTurn,
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D'), card('3','C')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C'), card('4','D')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const afterHost = gameReducer(base('host'), { type: 'DISCARD', cardId: 'AS' })
    expect(afterHost.currentTurn).toBe('bot1')

    const afterBot1 = gameReducer(base('bot1'), { type: 'DISCARD', cardId: 'KD' })
    expect(afterBot1.currentTurn).toBe('bot2')

    const afterBot2 = gameReducer(base('bot2'), { type: 'DISCARD', cardId: '7C' })
    expect(afterBot2.currentTurn).toBe('host')
  })

  it('duo discard cycles host → bot1 → guest → host', () => {
    const base = (currentTurn: PlayerId): GameState => makeState({
      gameMode: 'duo',
      phase: currentTurn === 'host' || currentTurn === 'guest' ? 'PLAYER_TURN' : 'BOT_TURN',
      currentTurn,
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D'), card('3','C')], melds: [], isOpened: false },
        { id: 'guest', hand: [card('7','C'), card('4','D')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const afterHost = gameReducer(base('host'), { type: 'DISCARD', cardId: 'AS' })
    expect(afterHost.currentTurn).toBe('bot1')

    const afterBot1 = gameReducer(base('bot1'), { type: 'DISCARD', cardId: 'KD' })
    expect(afterBot1.currentTurn).toBe('guest')

    const afterGuest = gameReducer(base('guest'), { type: 'DISCARD', cardId: '7C' })
    expect(afterGuest.currentTurn).toBe('host')
  })

  it('trio discard cycles host → guest2 → guest → host', () => {
    const base = (currentTurn: PlayerId): GameState => makeState({
      gameMode: 'trio',
      phase: 'PLAYER_TURN',
      currentTurn,
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','H')], melds: [], isOpened: false },
        { id: 'guest2', hand: [card('K','D'), card('3','C')], melds: [], isOpened: false },
        { id: 'guest', hand: [card('7','C'), card('4','D')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const afterHost = gameReducer(base('host'), { type: 'DISCARD', cardId: 'AS' })
    expect(afterHost.currentTurn).toBe('guest2')

    const afterGuest2 = gameReducer(base('guest2'), { type: 'DISCARD', cardId: 'KD' })
    expect(afterGuest2.currentTurn).toBe('guest')

    const afterGuest = gameReducer(base('guest'), { type: 'DISCARD', cardId: '7C' })
    expect(afterGuest.currentTurn).toBe('host')
  })
})

describe('TC-MODE-10 — playerNames preserved across rounds', () => {
  it('VOTE_NEXT_ROUND preserves playerNames into next round', () => {
    const state = makeState({
      gameMode: 'solo',
      playerNames: { host: 'Alice', bot1: 'Bot 1', bot2: 'Bot 2', guest: 'Guest', guest2: 'Guest 2' },
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'tongit', totals: { host: 0, bot1: 5, bot2: 8 } },
    })
    const next = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    expect(next.playerNames.host).toBe('Alice')
    expect(next.playerNames.bot1).toBe('Bot 1')
  })
})

// ─── 11. Draw Phase Guards ───────────────────────────────────────────────────

describe('TC-GUARD-DRAW-1 — DRAW_FROM_STOCK rejected when drawPhase is false', () => {
  it('returns unchanged state when trying to draw from stock outside draw phase', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_STOCK' })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-DRAW-2 — DRAW_FROM_STOCK rejected when stock is empty', () => {
  it('returns unchanged state when stock pile is empty', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [],
      discardPile: [card('3','C')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_STOCK' })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-DRAW-3 — DRAW_FROM_DISCARD rejected when drawPhase is false', () => {
  it('returns unchanged state when trying to draw from discard outside draw phase', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('4','S'), card('5','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [card('6','S')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-DRAW-4 — DRAW_FROM_DISCARD rejected when discard pile is empty', () => {
  it('returns unchanged state when discard pile is empty', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        { id: 'host', hand: [card('4','S'), card('5','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    expect(next).toBe(state)
  })
})

// ─── 12. Discard Guards ──────────────────────────────────────────────────────

describe('TC-GUARD-DISCARD-1 — DISCARD rejected when cardId not in hand', () => {
  it('returns unchanged state when discarding a card not held in hand', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('3','D')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'KS' }) // KS not in hand
    expect(next).toBe(state)
  })
})

// ─── 13. LAY_MELD Guards ─────────────────────────────────────────────────────

describe('TC-GUARD-LAY-MELD-1 — LAY_MELD rejected when drawPhase is true', () => {
  it('returns unchanged state when trying to lay meld during draw phase', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        { id: 'host', hand: [card('3','S'), card('4','S'), card('5','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['3S','4S','5S'] })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-LAY-MELD-2 — LAY_MELD rejected when not player\'s turn', () => {
  it('returns unchanged state when a player tries to lay meld on another\'s turn', () => {
    const state = makeState({
      phase: 'BOT_TURN',
      currentTurn: 'bot1',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('3','S'), card('4','S'), card('5','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    // host tries to lay a meld but it's bot1's turn
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['3S','4S','5S'] })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-LAY-MELD-3 — LAY_MELD rejected when cards don\'t form valid meld', () => {
  it('returns unchanged state when the submitted cards are not a valid meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('3','S'), card('4','H'), card('7','D')], melds: [], isOpened: false },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    // 3S, 4H, 7D is neither a run nor a set
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['3S','4H','7D'] })
    expect(next).toBe(state)
  })
})

// ─── 14. SAPAW Guards ────────────────────────────────────────────────────────

describe('TC-GUARD-SAPAW-1 — SAPAW rejected when drawPhase is true', () => {
  it('returns unchanged state when trying to sapaw during draw phase', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        { id: 'host', hand: [card('6','S')], melds: [], isOpened: false },
        {
          id: 'bot1',
          hand: [],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-SAPAW-2 — SAPAW rejected when not player\'s turn', () => {
  it('returns unchanged state when a player tries to sapaw on another\'s turn', () => {
    const state = makeState({
      phase: 'BOT_TURN',
      currentTurn: 'bot1',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('6','S')], melds: [], isOpened: false },
        {
          id: 'bot1',
          hand: [card('K','D')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    // host tries to sapaw but it's bot1's turn
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-SAPAW-3 — SAPAW rejected when card not in hand', () => {
  it('returns unchanged state when the sapaw card is not in the player\'s hand', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','H')], melds: [], isOpened: false },
        {
          id: 'bot1',
          hand: [],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    // 6S is not in host's hand
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-SAPAW-4 — SAPAW rejected when meldIndex out of bounds', () => {
  it('returns unchanged state when meldIndex does not point to an existing meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('6','S')], melds: [], isOpened: false },
        {
          id: 'bot1',
          hand: [],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    // meldIndex 5 doesn't exist
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 5,
    })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-SAPAW-5 — SAPAW rejected when canExtendMeld returns false', () => {
  it('returns unchanged state when the card cannot extend the target meld', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('K','H')], melds: [], isOpened: false },
        {
          id: 'bot1',
          hand: [],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [],
    })
    // KH cannot extend the 3-4-5 of spades run
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: 'KH',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    expect(next).toBe(state)
  })
})

describe('TC-TONGIT-SAPAW — Tongit via SAPAW empties hand', () => {
  it('triggers ROUND_END with tongit reason when sapaw empties player hand', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('6','S')], melds: [], isOpened: false }, // only 1 card
        {
          id: 'bot1',
          hand: [card('A','D')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('K','C')], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('host')
    expect(next.roundResult?.reason).toBe('tongit')
  })
})

// ─── 15. LAY_SECRET_SET Guards ───────────────────────────────────────────────

describe('TC-GUARD-SECRET-1 — LAY_SECRET_SET rejected with wrong card count', () => {
  it('returns unchanged state when fewer than 4 cards are provided', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('Q','S'), card('Q','H'), card('Q','D'), card('A','C')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    // Only 3 cards — requires exactly 4
    const next = gameReducer(state, {
      type: 'LAY_SECRET_SET',
      playerId: 'host',
      cardIds: ['QS', 'QH', 'QD'],
    })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-SECRET-2 — LAY_SECRET_SET rejected when cards not all same rank', () => {
  it('returns unchanged state when the 4 cards are not all the same rank', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('Q','S'), card('Q','H'), card('Q','D'), card('K','C')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    // KC has different rank than QS, QH, QD
    const next = gameReducer(state, {
      type: 'LAY_SECRET_SET',
      playerId: 'host',
      cardIds: ['QS', 'QH', 'QD', 'KC'],
    })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-SECRET-3 — LAY_SECRET_SET rejected when suits are duplicate', () => {
  it('returns unchanged state when the 4 cards have fewer than 4 distinct suits', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          // Two spades — duplicate suit
          hand: [card('Q','S'), card('Q','H'), card('Q','D'), card('Q','S')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [], melds: [], isOpened: false },
        { id: 'bot2', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    // Two cards with id 'QS' — only 3 distinct suits (S, H, D)
    const next = gameReducer(state, {
      type: 'LAY_SECRET_SET',
      playerId: 'host',
      cardIds: ['QS', 'QH', 'QD', 'QS'],
    })
    expect(next).toBe(state)
  })
})

describe('TC-TONGIT-SECRET — Tongit via LAY_SECRET_SET empties hand', () => {
  it('triggers ROUND_END with tongit when secret set is the last cards in hand', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        {
          id: 'host',
          // Exactly the 4 Queens — laying them all empties the hand
          hand: [card('Q','S'), card('Q','H'), card('Q','D'), card('Q','C')],
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'LAY_SECRET_SET',
      playerId: 'host',
      cardIds: ['QS', 'QH', 'QD', 'QC'],
    })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('host')
    expect(next.roundResult?.reason).toBe('tongit')
  })
})

// ─── 16. CALL_DRAW Guards ────────────────────────────────────────────────────

describe('TC-GUARD-CALL-DRAW-1 — CALL_DRAW rejected when player has not opened', () => {
  it('returns unchanged state when the caller has not opened their hand', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'host' })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-CALL-DRAW-2 — CALL_DRAW rejected when not player\'s turn', () => {
  it('returns unchanged state when a non-current player tries to call draw', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'bot1',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    // host tries to call draw but it's bot1's turn
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'host' })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-CALL-DRAW-3 — CALL_DRAW rejected when phase is not PLAYER_TURN', () => {
  it('returns unchanged state when CALL_DRAW is attempted during BOT_TURN', () => {
    const state = makeState({
      phase: 'BOT_TURN',
      currentTurn: 'bot1',
      drawPhase: false,
      players: [
        {
          id: 'host',
          hand: [card('A','S')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot1', hand: [card('K','D'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    // bot1 is current turn but phase is BOT_TURN, not PLAYER_TURN
    const next = gameReducer(state, { type: 'CALL_DRAW', playerId: 'bot1' })
    expect(next).toBe(state)
  })
})

// ─── 17. RESPOND_DRAW Guards ─────────────────────────────────────────────────

describe('TC-GUARD-RESPOND-1 — RESPOND_DRAW rejected when phase is not DRAW_RESOLUTION', () => {
  it('returns unchanged state when responding during wrong phase', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: true },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'RESPOND_DRAW', playerId: 'bot1', response: 'fold' })
    expect(next).toBe(state)
  })
})

describe('TC-GUARD-RESPOND-2 — RESPOND_DRAW rejected when caller responds to own draw', () => {
  it('returns unchanged state when draw caller tries to respond to their own draw', () => {
    const state = makeState({
      phase: 'DRAW_RESOLUTION',
      currentTurn: 'host',
      drawPhase: false,
      drawCaller: 'host',
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: true },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    const next = gameReducer(state, { type: 'RESPOND_DRAW', playerId: 'host', response: 'fold' })
    expect(next).toBe(state)
  })
})

// ─── 18. VOTE_NEXT_ROUND Guards ──────────────────────────────────────────────

describe('TC-GUARD-VOTE-1 — VOTE_NEXT_ROUND duplicate vote ignored', () => {
  it('returns unchanged state when the same player votes twice', () => {
    const state = makeState({
      gameMode: 'duo',
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'stock', totals: { host: 0, bot1: 10, guest: 8 } },
    })
    const afterFirst = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    // Host votes again — should be ignored
    const afterSecond = gameReducer(afterFirst, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    expect(afterSecond).toBe(afterFirst)
  })
})

// ─── 19. END_ROUND Action ────────────────────────────────────────────────────

describe('TC-END-ROUND — END_ROUND action transitions to ROUND_END phase', () => {
  it('sets phase to ROUND_END regardless of current phase', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
    })
    const next = gameReducer(state, { type: 'END_ROUND' })
    expect(next.phase).toBe('ROUND_END')
  })
})

// ─── 20. DRAW_FROM_DISCARD Tongit ────────────────────────────────────────────

describe('TC-TONGIT-DISCARD-DRAW — Tongit via DRAW_FROM_DISCARD', () => {
  it('triggers ROUND_END with tongit when drawing from discard empties the hand', () => {
    // host has 2 cards; draws 6S from discard which completes a run 4S-5S-6S
    // The meld is atomically exposed and the remaining hand is empty → tongit
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: true,
      players: [
        {
          id: 'host',
          hand: [card('4','S'), card('5','S')], // drawing 6S completes a run → 0 cards left
          melds: [],
          isOpened: false,
        },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('A','C')],
      discardPile: [card('6','S')],
    })
    const next = gameReducer(state, { type: 'DRAW_FROM_DISCARD' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('host')
    expect(next.roundResult?.reason).toBe('tongit')
  })
})

// ─── 21. Stock exhaustion — no players opened ────────────────────────────────

describe('TC-STOCK-NONE-OPENED — Stock exhaustion with no opened players uses all players', () => {
  it('selects winner from all players when none have opened', () => {
    // No player has opened; scoring pool = all players
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S')], melds: [], isOpened: false }, // 1 pt after discard = 0 pts
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false }, // 10 pts
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false }, // 7 pts
      ],
      stock: [], // empty → next discard ends round
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    // host discards their only card → hand empty → tongit (not stock end)
    // Let's test with 2 cards so discard doesn't trigger tongit
    const state2 = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','D')], melds: [], isOpened: false }, // discards AS → 2 pts
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false }, // 10 pts
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false }, // 7 pts
      ],
      stock: [],
      discardPile: [],
    })
    const next2 = gameReducer(state2, { type: 'DISCARD', cardId: 'AS' })
    expect(next2.phase).toBe('ROUND_END')
    expect(next2.roundResult?.reason).toBe('stock')
    // host has 2 pts (2D), bot1 has 10 pts, bot2 has 7 pts → host wins
    expect(next2.roundResult?.winner).toBe('host')
    // All 3 burned (none opened)
    expect(next2.roundResult?.burned).toHaveLength(3)
  })
})

// ─── 22. Multiple Sapaws on Same Meld ────────────────────────────────────────

describe('TC-MULTI-SAPAW — Multiple players can sapaw the same meld', () => {
  it('two different players can each extend the same exposed meld', () => {
    // bot1 has meld [3S, 4S, 5S]; host sapaws 6S, then bot2 sapaws 2S
    const baseState = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      players: [
        { id: 'host', hand: [card('6','S'), card('K','H')], melds: [], isOpened: false },
        {
          id: 'bot1',
          hand: [card('A','D')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'bot2', hand: [card('2','S'), card('9','D')], melds: [], isOpened: false },
      ],
      stock: [card('J','C')],
      discardPile: [],
    })

    // Host sapaws 6S onto bot1's meld
    const afterHost = gameReducer(baseState, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    const bot1After1 = afterHost.players.find(p => p.id === 'bot1')!
    expect(bot1After1.melds[0]).toHaveLength(4) // 3S, 4S, 5S, 6S

    // Now bot2's turn — sapaw 2S onto same meld (now [3S,4S,5S,6S])
    const stateForBot2 = { ...afterHost, currentTurn: 'bot2' as PlayerId, phase: 'PLAYER_TURN' as const }
    const afterBot2 = gameReducer(stateForBot2, {
      type: 'SAPAW',
      playerId: 'bot2',
      cardId: '2S',
      targetPlayerId: 'bot1',
      meldIndex: 0,
    })
    const bot1After2 = afterBot2.players.find(p => p.id === 'bot1')!
    expect(bot1After2.melds[0]).toHaveLength(5) // 3S,4S,5S,6S,2S
    const bot2After = afterBot2.players.find(p => p.id === 'bot2')!
    expect(bot2After.hand).toHaveLength(1) // 9D remains
  })
})

// ─── 23. Dealer First Turn Flag ──────────────────────────────────────────────

describe('TC-DEALER-FLAG-1 — dealerFirstTurn set to true on new round', () => {
  it('VOTE_NEXT_ROUND sets dealerFirstTurn: true for the new round', () => {
    const state = makeState({
      gameMode: 'solo',
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'tongit', totals: { host: 0, bot1: 5, bot2: 8 } },
    })
    const next = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    expect(next.dealerFirstTurn).toBe(true)
  })
})

describe('TC-DEALER-FLAG-2 — dealerFirstTurn cleared after discard', () => {
  it('dealerFirstTurn becomes false after any discard', () => {
    const state = makeState({
      phase: 'PLAYER_TURN',
      currentTurn: 'host',
      drawPhase: false,
      dealerFirstTurn: true,
      players: [
        { id: 'host', hand: [card('A','S'), card('2','H')], melds: [], isOpened: false },
        { id: 'bot1', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'bot2', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('3','D')],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next.dealerFirstTurn).toBe(false)
  })
})

// ─── 24. START_GAME Initialization ───────────────────────────────────────────

describe('TC-START-HAND-SIZE — START_GAME deals correct hand sizes', () => {
  it('dealer receives 13 cards, other two players receive 12 each', () => {
    const state = makeState({})
    const next = gameReducer(state, {
      type: 'START_GAME',
      gameMode: 'solo',
      hostName: 'Test',
    })
    const dealer = next.players.find(p => p.id === next.dealer)!
    const others = next.players.filter(p => p.id !== next.dealer)
    expect(dealer.hand).toHaveLength(13)
    others.forEach(p => expect(p.hand).toHaveLength(12))
  })
})

describe('TC-HOST-IS-DEALER — hostIsDealer flag set correctly', () => {
  it('hostIsDealer is true when host is dealer, false otherwise', () => {
    // Run multiple times to hit both branches (random dealer)
    let hostWasDealer = false
    let hostWasNotDealer = false
    for (let i = 0; i < 100; i++) {
      const next = gameReducer(makeState({}), {
        type: 'START_GAME',
        gameMode: 'solo',
        hostName: 'Test',
      })
      if (next.dealer === 'host') {
        expect(next.hostIsDealer).toBe(true)
        hostWasDealer = true
      } else {
        expect(next.hostIsDealer).toBe(false)
        hostWasNotDealer = true
      }
      if (hostWasDealer && hostWasNotDealer) break
    }
    // Sanity: both branches were hit in 100 trials
    expect(hostWasDealer).toBe(true)
    expect(hostWasNotDealer).toBe(true)
  })
})

describe('TC-MODE-GAMEMODE-PRESERVED — gameMode preserved across VOTE_NEXT_ROUND', () => {
  it('gameMode carries over into the new round', () => {
    const state = makeState({
      gameMode: 'duo',
      phase: 'ROUND_END',
      roundResult: { winner: 'host', reason: 'stock', totals: { host: 0, bot1: 10, guest: 8 } },
    })
    const afterHost = gameReducer(state, { type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    expect(afterHost.phase).toBe('ROUND_END') // guest hasn't voted yet
    const afterGuest = gameReducer(afterHost, { type: 'VOTE_NEXT_ROUND', playerId: 'guest' })
    expect(afterGuest.gameMode).toBe('duo')
  })
})

// ─── Network Message Shapes ───────────────────────────────────────────────────

describe('TC-NET-1 — LOBBY_SNAPSHOT message shape', () => {
  it('constructs a valid LOBBY_SNAPSHOT message with all required fields', () => {
    const msg: NetworkMessage = {
      type: 'LOBBY_SNAPSHOT',
      gameMode: 'duo',
      hostName: 'Kurt',
      guestNames: { guest: 'Joy' },
      guestReady: { guest: false },
    }
    expect(msg.type).toBe('LOBBY_SNAPSHOT')
    expect(msg.gameMode).toBe('duo')
    expect(msg.hostName).toBe('Kurt')
    expect(msg.guestNames).toEqual({ guest: 'Joy' })
    expect(msg.guestReady).toEqual({ guest: false })
  })

  it('allows empty guestNames and guestReady for a freshly opened room', () => {
    const msg: NetworkMessage = {
      type: 'LOBBY_SNAPSHOT',
      gameMode: 'trio',
      hostName: 'Alice',
      guestNames: {},
      guestReady: {},
    }
    expect(msg.guestNames).toEqual({})
    expect(msg.guestReady).toEqual({})
  })
})

describe('TC-NET-2 — GUEST_READY message shape', () => {
  it('constructs a ready=true message', () => {
    const msg: NetworkMessage = { type: 'GUEST_READY', playerId: 'guest', ready: true }
    expect(msg.type).toBe('GUEST_READY')
    expect(msg.playerId).toBe('guest')
    expect(msg.ready).toBe(true)
  })

  it('constructs a ready=false message', () => {
    const msg: NetworkMessage = { type: 'GUEST_READY', playerId: 'guest2', ready: false }
    expect(msg.ready).toBe(false)
    expect(msg.playerId).toBe('guest2')
  })
})

// ─── START_GAME with guestNames ───────────────────────────────────────────────

describe('TC-NET-3 — START_GAME sets guest player name in duo mode', () => {
  it('merges guestNames into playerNames', () => {
    const state = gameReducer(initialGameState, {
      type: 'START_GAME',
      gameMode: 'duo',
      hostName: 'Kurt',
      guestNames: { guest: 'Joy' },
    })
    expect(state.playerNames.host).toBe('Kurt')
    expect(state.playerNames.guest).toBe('Joy')
    expect(state.playerNames.bot2).toBe('Bot 2')
  })
})

describe('TC-NET-4 — START_GAME sets both guest names in trio mode', () => {
  it('sets host, guest, and guest2 names correctly', () => {
    const state = gameReducer(initialGameState, {
      type: 'START_GAME',
      gameMode: 'trio',
      hostName: 'Alice',
      guestNames: { guest: 'Bob', guest2: 'Carol' },
    })
    expect(state.playerNames.host).toBe('Alice')
    expect(state.playerNames.guest).toBe('Bob')
    expect(state.playerNames.guest2).toBe('Carol')
    expect(state.gameMode).toBe('trio')
  })
})

describe('TC-NET-5 — START_GAME solo mode uses only hostName', () => {
  it('sets host name and preserves default bot names', () => {
    const state = gameReducer(initialGameState, {
      type: 'START_GAME',
      gameMode: 'solo',
      hostName: 'Solo Player',
    })
    expect(state.playerNames.host).toBe('Solo Player')
    expect(state.playerNames.bot1).toBe('Bot 1')
    expect(state.playerNames.bot2).toBe('Bot 2')
    expect(state.gameMode).toBe('solo')
  })
})
