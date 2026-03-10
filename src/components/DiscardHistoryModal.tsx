import type { Card } from '../game/deck'
import CardComponent from './Card'

const RANK_ORDER_DESC = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'] as const
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

const CARD_WIDTH = 64  // w-16 = 64px
const CARD_HEIGHT = 88 // h-[88px]
const CARD_OFFSET = 20 // px overlap step

type Props = {
  discardPile: Card[]
  onClose: () => void
}

export default function DiscardHistoryModal({ discardPile, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#0a1f2b] rounded-2xl p-6 border border-white/20 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        style={{ minWidth: 'min(384px, 90vw)' }}
        onClick={e => e.stopPropagation()}
        data-testid="modal-discard-history"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Discarded Cards</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl leading-none"
            data-testid="btn-close-discard-history"
          >✕</button>
        </div>

        {(['S', 'H', 'D', 'C'] as const).map(suit => {
          const suitCards = discardPile
            .filter(c => c.suit === suit)
            .sort((a, b) => RANK_ORDER_DESC.indexOf(a.rank) - RANK_ORDER_DESC.indexOf(b.rank))

          return (
            <div key={suit} className="flex items-center gap-3">
              <span className={`text-xl font-bold w-6 shrink-0 ${suit === 'H' || suit === 'D' ? 'text-red-500' : 'text-white'}`}>
                {SUIT_SYMBOL[suit]}
              </span>

              {suitCards.length === 0
                ? <span className="text-white/20 text-sm italic self-center">—</span>
                : (
                  <div
                    className="relative overflow-x-auto"
                    style={{
                      height: CARD_HEIGHT,
                      width: suitCards.length === 1
                        ? CARD_WIDTH
                        : (suitCards.length - 1) * CARD_OFFSET + CARD_WIDTH,
                    }}
                  >
                    {suitCards.map((card, i) => (
                      <div
                        key={card.id}
                        className="absolute"
                        style={{ left: i * CARD_OFFSET, top: 0, zIndex: i }}
                      >
                        <CardComponent card={card} faceUp size="modal" />
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}
