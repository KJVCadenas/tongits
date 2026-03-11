import { useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { useGame } from '../hooks/useGame'
import type { usePeer } from '../hooks/usePeer'
import { isValidMeld, canExtendMeld, handTotal, getCardValue, detectMelds } from '../game/melds'
import type { GameMode, PlayerId } from '../game/engine'
import type { Card } from '../game/deck'
import Hand from './Hand'
import CardStack from './CardStack'
import MeldZone from './MeldZone'
import CardComponent from './Card'
import DiscardPile from './DiscardPile'
import StockPile from './StockPile'
import ActionBar from './ActionBar'
import DiscardHistoryModal from './DiscardHistoryModal'

type Props = {
  peer: ReturnType<typeof usePeer>
}

function humanPlayersForMode(mode: GameMode): PlayerId[] {
  if (mode === 'solo') return ['host']
  if (mode === 'duo') return ['host', 'guest']
  return ['host', 'guest', 'guest2']
}

export default function Board({ peer }: Props) {
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const selectedCardIds = useUIStore(s => s.selectedCardIds)
  const toggleCardSelection = useUIStore(s => s.toggleCardSelection)
  const hasDrawnThisTurnRaw = useUIStore(s => s.hasDrawnThisTurn)
  const highlightedPile = useUIStore(s => s.highlightedPile)
  const [showDiscardHistory, setShowDiscardHistory] = useState(false)
  const hasDrawnThisTurn = hasDrawnThisTurnRaw || game.dealerFirstTurn

  const {
    drawFromStock,
    drawFromDiscard,
    discard,
    layPendingMelds,
    groupSelection,
    sapaw,
    callDraw,
    voteNextRound,
    autoMeld,
    pendingMeldGroups,
    discardTopFormsMeld,
  } = useGame((role === 'guest' || role === 'guest2') ? peer.sendIntent : undefined)

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

  // Always exactly 2 opponents; left = opponents[0], right = opponents[1]
  const opponents = game.players.filter(p => p.id !== myId)
  const leftOpponent = opponents[0]
  const rightOpponent = opponents[1]

  const isMyTurn = game.currentTurn === myId
  const isActive = game.phase === 'PLAYER_TURN' || game.phase === 'BOT_TURN'
  const canDraw = isMyTurn && isActive && !hasDrawnThisTurnRaw && !game.dealerFirstTurn

  const pendingIds = new Set(pendingMeldGroups.flat())
  const hasSelectedPendingCard = selectedCardIds.some(id => pendingIds.has(id))

  // Compute whether the current card selection is a valid meld
  const selectedInHand = me.hand.filter(c => selectedCardIds.includes(c.id))
  const isMeldValid = selectedInHand.length >= 2 && isValidMeld(selectedInHand)

  // Sapaw mode: exactly 1 free (non-pending) card selected, player is opened, has drawn
  const canSapaw = isMyTurn && hasDrawnThisTurn
    && selectedCardIds.length === 1 && !pendingIds.has(selectedCardIds[0])

  // Sapaw hints
  const allOpponentMelds = [...(leftOpponent?.melds ?? []), ...(rightOpponent?.melds ?? [])]
  const sapawableCardIds = (isMyTurn && hasDrawnThisTurn)
    ? me.hand.filter(c => !pendingIds.has(c.id) && allOpponentMelds.some(m => canExtendMeld(c, m))).map(c => c.id)
    : []
  const selectedCard = canSapaw ? me.hand.find(c => c.id === selectedCardIds[0]) : null
  const leftHighlightedMelds = selectedCard
    ? new Set(leftOpponent?.melds.flatMap((m, i) => canExtendMeld(selectedCard, m) ? [i] : []) ?? [])
    : undefined
  const rightHighlightedMelds = selectedCard
    ? new Set(rightOpponent?.melds.flatMap((m, i) => canExtendMeld(selectedCard, m) ? [i] : []) ?? [])
    : undefined
  const myHighlightedMelds = selectedCard
    ? new Set(me.melds.flatMap((m, i) => canExtendMeld(selectedCard, m) ? [i] : []))
    : undefined

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
    <MotionConfig reducedMotion="user">
    <div className="flex flex-col h-screen w-screen bg-[#0d2d3e] text-white overflow-hidden">

      {/* ── Top strip: opponent avatars ── */}
      <div className="flex flex-row justify-between items-center px-6 py-2 shrink-0 border-b border-white/10 bg-black/20" data-testid="section-opponents">
        {leftOpponent && (
          <CardStack
            count={leftOpponent.hand.length}
            label={game.playerNames[leftOpponent.id]}
            isActive={game.currentTurn === leftOpponent.id}
          />
        )}
        {rightOpponent && (
          <CardStack
            count={rightOpponent.hand.length}
            label={game.playerNames[rightOpponent.id]}
            isActive={game.currentTurn === rightOpponent.id}
          />
        )}
      </div>

      {/* ── Middle row: left opponent melds | stock+discard | right opponent melds ── */}
      <div className="flex flex-row flex-1 min-h-0 items-center">

        {/* Left opponent meld zone */}
        <div className="flex flex-col justify-center self-stretch flex-1 border-r border-white/10 bg-black/10 px-3 py-4 overflow-auto" data-testid="zone-opponent-melds">
          {leftOpponent && leftOpponent.melds.length > 0 ? (
            <MeldZone
              melds={leftOpponent.melds}
              label={game.playerNames[leftOpponent.id]}
              size="hand"
              onMeldClick={canSapaw ? (i) => sapaw(selectedCardIds[0], leftOpponent.id, i) : undefined}
              highlightedMeldIndices={canSapaw ? leftHighlightedMelds : undefined}
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
            isAiHighlighted={highlightedPile === 'stock'}
          />
          <DiscardPile
            pile={game.discardPile}
            onClick={canDraw && discardTopFormsMeld ? drawFromDiscard : undefined}
            canDraw={canDraw && discardTopFormsMeld}
            onViewHistory={() => setShowDiscardHistory(true)}
            isAiHighlighted={highlightedPile === 'discard'}
          />
        </div>

        {/* Right opponent meld zone */}
        <div className="flex flex-col justify-center self-stretch flex-1 border-l border-white/10 bg-black/10 px-3 py-4 overflow-auto" data-testid="zone-ai-melds">
          {rightOpponent && rightOpponent.melds.length > 0 ? (
            <MeldZone
              melds={rightOpponent.melds}
              label={game.playerNames[rightOpponent.id]}
              size="hand"
              onMeldClick={canSapaw ? (i) => sapaw(selectedCardIds[0], rightOpponent.id, i) : undefined}
              highlightedMeldIndices={canSapaw ? rightHighlightedMelds : undefined}
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
            highlightedMeldIndices={canSapaw ? myHighlightedMelds : undefined}
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
          sapawableCardIds={sapawableCardIds}
          onCardClick={handleMyCardClick}
          label="My Hand"
          onDump={isMyTurn && hasDrawnThisTurn && !!dumpCardId ? handleDump : undefined}
          onAutoMeld={handleAutoMeld}
          onSort={handleSort}
        />
      </div>

      {/* ── Discard History modal ── */}
      {showDiscardHistory && (
        <DiscardHistoryModal
          discardPile={game.discardPile}
          onClose={() => setShowDiscardHistory(false)}
        />
      )}

      {/* ── Round End overlay ── */}
      {game.phase === 'ROUND_END' && game.roundResult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a1f2b] rounded-2xl p-5 border border-white/20 flex flex-col items-center gap-4 w-full max-w-5xl" data-testid="modal-round-end">
            {/* Header row */}
            <div className="flex items-center gap-4 w-full justify-between">
              <h2 className="text-3xl font-black text-yellow-400" data-testid="round-end-title">
                {game.roundResult.reason === 'tongit' ? 'TONGIT!' : 'ROUND OVER'}
              </h2>
              <p className="text-white text-base" data-testid="round-end-result">
                Winner: <span className="font-bold">{game.playerNames[game.roundResult.winner]}</span>
                {' '}·{' '}
                <span className="text-white/60 capitalize">{game.roundResult.reason}</span>
              </p>
              <div className="flex flex-col items-end gap-1">
                {(() => {
                  const votes = game.nextRoundVotes ?? []
                  const myVote = votes.includes(myId)
                  const humanPlayers = humanPlayersForMode(game.gameMode)
                  return <>
                    <button
                      onClick={myVote ? undefined : voteNextRound}
                      disabled={myVote}
                      className={`px-6 py-2 rounded-xl text-white font-bold text-lg transition-colors ${myVote ? 'bg-gray-600 cursor-not-allowed opacity-60' : 'bg-green-700 hover:bg-green-600'}`}
                      data-testid="btn-next-round"
                    >
                      {myVote ? 'Ready!' : 'Next Round'}
                    </button>
                    <div className="flex gap-3 text-sm">
                      {humanPlayers.map(pid => {
                        const voted = votes.includes(pid)
                        return (
                          <span key={pid} className={voted ? 'text-green-400' : 'text-white/40'}>
                            {voted ? '✓' : '○'} {game.playerNames[pid]}
                          </span>
                        )
                      })}
                    </div>
                  </>
                })()}</div>
            </div>

            {/* 3-column player reveal */}
            <div className="grid grid-cols-3 gap-3 w-full" data-testid="round-end-scores">
              {game.players.map(p => {
                const total = game.roundResult!.totals[p.id] ?? 0
                const isWinner = p.id === game.roundResult!.winner
                const secretMelds = detectMelds(p.hand)
                const secretMeldIds = new Set(secretMelds.flat().map(c => c.id))
                const unmatchedCards = [...p.hand]
                  .filter(c => !secretMeldIds.has(c.id))
                  .sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank))
                return (
                  <div key={p.id} className={`rounded-xl p-3 border ${isWinner ? 'border-yellow-400/60 bg-yellow-400/5' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-base font-bold ${isWinner ? 'text-yellow-400' : 'text-white'}`}>
                        {game.playerNames[p.id]} {isWinner ? '🏆' : ''}
                      </span>
                      <span className="text-white/80 font-bold text-sm">{total} pts</span>
                    </div>

                    {/* Exposed melds */}
                    {p.melds.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Melds</p>
                        <MeldZone melds={p.melds} label="" size="meld" />
                      </div>
                    )}

                    {/* Secret sets (held in hand, not counted) */}
                    {secretMelds.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">Secret Melds <span className="text-white/30">(0 pts)</span></p>
                        <MeldZone melds={secretMelds} label="" size="meld" />
                      </div>
                    )}

                    {/* Unmatched hand */}
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">
                        Unmatched — {unmatchedCards.length} cards · {handTotal(unmatchedCards)} pts
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {unmatchedCards.map(c => (
                          <div key={c.id} className="flex flex-col items-center gap-0.5">
                            <CardComponent card={c} faceUp size="meld" />
                            <span className="text-[9px] text-white/50 font-bold">{getCardValue(c.rank)}</span>
                          </div>
                        ))}
                        {unmatchedCards.length === 0 && <span className="text-white/30 text-xs italic">none</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
    </MotionConfig>
  )
}
