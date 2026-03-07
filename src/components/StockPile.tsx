type Props = {
  count: number
  onClick?: () => void
  canDraw?: boolean
}

export default function StockPile({ count, onClick, canDraw = false }: Props) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? e => e.key === 'Enter' && onClick?.() : undefined}
        className={`
          relative w-28 h-40 rounded-lg select-none
          ${canDraw ? 'cursor-pointer' : 'cursor-default'}
        `}
      >
        {/* Stack shadow cards */}
        {count > 2 && <div className="absolute top-2 left-2 w-28 h-40 rounded-lg border-2 border-blue-700 bg-blue-900" />}
        {count > 1 && <div className="absolute top-1 left-1 w-28 h-40 rounded-lg border-2 border-blue-700 bg-blue-900" />}
        {count > 0 ? (
          <div className={`
            absolute inset-0 rounded-lg border-2 bg-blue-900
            flex items-center justify-center
            ${canDraw ? 'border-green-400 ring-2 ring-green-400/50' : 'border-blue-700'}
          `}>
            {/* Card back pattern */}
            <div className="w-[70%] h-[70%] rounded border border-blue-600 bg-blue-800 grid grid-cols-3 gap-0.5 p-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="rounded bg-blue-700 opacity-70" />
              ))}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
            <span className="text-gray-600 text-xs">Empty</span>
          </div>
        )}
      </div>
      {/* Count below */}
      <span className="text-white text-sm font-bold">{count}</span>
    </div>
  )
}
