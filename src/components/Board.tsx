import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { useGame } from '../hooks/useGame'
import type { PlayerId } from '../game/engine'
import type { Card } from '../game/deck'
import Hand from './Hand'
import CardStack from './CardStack'
import MeldZone from './MeldZone'
import DiscardPile from './DiscardPile'
import StockPile from './StockPile'
import ActionBar from './ActionBar'

export default function Board() {
  const game = useGameStore(s => s.game)
  const selectedCardId = useUIStore(s => s.selectedCardId)
  const setSelectedCard = useUIStore(s => s.setSelectedCard)
  const role = useUIStore(s => s.role)
  const hasDrawnThisTurn = useUIStore(s => s.hasDrawnThisTurn)

  const { drawFromStock, drawFromDiscard, discard } = useGame()
  const [sortedHand, setSortedHand] = useState<Card[] | null>(null)

  const myId: PlayerId = role ?? 'host'
  const me = game.players.find(p => p.id === myId)!

  // Reset sorted hand whenever actual hand changes (draw/discard)
  useEffect(() => {
    setSortedHand(null)
  }, [me.hand.length])

  const opponentId: PlayerId = myId === 'host' ? 'guest' : 'host'
  const opponentLabel = opponentId === 'host' ? 'Host' : 'Guest'

  const opponent = game.players.find(p => p.id === opponentId)!
  const ai = game.players.find(p => p.id === 'ai')!

  const isMyTurn = game.currentTurn === myId
  const isActive = game.phase === 'PLAYER_TURN' || game.phase === 'AI_TURN'
  const canDraw = isMyTurn && isActive && !hasDrawnThisTurn

  function handleDump() {
    if (!selectedCardId || !isMyTurn || !hasDrawnThisTurn) return
    discard()
  }

  function handleSort() {
    const POINT_VALUE: Record<string, number> = {
      'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 10, 'Q': 10, 'K': 10,
    }
    const SUIT_ORDER = ['C', 'D', 'H', 'S']
    const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const hand = sortedHand ?? me.hand
    const sorted = [...hand].sort((a, b) => {
      const pointDiff = POINT_VALUE[a.rank] - POINT_VALUE[b.rank]
      if (pointDiff !== 0) return pointDiff
      const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)
      if (rankDiff !== 0) return rankDiff
      return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
    })
    setSortedHand(sorted)
  }

  function handleMyCardClick(id: string) {
    if (!isMyTurn || !hasDrawnThisTurn) return
    if (selectedCardId === id) {
      // Second tap on same card = discard it
      discard()
    } else {
      setSelectedCard(id)
    }
  }

  return (
    <div className="flex h-screen w-screen bg-[#0d2d3e] text-white overflow-hidden">

      {/* ── Left column: opponent ── */}
      <div className="flex flex-col items-center gap-4 px-3 py-4 w-36 shrink-0 border-r border-white/10 bg-black/20">
        <CardStack count={opponent.hand.length} label={opponentLabel} />
        {opponent.melds.length > 0 && (
          <MeldZone melds={opponent.melds} label={opponentLabel} size="opponent" />
        )}
      </div>

      {/* ── Center column ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Stock + discard — vertically centered in upper portion */}
        <div className="flex flex-1 items-center justify-center gap-10">
          <StockPile
            count={game.stock.length}
            onClick={drawFromStock}
            canDraw={canDraw && game.stock.length > 0}
          />
          <DiscardPile
            pile={game.discardPile}
            onClick={drawFromDiscard}
            canDraw={canDraw && game.discardPile.length > 0}
          />
          {game.phase === 'ROUND_END' && (
            <div className="absolute text-3xl text-yellow-400 font-black tracking-wide drop-shadow-lg">
              Round Over!
            </div>
          )}
        </div>

        {/* Player meld trough */}
        <div className="shrink-0 mx-3 mb-2 rounded-xl bg-black/30 border border-white/10 min-h-14 flex items-center">
          {me.melds.length > 0 ? (
            <MeldZone melds={me.melds} label="My Melds" size="meld" />
          ) : (
            <span className="text-gray-600 text-xs italic px-4 uppercase tracking-widest">Drop Area</span>
          )}
        </div>

        {/* Action bar + hand */}
        <div className="shrink-0 flex flex-col bg-[#0a1f2b] border-t border-white/10">
          <ActionBar />
          <Hand
            cards={sortedHand ?? me.hand}
            faceUp={true}
            selectedCardId={selectedCardId}
            onCardClick={handleMyCardClick}
            label="My Hand"
            onDump={isMyTurn && hasDrawnThisTurn && selectedCardId ? handleDump : undefined}
            onSort={handleSort}
          />
        </div>
      </div>

      {/* ── Right column: AI ── */}
      <div className="flex flex-col items-center gap-4 px-3 py-4 w-36 shrink-0 border-l border-white/10 bg-black/20">
        <CardStack count={ai.hand.length} label="AI" />
        {ai.melds.length > 0 && (
          <MeldZone melds={ai.melds} label="AI" size="opponent" />
        )}
      </div>

    </div>
  )
}
