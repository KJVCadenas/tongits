import type { Card as CardType } from '../game/deck'
import Card from './Card'

type Props = {
  pile: CardType[]
  onClick?: () => void
  canDraw?: boolean
  onViewHistory?: () => void
}

export default function DiscardPile({ pile, onClick, canDraw = false, onViewHistory }: Props) {
  const top = pile[0]
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-28 h-40">
        {top ? (
          <>
            {pile[1] && (
              <div className="absolute top-1 left-1 w-28 h-40 rounded-lg border border-gray-300 bg-white opacity-30" />
            )}
            <div
              className={`absolute inset-0 ${canDraw ? 'cursor-pointer' : 'cursor-default'} ${canDraw ? 'ring-2 ring-amber-400/70 rounded-lg' : ''}`}
              onClick={onClick}
              role={onClick ? 'button' : undefined}
              tabIndex={onClick ? 0 : undefined}
              onKeyDown={onClick ? e => e.key === 'Enter' && onClick?.() : undefined}
              data-testid="btn-draw-discard"
              data-can-draw={canDraw}
            >
              <Card card={top} faceUp={true} size="hand" />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
            <span className="text-gray-600 text-xs">Empty</span>
          </div>
        )}
      </div>
      {/* PICK indicator below when drawable */}
      {canDraw && top ? (
        <span className="text-amber-400 text-xs font-bold tracking-wider">PICK</span>
      ) : (
        <span className="text-gray-600 text-xs">{pile.length}</span>
      )}
      {onViewHistory && (
        <button
          onClick={onViewHistory}
          className="text-white/40 hover:text-white/80 transition-colors"
          data-testid="btn-view-discard-history"
          title="View discard history"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      )}
    </div>
  )
}
