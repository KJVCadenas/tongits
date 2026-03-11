import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { detectMelds, findBestDiscard } from '../game/melds'
import type { PlayerId, GameAction } from '../game/engine'

export function useGame(sendIntent?: (action: GameAction) => void) {
  const dispatch = useGameStore(s => s.dispatch)
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const setHasDrawnThisTurn = useUIStore(s => s.setHasDrawnThisTurn)
  const clearCardSelection = useUIStore(s => s.clearCardSelection)
  const groupSelection = useUIStore(s => s.groupSelection)
  const setPendingMeldGroups = useUIStore(s => s.setPendingMeldGroups)
  const addPendingMeld = useUIStore(s => s.addPendingMeld)
  const setHighlightedPile = useUIStore(s => s.setHighlightedPile)
  const pendingMeldGroups = useUIStore(s => s.pendingMeldGroups)
  const selectedCardIds = useUIStore(s => s.selectedCardIds)
  const hasDrawnThisTurn = useUIStore(s => s.hasDrawnThisTurn) || game.dealerFirstTurn

  // Guest routes through sendIntent; host/solo dispatches directly
  function sendAction(action: GameAction) {
    if (sendIntent) {
      sendIntent(action)
    } else {
      dispatch(action)
    }
  }

  // Reset selection and hasDrawnThisTurn whenever the turn changes
  const prevTurn = useRef(game.currentTurn)
  useEffect(() => {
    if (game.currentTurn !== prevTurn.current) {
      setHasDrawnThisTurn(false)
      clearCardSelection()
      prevTurn.current = game.currentTurn
    }
  }, [game.currentTurn, setHasDrawnThisTurn, clearCardSelection])

  // Bot turn automation (covers both bot1 and bot2)
  useEffect(() => {
    if (game.phase !== 'BOT_TURN') return
    const botId = game.currentTurn
    const bot = game.players.find(p => p.id === botId)
    if (!bot) return

    const timer = setTimeout(() => {
      const currentBot = useGameStore.getState().game.players.find(p => p.id === botId)
      if (!currentBot) return

      // Draw: prefer discard pile only if top card can form a valid meld
      const topDiscard = game.discardPile[0]
      const canDrawDiscard = topDiscard && detectMelds([...currentBot.hand, topDiscard]).some(m =>
        m.some(c => c.id === topDiscard.id)
      )
      if (canDrawDiscard) {
        setHighlightedPile('discard')
        dispatch({ type: 'DRAW_FROM_DISCARD' })
      } else {
        setHighlightedPile('stock')
        dispatch({ type: 'DRAW_FROM_STOCK' })
      }

      // After draw: lay melds, then discard highest-value card
      setTimeout(() => {
        const updatedGame = useGameStore.getState().game
        const updatedBot = updatedGame.players.find(p => p.id === botId)
        if (!updatedBot || updatedBot.hand.length === 0) return

        // Lay all detected melds
        const melds = detectMelds(updatedBot.hand)
        for (const meld of melds) {
          dispatch({ type: 'LAY_MELD', playerId: botId, cardIds: meld.map(c => c.id) })
        }

        // Read latest state after meld dispatches (Zustand set is synchronous)
        const afterMeldGame = useGameStore.getState().game
        if (afterMeldGame.phase === 'ROUND_END') return

        const afterMeldBot = afterMeldGame.players.find(p => p.id === botId)
        if (!afterMeldBot || afterMeldBot.hand.length === 0) return

        // Discard highest-value card
        const cardToDiscard = findBestDiscard(afterMeldBot.hand)
        setHighlightedPile('discard')
        dispatch({ type: 'DISCARD', cardId: cardToDiscard.id })
        setTimeout(() => setHighlightedPile(null), 600)
      }, 400)
    }, 1200)

    return () => clearTimeout(timer)
  }, [game.phase, game.currentTurn, game.players, game.discardPile, dispatch, setHighlightedPile])

  function drawFromStock() {
    if (role !== game.currentTurn) return
    sendAction({ type: 'DRAW_FROM_STOCK' })
    setHasDrawnThisTurn(true)
  }

  function drawFromDiscard() {
    if (role !== game.currentTurn) return
    sendAction({ type: 'DRAW_FROM_DISCARD' })
    setHasDrawnThisTurn(true)
  }

  function discard(cardId: string) {
    if (role !== game.currentTurn) return
    sendAction({ type: 'DISCARD', cardId })
    clearCardSelection()
    setHasDrawnThisTurn(false)
  }

  // Lay only the pending meld group(s) that contain a currently selected card
  function layPendingMelds() {
    if (!role || role !== game.currentTurn) return
    if (!hasDrawnThisTurn) return
    const selectedSet = new Set(selectedCardIds)
    const toLayGroups = pendingMeldGroups.filter(g => g.some(id => selectedSet.has(id)))
    const toKeepGroups = pendingMeldGroups.filter(g => !g.some(id => selectedSet.has(id)))
    for (const cardIds of toLayGroups) {
      if (cardIds.length >= 3) {
        sendAction({ type: 'LAY_MELD', playerId: role, cardIds })
      }
    }
    clearCardSelection()
    setPendingMeldGroups(toKeepGroups)
  }

  function sapaw(cardId: string, targetPlayerId: PlayerId, meldIndex: number) {
    if (!role || role !== game.currentTurn) return
    if (!hasDrawnThisTurn) return
    sendAction({ type: 'SAPAW', playerId: role, cardId, targetPlayerId, meldIndex })
    clearCardSelection()
  }

  function callDraw() {
    if (!role || role !== game.currentTurn) return
    if (hasDrawnThisTurn) return
    const me = game.players.find(p => p.id === role)
    if (!me?.isOpened) return
    sendAction({ type: 'CALL_DRAW', playerId: role })
  }

  function voteNextRound() {
    if (role === 'guest') {
      sendAction({ type: 'VOTE_NEXT_ROUND', playerId: 'guest' })
    } else if (role === 'guest2') {
      sendAction({ type: 'VOTE_NEXT_ROUND', playerId: 'guest2' })
    } else {
      // Host votes for themselves
      dispatch({ type: 'VOTE_NEXT_ROUND', playerId: 'host' })
    }
  }

  // Bot auto-vote when round ends (host-side only — bots are always local)
  useEffect(() => {
    if (game.phase !== 'ROUND_END') return
    if (role === 'guest' || role === 'guest2') return
    for (const p of game.players) {
      if (p.id === 'bot1' || p.id === 'bot2') {
        dispatch({ type: 'VOTE_NEXT_ROUND', playerId: p.id })
      }
    }
  }, [game.phase, role, game.players, dispatch])

  function autoMeld() {
    if (!role || role !== game.currentTurn) return
    if (!hasDrawnThisTurn) return
    const me = game.players.find(p => p.id === role)
    if (!me) return
    // Exclude cards already grouped into pending melds
    const pendingIds = new Set(pendingMeldGroups.flat())
    const freeCards = me.hand.filter(c => !pendingIds.has(c.id))
    const melds = detectMelds(freeCards)
    if (melds.length === 0) return
    clearCardSelection()
    for (const meld of melds) {
      addPendingMeld(meld.map(c => c.id))
    }
  }

  const topDiscard = game.discardPile[0]
  const mePlayer = game.players.find(p => p.id === (role ?? 'host'))
  const discardTopFormsMeld = !!(topDiscard && mePlayer &&
    detectMelds([...mePlayer.hand, topDiscard]).some(m => m.some(c => c.id === topDiscard.id))
  )

  return {
    drawFromStock,
    drawFromDiscard,
    discard,
    layPendingMelds,
    groupSelection,
    sapaw,
    callDraw,
    voteNextRound,
    autoMeld,
    selectedCardIds,
    pendingMeldGroups,
    discardTopFormsMeld,
  }
}
