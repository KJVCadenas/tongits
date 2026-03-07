import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'

export function useGame() {
  const dispatch = useGameStore(s => s.dispatch)
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const setHasDrawnThisTurn = useUIStore(s => s.setHasDrawnThisTurn)
  const setSelectedCard = useUIStore(s => s.setSelectedCard)
  const selectedCardId = useUIStore(s => s.selectedCardId)

  // Reset hasDrawnThisTurn whenever the turn changes
  const prevTurn = useRef(game.currentTurn)
  useEffect(() => {
    if (game.currentTurn !== prevTurn.current) {
      setHasDrawnThisTurn(false)
      setSelectedCard(null)
      prevTurn.current = game.currentTurn
    }
  }, [game.currentTurn, setHasDrawnThisTurn, setSelectedCard])

  // AI turn automation
  useEffect(() => {
    if (game.phase !== 'AI_TURN' || game.currentTurn !== 'ai') return

    const timer = setTimeout(() => {
      const ai = game.players.find(p => p.id === 'ai')
      if (!ai) return

      // Draw: take discard top if available, otherwise draw from stock
      if (game.discardPile.length > 0) {
        dispatch({ type: 'DRAW_FROM_DISCARD' })
      } else {
        dispatch({ type: 'DRAW_FROM_STOCK' })
      }

      // Discard: pick a random card from hand (after draw we need updated state)
      // We schedule a second timeout to discard after the draw state propagates
      setTimeout(() => {
        const updatedGame = useGameStore.getState().game
        const updatedAi = updatedGame.players.find(p => p.id === 'ai')
        if (!updatedAi || updatedAi.hand.length === 0) return
        const randomCard = updatedAi.hand[Math.floor(Math.random() * updatedAi.hand.length)]
        dispatch({ type: 'DISCARD', cardId: randomCard.id })
      }, 400)
    }, 1200)

    return () => clearTimeout(timer)
  }, [game.phase, game.currentTurn, game.players, game.discardPile, dispatch])

  function drawFromStock() {
    if (role !== game.currentTurn) return
    dispatch({ type: 'DRAW_FROM_STOCK' })
    setHasDrawnThisTurn(true)
  }

  function drawFromDiscard() {
    if (role !== game.currentTurn) return
    dispatch({ type: 'DRAW_FROM_DISCARD' })
    setHasDrawnThisTurn(true)
  }

  function discard() {
    if (!selectedCardId || role !== game.currentTurn) return
    dispatch({ type: 'DISCARD', cardId: selectedCardId })
    setSelectedCard(null)
    setHasDrawnThisTurn(false)
  }

  return { drawFromStock, drawFromDiscard, discard }
}
