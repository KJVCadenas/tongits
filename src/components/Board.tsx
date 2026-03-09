import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { useGame } from '../hooks/useGame'
import type { usePeer } from '../hooks/usePeer'
import { isValidMeld } from '../game/melds'
import type { PlayerId } from '../game/engine'
import type { Card } from '../game/deck'
import Hand from './Hand'
import CardStack from './CardStack'
import MeldZone from './MeldZone'
import DiscardPile from './DiscardPile'
import StockPile from './StockPile'
import ActionBar from './ActionBar'

type Props = {
  peer: ReturnType<typeof usePeer>
}

export default function Board({ peer }: Props) {
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const selectedCardIds = useUIStore(s => s.selectedCardIds)
  const toggleCardSelection = useUIStore(s => s.toggleCardSelection)
  const hasDrawnThisTurn = useUIStore(s => s.hasDrawnThisTurn)

  const {
    drawFromStock,
    drawFromDiscard,
    discard,
    layPendingMelds,
    groupSelection,
    sapaw,
    callDraw,
    nextRound,
    autoMeld,
    pendingMeldGroups,
    discardTopFormsMeld,
  } = useGame(role === 'guest' ? peer.sendIntent : undefined)

  const [sortedHand, setSortedHand] = useState<Card[] | null>(null)

  const myId: PlayerId = role ?? 'host'
  const me = game.players.find(p => p.id === myId)!

  // Keep sortedHand in sync with actual hand — filter out removed cards, append new ones
  const handIds = me.hand.map(c => c.id)
  const displayHand = sortedHand
    ? [
        ...sortedHand.filter(c => handIds.includes(c.id)),
        ...me.hand.filter(c => !sortedHand.some(s => s.id === c.id)),
      ]
    : me.hand

  const opponentId: PlayerId = myId === 'host' ? 'guest' : 'host'
  const opponentLabel = opponentId === 'host' ? 'Host' : 'Guest'

  const opponent = game.players.find(p => p.id === opponentId)!
  const ai = game.players.find(p => p.id === 'ai')!

  const isMyTurn = game.currentTurn === myId
  const isActive = game.phase === 'PLAYER_TURN' || game.phase === 'AI_TURN'
  const canDraw = isMyTurn && isActive && !hasDrawnThisTurn

  const pendingIds = new Set(pendingMeldGroups.flat())
  const hasSelectedPendingCard = selectedCardIds.some(id => pendingIds.has(id))

  // Compute whether the current card selection is a valid meld
  const selectedInHand = me.hand.filter(c => selectedCardIds.includes(c.id))
  const isMeldValid = selectedInHand.length >= 2 && isValidMeld(selectedInHand)

  // Sapaw mode: exactly 1 free (non-pending) card selected, player is opened, has drawn
  const canSapaw = isMyTurn && hasDrawnThisTurn
    && selectedCardIds.length === 1 && !pendingIds.has(selectedCardIds[0])

  // Dump: only allow dumping a free card (not one in a pending group)
  const dumpCardId = selectedCardIds.filter(id => !pendingIds.has(id)).at(-1) ?? null

  function handleDump() {
    if (!dumpCardId || !isMyTurn || !hasDrawnThisTurn) return
    discard(dumpCardId)
  }

  function handleSort() {
    const POINT_VALUE: Record<string, number> = {
      'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 10, 'Q': 10, 'K': 10,
    }
    const SUIT_ORDER = ['C', 'D', 'H', 'S']
    const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const sorted = [...displayHand].sort((a, b) => {
      const pointDiff = POINT_VALUE[a.rank] - POINT_VALUE[b.rank]
      if (pointDiff !== 0) return pointDiff
      const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)
      if (rankDiff !== 0) return rankDiff
      return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
    })
    setSortedHand(sorted)
  }

  function handleAutoMeld() {
    autoMeld()
    handleSort()
  }

  function handleMyCardClick(id: string) {
    if (!isMyTurn || !hasDrawnThisTurn) return
    toggleCardSelection(id)
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d2d3e] text-white overflow-hidden">

      {/* ── Top strip: opponent avatars ── */}
      <div className="flex flex-row justify-between items-center px-6 py-2 shrink-0 border-b border-white/10 bg-black/20" data-testid="section-opponents">
        <CardStack count={opponent.hand.length} label={opponentLabel} />
        <CardStack count={ai.hand.length} label="AI" />
      </div>

      {/* ── Middle row: opponent melds | stock+discard | AI melds ── */}
      <div className="flex flex-row flex-1 min-h-0 items-center">

        {/* Opponent meld zone */}
        <div className="flex flex-col justify-center self-stretch flex-1 border-r border-white/10 bg-black/10 px-3 py-4 overflow-auto" data-testid="zone-opponent-melds">
          {opponent.melds.length > 0 ? (
            <MeldZone
              melds={opponent.melds}
              label={opponentLabel}
              size="hand"
              onMeldClick={canSapaw ? (i) => sapaw(selectedCardIds[0], opponentId, i) : undefined}
            />
          ) : (
            <span className="text-gray-600 text-xs italic uppercase tracking-widest">Drop Area</span>
          )}
        </div>

        {/* Stock + discard — shrink to fit content */}
        <div className="flex shrink-0 items-center justify-center gap-10 px-8" data-testid="section-piles">
          <StockPile
            count={game.stock.length}
            onClick={canDraw && game.stock.length > 0 ? drawFromStock : undefined}
            canDraw={canDraw && game.stock.length > 0}
          />
          <DiscardPile
            pile={game.discardPile}
            onClick={canDraw && discardTopFormsMeld ? drawFromDiscard : undefined}
            canDraw={canDraw && discardTopFormsMeld}
          />
        </div>

        {/* AI meld zone */}
        <div className="flex flex-col justify-center self-stretch flex-1 border-l border-white/10 bg-black/10 px-3 py-4 overflow-auto" data-testid="zone-ai-melds">
          {ai.melds.length > 0 ? (
            <MeldZone
              melds={ai.melds}
              label="AI"
              size="hand"
              onMeldClick={canSapaw ? (i) => sapaw(selectedCardIds[0], 'ai', i) : undefined}
            />
          ) : (
            <span className="text-gray-600 text-xs italic uppercase tracking-widest">Drop Area</span>
          )}
        </div>
      </div>

      {/* ── Player meld trough ── */}
      <div className="shrink-0 mx-3 mb-2 rounded-xl bg-black/30 border border-white/10 min-h-14 flex items-center justify-between pr-3" data-testid="section-player-melds">
        {me.melds.length > 0 ? (
          <MeldZone
            melds={me.melds}
            label="My Melds"
            size="meld"
            onMeldClick={canSapaw ? (i) => sapaw(selectedCardIds[0], myId, i) : undefined}
          />
        ) : (
          <span className="text-gray-600 text-xs italic px-4 uppercase tracking-widest">Drop Area</span>
        )}
        <div className="flex gap-2 shrink-0">
          {isMeldValid && isMyTurn && hasDrawnThisTurn && (
            <button
              onClick={groupSelection}
              className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-white text-sm font-bold tracking-wide transition-colors"
              data-testid="btn-group-meld"
            >
              Group
            </button>
          )}
          {hasSelectedPendingCard && isMyTurn && hasDrawnThisTurn && (
            <button
              onClick={layPendingMelds}
              className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-white text-sm font-bold tracking-wide transition-colors"
              data-testid="btn-lay-meld"
            >
              Lay Meld
            </button>
          )}
        </div>
      </div>

      {/* ── Action bar + hand ── */}
      <div className="shrink-0 flex flex-col bg-[#0a1f2b] border-t border-white/10">
        <ActionBar
          onCallDraw={isMyTurn && !hasDrawnThisTurn && me.isOpened ? callDraw : undefined}
        />
        <Hand
          cards={displayHand}
          faceUp={true}
          selectedCardIds={selectedCardIds}
          pendingMeldGroups={pendingMeldGroups}
          onCardClick={handleMyCardClick}
          label="My Hand"
          onDump={isMyTurn && hasDrawnThisTurn && !!dumpCardId ? handleDump : undefined}
          onAutoMeld={handleAutoMeld}
          onSort={handleSort}
        />
      </div>

      {/* ── Round End overlay ── */}
      {game.phase === 'ROUND_END' && game.roundResult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#0a1f2b] rounded-2xl p-8 border border-white/20 flex flex-col items-center gap-6 min-w-72" data-testid="modal-round-end">
            <h2 className="text-4xl font-black text-yellow-400" data-testid="round-end-title">
              {game.roundResult.reason === 'tongit' ? 'TONGIT!' : 'ROUND OVER'}
            </h2>
            <p className="text-white text-lg" data-testid="round-end-result">
              Winner: <span className="font-bold capitalize">{game.roundResult.winner}</span>
              {' '}·{' '}
              <span className="text-white/60 capitalize">{game.roundResult.reason}</span>
            </p>
            <div className="flex flex-col gap-1 text-sm w-full" data-testid="round-end-scores">
              {Object.entries(game.roundResult.totals).map(([pid, total]) => (
                <div key={pid} className="flex justify-between">
                  <span className="capitalize text-white/60">{pid}</span>
                  <span className="font-bold text-white/80">{total} pts</span>
                </div>
              ))}
            </div>
            <button
              onClick={nextRound}
              className="px-8 py-3 bg-green-700 hover:bg-green-600 rounded-xl text-white font-bold text-xl transition-colors"
              data-testid="btn-next-round"
            >
              Next Round
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
