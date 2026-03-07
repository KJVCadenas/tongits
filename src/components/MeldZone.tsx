import type { Card as CardType } from '../game/deck'
import Card from './Card'

type Props = {
  melds: CardType[][]
  label: string
  size?: 'meld' | 'opponent'
}

export default function MeldZone({ melds, label: _label, size = 'meld' }: Props) {
  return (
    <div className="flex flex-row flex-wrap gap-2 items-center min-h-8 px-2">
      {melds.map((meld, i) => (
        <div key={i} className="flex">
          {meld.map(card => (
            <Card key={card.id} card={card} faceUp={true} size={size} />
          ))}
        </div>
      ))}
    </div>
  )
}
