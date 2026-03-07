import type { Card as CardType } from '../game/deck'
import Card from './Card'

type Props = {
  melds: CardType[][]
  label: string
  size?: 'meld' | 'opponent' | 'hand'
  onMeldClick?: (meldIndex: number) => void
}

export default function MeldZone({ melds, label: _label, size = 'meld', onMeldClick }: Props) {
  return (
    <div className="flex flex-row flex-wrap gap-2 items-center min-h-8 px-2">
      {melds.map((meld, i) => (
        <div
          key={i}
          className={`flex rounded transition-all ${onMeldClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 hover:ring-offset-transparent' : ''}`}
          onClick={onMeldClick ? () => onMeldClick(i) : undefined}
          role={onMeldClick ? 'button' : undefined}
          tabIndex={onMeldClick ? 0 : undefined}
          onKeyDown={onMeldClick ? e => e.key === 'Enter' && onMeldClick(i) : undefined}
        >
          {meld.map(card => (
            <Card key={card.id} card={card} faceUp={true} size={size} />
          ))}
        </div>
      ))}
    </div>
  )
}
