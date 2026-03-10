import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  count: number
  onClick?: () => void
  canDraw?: boolean
  isAiHighlighted?: boolean
}

export default function StockPile({ count, onClick, canDraw = false, isAiHighlighted = false }: Props) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? e => e.key === 'Enter' && onClick?.() : undefined}
        whileTap={onClick ? { scale: 0.92 } : undefined}
        className={`
          relative w-28 h-40 rounded-lg select-none
          ${canDraw ? 'cursor-pointer' : 'cursor-default'}
          ${isAiHighlighted ? 'ring-2 ring-indigo-400/80' : ''}
        `}
        data-testid="btn-draw-stock"
        data-can-draw={canDraw}
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
      </motion.div>
      {/* Count below — animates on change */}
      <AnimatePresence mode="wait">
        <motion.span
          key={count}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.2 }}
          className="text-white text-sm font-bold"
        >
          {count}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
