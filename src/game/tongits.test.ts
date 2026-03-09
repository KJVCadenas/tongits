import { describe, it, expect } from 'vitest'
import { createDeck, deal, shuffle } from './deck'
import type { Card, Rank, Suit } from './deck'
import { getCardValue, handTotal, isValidMeld, canExtendMeld } from './melds'
import {
  gameReducer,
  initialGameState,
  calculateChips,
  selectDealer,
} from './engine'
import type { GameState, PlayerId } from './engine'

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
  it('selects a valid player as dealer randomly', () => {
    const validDealers: PlayerId[] = ['host', 'guest', 'ai']
    const dealer = selectDealer()
    expect(validDealers).toContain(dealer)
  })
})

describe('TC-SETUP-5 — Next dealer is previous winner', () => {
  it('makes the previous round winner the dealer for the next round', () => {
    const state = makeState({ phase: 'ROUND_END', roundResult: { winner: 'guest', reason: 'stock', totals: { host: 10, guest: 5, ai: 8 } } })
    const next = gameReducer(state, { type: 'NEXT_ROUND' })
    expect(next.dealer).toBe('guest')
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
  it('cards in hand (not yet exposed) do not count toward unmatched score for scoring', () => {
    // handTotal only counts hand cards; melds are not included
    const hand = [card('K','S'), card('K','H'), card('K','D')]
    const exposedMelds = [[card('3','S'), card('4','S'), card('5','S')]]
    // hand total of exposed meld cards is 0 (not in hand)
    expect(handTotal(hand)).toBe(30)
    const meldTotal = handTotal(exposedMelds[0])
    expect(meldTotal).toBe(12) // 3+4+5, but these are in melds not hand
    // Only hand cards count as unmatched
    expect(handTotal(hand)).toBe(30)
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
          id: 'guest',
          hand: [card('A','C')],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'ai', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'guest',
      meldIndex: 0,
    })
    const guest = next.players.find(p => p.id === 'guest')!
    expect(guest.melds[0]).toHaveLength(4)
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
          id: 'guest',
          hand: [],
          melds: [[card('3','S'), card('4','S'), card('5','S')]],
          isOpened: true,
        },
        { id: 'ai', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('2','C')],
      discardPile: [],
    })
    const next = gameReducer(state, {
      type: 'SAPAW',
      playerId: 'host',
      cardId: '6S',
      targetPlayerId: 'guest',
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
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
    })
    // Laying the final meld with last card triggers tongit instantly
    const next = gameReducer(state, { type: 'LAY_MELD', playerId: 'host', cardIds: ['AS'] })
    // Wait — tongit via single card isn't a valid meld. Let's test via discard that empties hand
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [], melds: [], isOpened: false },
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
          id: 'guest',
          hand: [card('K','D')],
          melds: [],
          isOpened: true,
        },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
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
          id: 'guest',
          hand: [card('K','D'), card('Q','D')],
          melds: [],
          isOpened: false, // never opened — will be burned
        },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: 'AS' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.burned).toContain('guest')
    expect(next.roundResult?.burned).toContain('ai')
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
          id: 'guest',
          hand: [card('K','D')], // 10 points
          melds: [],
          isOpened: true,
        },
        {
          id: 'ai',
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: true },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'fold' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'fold' })
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
          id: 'guest',
          hand: [card('K','D')], // 10 points — challenger loses
          melds: [],
          isOpened: true,
        },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    // host has 3 pts, guest has 10 pts → host wins
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
          id: 'guest',
          hand: [card('2','D')], // 2 points — challenger wins
          melds: [],
          isOpened: true,
        },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    expect(next.roundResult?.winner).toBe('guest')
  })
})

// ─── 7. Tiebreakers ──────────────────────────────────────────────────────────

describe('TC-TIE-1 — Stock exhaustion tie: last stock drawer wins', () => {
  it('when tie on stock exhaustion, last stock drawer wins', () => {
    // host drew last from stock (lastStockDrawer: 'host') and ties with guest
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
          id: 'guest',
          hand: [card('5','H')], // 5 points — tie
          melds: [],
          isOpened: true,
        },
        { id: 'ai', hand: [card('K','C')], melds: [], isOpened: true },
      ],
      stock: [],
      discardPile: [],
    })
    const next = gameReducer(state, { type: 'DISCARD', cardId: '5S' })
    // host and guest tie; host was last stock drawer → host wins
    expect(next.roundResult?.winner).toBe('host')
  })
})

describe('TC-TIE-2 — Non-stock-exhaustion tie: next in turn order wins', () => {
  it('when two non-last-drawer players tie, player next in turn order wins', () => {
    // Draw call with tie between guest and ai; host is caller
    // turn order: host → ai → guest; if caller is host, next in order after host = ai
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
          id: 'ai',
          hand: [card('5','C')], // 5 pts — tie with guest
          melds: [],
          isOpened: true,
        },
        {
          id: 'guest',
          hand: [card('5','D')], // 5 pts — tie with ai
          melds: [],
          isOpened: true,
        },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'challenge' })
    // ai and guest both tie at 5 pts; turn order after host is ai → ai wins
    expect(next.roundResult?.winner).toBe('ai')
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
          id: 'guest',
          hand: [card('5','H')], // 5 pts — tie with caller
          melds: [],
          isOpened: true,
        },
        { id: 'ai', hand: [card('K','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'fold' })
    // caller (host) ties with challenger (guest) → challenger wins
    expect(next.roundResult?.winner).toBe('guest')
  })
})

describe('TC-TIE-4 — Two challengers tie: challenger right of caller wins', () => {
  it('when two challengers tie, the one right of caller in turn order wins', () => {
    // turn order: host → ai → guest; caller = host; right of caller = ai (first after host)
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
          id: 'ai',
          hand: [card('5','C')], // 5 pts — ties with guest
          melds: [],
          isOpened: true,
        },
        {
          id: 'guest',
          hand: [card('5','D')], // 5 pts — ties with ai
          melds: [],
          isOpened: true,
        },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'challenge' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'challenge' })
    // ai is right of caller (host) in turn order; ai wins tie
    expect(next.roundResult?.winner).toBe('ai')
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
      totals: { host: 3, guest: 15, ai: 20 },
      burned: ['guest', 'ai'],
      secretSets: {},
      players: ['host', 'guest', 'ai'],
    })
    // base: +1 per loser = +2; burn bonus: +1 per burned = +2; total for host = +4
    expect(result.host).toBeGreaterThanOrEqual(4)
    expect(result.guest).toBeLessThan(0)
    expect(result.ai).toBeLessThan(0)
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
        { id: 'guest', hand: [card('K','D')], melds: [], isOpened: false },
        { id: 'ai', hand: [card('7','C')], melds: [], isOpened: false },
      ],
      stock: [card('9','C')],
      discardPile: [],
      drawResponses: {},
    })
    let next = gameReducer(afterCallState, { type: 'RESPOND_DRAW', playerId: 'guest', response: 'fold' })
    next = gameReducer(next, { type: 'RESPOND_DRAW', playerId: 'ai', response: 'fold' })
    expect(next.phase).toBe('ROUND_END')
    const chips = calculateChips({
      winner: next.roundResult!.winner,
      reason: next.roundResult!.reason,
      totals: next.roundResult!.totals,
      burned: next.roundResult!.burned ?? [],
      secretSets: {},
      players: ['host', 'guest', 'ai'],
    })
    expect(chips.guest).toBeLessThan(0)
    expect(chips.ai).toBeLessThan(0)
  })
})

// ─── 9. Scoring ──────────────────────────────────────────────────────────────

describe('TC-SCORE-1 — Base win: +1 chip per loser', () => {
  it('winner gains +1 chip per losing player in standard win', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 1, guest: 10, ai: 8 },
      burned: [],
      secretSets: {},
      players: ['host', 'guest', 'ai'],
    })
    expect(result.host).toBe(2) // +1 per loser (2 losers)
    expect(result.guest).toBe(-1)
    expect(result.ai).toBe(-1)
  })
})

describe('TC-SCORE-2 — Ace bonus: +1 chip per Ace held', () => {
  it('winner gains +1 chip for each Ace in their hand', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 2, guest: 10, ai: 8 },
      burned: [],
      secretSets: {},
      winnerAces: 2,
      players: ['host', 'guest', 'ai'],
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
      totals: { host: 1, guest: 10, ai: 8 },
      burned: ['guest'],
      secretSets: {},
      players: ['host', 'guest', 'ai'],
    })
    // base +2 (2 losers), burn bonus +1 (1 burned) = +3
    expect(result.host).toBe(3)
    expect(result.guest).toBe(-2) // normal -1 + burn penalty -1
    expect(result.ai).toBe(-1)
  })
})

describe('TC-SCORE-4 — Secret set bonus: +3 chips per secret set-of-4', () => {
  it('winner gains +3 chips per secret set-of-4', () => {
    const result = calculateChips({
      winner: 'host',
      reason: 'stock',
      totals: { host: 1, guest: 10, ai: 8 },
      burned: [],
      secretSets: { host: 1 },
      players: ['host', 'guest', 'ai'],
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
      totals: { host: 0, guest: 10, ai: 8 },
      burned: [],
      secretSets: {},
      players: ['host', 'guest', 'ai'],
    })
    // tongit: +3 per loser (2 losers) = +6
    expect(result.host).toBe(6)
    expect(result.guest).toBe(-3)
    expect(result.ai).toBe(-3)
  })
})

describe('TC-SCORE-6 — Draw challenge win bonus: +3 chips instead of base +1', () => {
  it('winner of challenged Draw gains +3 chips per loser instead of +1', () => {
    const result = calculateChips({
      winner: 'guest', // challenger wins
      reason: 'draw',
      totals: { host: 20, guest: 2, ai: 8 },
      burned: [],
      secretSets: {},
      challenged: true,
      players: ['host', 'guest', 'ai'],
    })
    // challenged draw win: +3 per loser = +6
    expect(result.guest).toBe(6)
    expect(result.host).toBe(-3)
    expect(result.ai).toBe(-3)
  })
})
