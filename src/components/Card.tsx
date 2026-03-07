import { GiSpades, GiHearts, GiDiamonds, GiClubs } from 'react-icons/gi'
import type { Card as CardType } from '../game/deck'
import type { IconType } from 'react-icons'

type CardSize = 'hand' | 'meld' | 'opponent'

type Props = {
  card: CardType
  faceUp: boolean
  selected?: boolean
  size?: CardSize
  onClick?: () => void
}

const SUIT_ICON: Record<string, IconType> = {
  S: GiSpades,
  H: GiHearts,
  D: GiDiamonds,
  C: GiClubs,
}

const RED_SUITS = new Set(['H', 'D'])

const SIZE_CLASSES: Record<CardSize, string> = {
  hand: 'w-28 h-40',
  meld: 'w-12 h-16',
  opponent: 'w-10 h-14',
}

// Top-left rank label
const RANK_SIZE: Record<CardSize, string> = {
  hand: 'text-4xl',
  meld: 'text-base',
  opponent: 'text-sm',
}

// Top-left suit icon — same visual height as rank
const SUIT_PIP_SIZE: Record<CardSize, string> = {
  hand: 'text-4xl',
  meld: 'text-base',
  opponent: 'text-sm',
}

// Bottom-right large suit icon
const SUIT_CORNER_SIZE: Record<CardSize, string> = {
  hand: 'text-7xl',
  meld: 'text-xl',
  opponent: 'text-base',
}

// Bottom-right large suit icon
const FACE_CORNER_SIZE: Record<CardSize, string> = {
  hand: 'text-7xl',
  meld: 'text-xl',
  opponent: 'text-base',
}

const FACE_RANKS = new Set(['A', 'J', 'Q', 'K'])

export default function Card({ card, faceUp, selected = false, size = 'hand', onClick }: Props) {
  const isRed = RED_SUITS.has(card.suit)
  const SuitIcon = SUIT_ICON[card.suit]
  const sizeClass = SIZE_CLASSES[size]
  const rankSize = RANK_SIZE[size]
  const suitPip = SUIT_PIP_SIZE[size]
  const suitCorner = SUIT_CORNER_SIZE[size]
  const isFace = FACE_RANKS.has(card.rank)
  const faceCorner = FACE_CORNER_SIZE[size]

  const base = `
    ${sizeClass} rounded-lg select-none shrink-0 transition-transform duration-100
    ${onClick ? 'cursor-pointer' : 'cursor-default'}
    ${selected ? '-translate-y-4' : ''}
  `

  if (!faceUp) {
    return (
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
        className={`${base} bg-blue-900 border-2 border-blue-700 flex items-center justify-center`}
      >
        <div className="w-[70%] h-[70%] rounded border border-blue-600 bg-blue-800 grid grid-cols-3 gap-0.5 p-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded bg-blue-700 opacity-70" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
      className={`
        ${base}
        bg-white flex flex-col p-1.5
        ${selected
          ? 'border-2 border-yellow-400 ring-2 ring-yellow-300 shadow-lg shadow-yellow-200/40'
          : 'border border-gray-200 shadow-sm'
        }
        ${onClick ? 'hover:-translate-y-1' : ''}
        ${isRed ? 'text-red-600' : 'text-gray-900'}
      `}
    >
      {/* Top-left: rank + suit stacked */}
      <div className="flex flex-col items-center leading-none" style={{ width: 'fit-content' }}>
        <span className={`${rankSize} font-black leading-none`}>{card.rank}</span>
        <SuitIcon className={`${suitPip} -mt-0.5`} />
      </div>

      {/* Bottom-right: large suit icon only */}
      <div className="flex justify-end items-end flex-1">
        {isFace
          ? <span className={`${faceCorner} font-black leading-none`}>{card.rank}</span>
          : <SuitIcon className={suitCorner} />
        }
      </div>
    </div>
  )
}
