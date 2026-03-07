export type Suit = 'S' | 'H' | 'D' | 'C'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
export type Card = { id: string; suit: Suit; rank: Rank }

const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function createDeck(): Card[] {
  return SUITS.flatMap(suit =>
    RANKS.map(rank => ({ id: `${rank}${suit}`, suit, rank }))
  )
}

export function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

export type DealResult = {
  dealerHand: Card[]
  player2Hand: Card[]
  aiHand: Card[]
  stock: Card[]
}

export function deal(deck: Card[]): DealResult {
  const d = [...deck]
  const dealerHand = d.splice(0, 13)
  const player2Hand = d.splice(0, 12)
  const aiHand = d.splice(0, 12)
  return { dealerHand, player2Hand, aiHand, stock: d }
}
