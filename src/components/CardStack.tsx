import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  count: number
  label: string
  isActive?: boolean
}

export default function CardStack({ count, label, isActive = false }: Props) {
  const initials = label.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`avatar-${label}`}>
      {/* Avatar circle — pulses during active turn */}
      <div className={`w-10 h-10 rounded-full bg-indigo-700 border-2 flex items-center justify-center transition-all duration-300 ${isActive ? 'border-yellow-400 ring-2 ring-yellow-400/60 animate-pulse' : 'border-indigo-400'}`}>
        <span className="text-white text-xs font-bold">{initials}</span>
      </div>
      {/* Name + card count */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-white text-xs font-semibold leading-none max-w-20 truncate">{label}</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={count}
            initial={{ scale: 1.4, color: '#facc15', opacity: 0.8 }}
            animate={{ scale: 1, color: '#ffffff', opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.3 }}
            className="bg-gray-800 text-xs font-bold px-2 py-0.5 rounded-full leading-none"
            data-testid={`card-count-${label}`}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}
