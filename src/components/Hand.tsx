import type { Card as CardType } from '../game/deck'
import { isValidMeld } from '../game/melds'
import Card from './Card'

type Props = {
  cards: CardType[]
  faceUp: boolean
  selectedCardIds?: string[]
  pendingMeldGroups?: string[][]
  onCardClick?: (id: string) => void
  label: string
  onDump?: () => void
  onAutoMeld?: () => void
  onSort?: () => void
}

export default function Hand({
  cards,
  faceUp,
  selectedCardIds = [],
  pendingMeldGroups = [],
  onCardClick,
  label: _label,
  onDump,
  onAutoMeld,
  onSort,
}: Props) {
  const pendingIds = new Set(pendingMeldGroups.flat())
  const freeCards = cards.filter(c => !pendingIds.has(c.id))

  return (
    <div className="relative flex justify-center items-end py-6 pl-4 pr-52 overflow-x-auto gap-0">
      {/* Pending meld groups — visually grouped, not individually selected */}
      {pendingMeldGroups.map((group, gi) => {
        const groupCards = group.map(id => cards.find(c => c.id === id)).filter(Boolean) as CardType[]
        const isGroupSelected = group.some(id => selectedCardIds.includes(id))
        const isValid = isValidMeld(groupCards)
        return (
          <div
            key={gi}
            className={`flex items-end mr-2 shrink-0 rounded-lg ring-2 ring-offset-2 ring-offset-[#0a1f2b] transition-transform duration-100 ${isValid ? 'ring-emerald-400' : 'ring-gray-500'} ${isGroupSelected ? '-translate-y-4' : ''}`}
            data-testid="meld-group"
            data-group-index={gi}
            data-group-valid={isValid}
          >
            {groupCards.map((card, i) => (
              <div key={card.id} className={i === 0 ? '' : '-ml-8'} data-card-state="grouped">
                <Card
                  card={card}
                  faceUp={faceUp}
                  size="hand"
                  selected={selectedCardIds.includes(card.id)}
                  onClick={onCardClick ? () => onCardClick(card.id) : undefined}
                />
              </div>
            ))}
          </div>
        )
      })}

      {/* Free (ungrouped) hand cards */}
      {freeCards.map((card, i) => (
        <div key={card.id} className={i === 0 ? '' : '-ml-8'} data-card-state="normal">
          <Card
            card={card}
            faceUp={faceUp}
            size="hand"
            selected={selectedCardIds.includes(card.id)}
            onClick={onCardClick ? () => onCardClick(card.id) : undefined}
          />
        </div>
      ))}

      {cards.length === 0 && (
        <div className="text-gray-600 text-sm italic py-4 px-2">No cards</div>
      )}

      {/* Right: action buttons — absolutely positioned so they don't shift card centering */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4">
        <button
          onClick={onDump}
          className="px-14 py-2 rounded bg-red-800 hover:bg-red-700 text-white text-2xl font-bold tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!onDump}
          data-testid="btn-dump"
        >
          Dump
        </button>
        <button
          onClick={onAutoMeld}
          className="px-14 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-2xl font-bold tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!onAutoMeld}
          data-testid="btn-auto-meld"
        >
          Auto Meld
        </button>
        <button
          onClick={onSort}
          className="px-14 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-2xl font-bold tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!onSort}
          data-testid="btn-sort"
        >
          Sort
        </button>
      </div>
    </div>
  )
}
