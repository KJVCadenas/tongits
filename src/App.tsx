import { useGameStore } from './store/gameStore'
import { usePeer } from './hooks/usePeer'
import Lobby from './components/Lobby'
import Board from './components/Board'

export default function App() {
  const phase = useGameStore(s => s.game.phase)
  const peer = usePeer()

  if (phase === 'LOBBY') {
    return <Lobby peer={peer} />
  }

  return <Board peer={peer} />
}
