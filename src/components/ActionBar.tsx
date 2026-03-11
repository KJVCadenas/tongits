import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'

type Props = {
  onCallDraw?: () => void
}

export default function ActionBar({ onCallDraw }: Props) {
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const hasDrawnThisTurn = useUIStore(s => s.hasDrawnThisTurn)

  const isMyTurn = game.currentTurn === role

  function promptLabel() {
    if (game.phase === 'ROUND_END') return 'ROUND OVER'
    if (game.phase === 'BOT_TURN') return `${game.playerNames[game.currentTurn]}'s turn…`
    if (isMyTurn && game.dealerFirstTurn) return 'EXPOSE MELDS OR DISCARD'
    if (isMyTurn && !hasDrawnThisTurn) return 'PICK A CARD TO DRAW'
    if (isMyTurn && hasDrawnThisTurn) return 'PLAY OR DISCARD'
    return `${game.playerNames[game.currentTurn]}'s turn`
  }

  return (
    <div className={`w-full flex items-center justify-between px-4 py-2 transition-colors duration-300 ${isMyTurn && game.phase !== 'ROUND_END' ? 'bg-yellow-500/20' : 'bg-black/40'}`}>
      <div className="w-24" />
      <span className={`text-sm font-bold tracking-widest ${isMyTurn && game.phase !== 'ROUND_END' ? 'text-yellow-300' : 'text-white/80'}`} data-testid="turn-prompt">{promptLabel()}</span>
      <div className="w-24 flex justify-end">
        {onCallDraw && (
          <button
            onClick={onCallDraw}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-white text-xs font-bold tracking-wide transition-colors"
            data-testid="btn-call-draw"
          >
            CALL DRAW
          </button>
        )}
      </div>
    </div>
  )
}
