import { AnimatePresence, motion } from 'framer-motion'
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
      <AnimatePresence>
        {melds.map((meld, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0.4, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.4, opacity: 0, y: 10, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 350, damping: 22 }}
            className={`flex rounded transition-all ${onMeldClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 hover:ring-offset-transparent' : ''}`}
            onClick={onMeldClick ? () => onMeldClick(i) : undefined}
            role={onMeldClick ? 'button' : undefined}
            tabIndex={onMeldClick ? 0 : undefined}
            onKeyDown={onMeldClick ? e => e.key === 'Enter' && onMeldClick(i) : undefined}
            data-testid="meld"
            data-meld-index={i}
          >
            {meld.map((card, ci) => (
              <motion.div key={card.id} layout className={ci === 0 ? '' : '-ml-1'} data-card-state="melded">
                <Card card={card} faceUp={true} size={size} />
              </motion.div>
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
