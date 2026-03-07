import type { Card, Rank } from './deck'

export const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

const CARD_VALUES: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 10, Q: 10, K: 10,
}

export function getCardValue(rank: Rank): number {
  return CARD_VALUES[rank]
}

export function handTotal(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + getCardValue(c.rank), 0)
}

function rankIndex(rank: Rank): number {
  return RANK_ORDER.indexOf(rank)
}

function isSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false
  const rank = cards[0].rank
  if (!cards.every(c => c.rank === rank)) return false
  const suits = cards.map(c => c.suit)
  return new Set(suits).size === suits.length
}

function isSequence(cards: Card[]): boolean {
  if (cards.length < 3) return false
  const suit = cards[0].suit
  if (!cards.every(c => c.suit === suit)) return false
  const indices = cards.map(c => rankIndex(c.rank)).sort((a, b) => a - b)
  // No duplicates
  if (new Set(indices).size !== indices.length) return false
  // Consecutive
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false
  }
  return true
}

export function isValidMeld(cards: Card[]): boolean {
  return isSet(cards) || isSequence(cards)
}

function meldIsSet(meld: Card[]): boolean {
  return meld.length >= 3 && meld.every(c => c.rank === meld[0].rank)
}

export function canExtendMeld(card: Card, meld: Card[]): boolean {
  if (meld.length === 0) return false

  if (meldIsSet(meld)) {
    if (meld.length >= 4) return false
    if (card.rank !== meld[0].rank) return false
    return !meld.some(c => c.suit === card.suit)
  }

  // Sequence
  const suit = meld[0].suit
  if (card.suit !== suit) return false
  const indices = meld.map(c => rankIndex(c.rank)).sort((a, b) => a - b)
  const cardIdx = rankIndex(card.rank)
  return cardIdx === indices[0] - 1 || cardIdx === indices[indices.length - 1] + 1
}

export function detectMelds(hand: Card[]): Card[][] {
  const candidates: Card[][] = []

  // Find sets: group by rank
  const byRank = new Map<string, Card[]>()
  for (const card of hand) {
    const group = byRank.get(card.rank) ?? []
    group.push(card)
    byRank.set(card.rank, group)
  }
  for (const group of byRank.values()) {
    if (group.length >= 3) {
      // Dedupe by suit, keep first occurrence per suit
      const dedupedBySuit = [...new Map(group.map(c => [c.suit, c])).values()]
      if (dedupedBySuit.length >= 3) {
        candidates.push(dedupedBySuit.slice(0, 4))
      }
    }
  }

  // Find sequences: group by suit, sort by rank index, find runs
  const bySuit = new Map<string, Card[]>()
  for (const card of hand) {
    const group = bySuit.get(card.suit) ?? []
    group.push(card)
    bySuit.set(card.suit, group)
  }
  for (const group of bySuit.values()) {
    // Remove duplicates by rank index, keep first occurrence
    const seen = new Set<number>()
    const unique: Card[] = []
    for (const card of group) {
      const idx = rankIndex(card.rank)
      if (!seen.has(idx)) {
        seen.add(idx)
        unique.push(card)
      }
    }
    unique.sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank))

    // Find all maximal consecutive runs
    let runStart = 0
    for (let i = 1; i <= unique.length; i++) {
      if (i === unique.length || rankIndex(unique[i].rank) !== rankIndex(unique[i - 1].rank) + 1) {
        const run = unique.slice(runStart, i)
        if (run.length >= 3) {
          candidates.push(run)
        }
        runStart = i
      }
    }
  }

  // Sort candidates by length descending (prefer longer melds)
  candidates.sort((a, b) => b.length - a.length)

  // Greedy pick non-overlapping melds
  const usedIds = new Set<string>()
  const result: Card[][] = []
  for (const candidate of candidates) {
    if (candidate.every(c => !usedIds.has(c.id))) {
      result.push(candidate)
      for (const c of candidate) usedIds.add(c.id)
    }
  }

  return result
}

export function findBestDiscard(hand: Card[]): Card {
  return [...hand].sort((a, b) => {
    const valDiff = getCardValue(b.rank) - getCardValue(a.rank)
    if (valDiff !== 0) return valDiff
    return rankIndex(b.rank) - rankIndex(a.rank)
  })[0]
}
