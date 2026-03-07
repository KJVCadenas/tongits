import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'

export default function ActionBar() {
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const hasDrawnThisTurn = useUIStore(s => s.hasDrawnThisTurn)

  const isMyTurn = game.currentTurn === role

  function promptLabel() {
    if (game.phase === 'ROUND_END') return 'ROUND OVER'
    if (game.phase === 'AI_TURN') return "AI's turn…"
    if (isMyTurn && !hasDrawnThisTurn) return 'PICK A CARD'
    if (isMyTurn && hasDrawnThisTurn) return 'SELECT A CARD TO DISCARD'
    return `${game.currentTurn?.toUpperCase()}'s turn`
  }

  return (
    <div className="w-full flex items-center justify-center py-1.5 bg-black/40">
      <span className="text-white text-xs font-bold tracking-widest">{promptLabel()}</span>
    </div>
  )
}
