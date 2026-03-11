# Tong-its

A browser-based implementation of Tong-its — a popular Filipino card game. Play solo against AI bots or host/join a real-time multiplayer session via peer-to-peer networking.

## Features

- **Three game modes**: Solo (vs 2 bots), Duo (1 guest + 1 bot), Trio (2 guests)
- **AI bots**: Automated opponents with draw and discard logic
- **P2P multiplayer**: Serverless networking via PeerJS — share a 6-character room code to invite others
- **Card animations**: Smooth deal, draw, and discard animations powered by Framer Motion
- **Pure game engine**: Core logic is a pure reducer, fully unit-tested with Vitest

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 19 + TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Networking | PeerJS 1.5 |
| Animations | Framer Motion 12 |

## Getting Started

**Prerequisites**: Node.js 20+, [pnpm](https://pnpm.io/)

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Commands

```bash
pnpm dev      # Start dev server with HMR
pnpm build    # Type-check and build for production
pnpm preview  # Preview production build
pnpm lint     # Run ESLint
pnpm test     # Run tests with Vitest
```

## Game Modes

| Mode | Players |
|---|---|
| Solo | Host + 2 bots |
| Duo | Host + 1 guest + 1 bot |
| Trio | Host + 2 guests |

**Multiplayer**: The host gets a 6-character room code. Guests enter the code in the lobby to connect directly via WebRTC — no server required.

## Architecture

```
src/
├── game/          # Pure game engine (deck, engine, melds)
├── network/       # PeerJS host/guest wrappers, room code utils
├── store/         # Zustand stores (gameStore, uiStore)
├── hooks/         # useGame (actions + bot AI), usePeer (P2P lifecycle)
└── components/    # Board, Hand, Card, MeldZone, Lobby, ActionBar, ...
```

- **`game/engine.ts`** — `gameReducer(state, action) => GameState` pure reducer; all game rules live here
- **`network/host.ts`** — Receives `ACTION_INTENT` from guests, validates turn order, dispatches to reducer, broadcasts `STATE_SNAPSHOT`
- **`network/guest.ts`** — Sends `ACTION_INTENT`, receives `STATE_SNAPSHOT` to sync state
- **`store/gameStore.ts`** — Wraps the reducer in Zustand; guests call `syncFromHost()` to replace state directly
- **`hooks/useGame.ts`** — Exposes all player actions; drives bot turns via `useEffect` with timed delays
