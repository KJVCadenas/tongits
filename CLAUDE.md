# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start dev server with HMR
pnpm build      # Type-check and build for production (tsc -b && vite build)
pnpm lint       # Run ESLint
pnpm test       # Run tests with Vitest (node environment)
pnpm preview    # Preview production build
```

## Stack

- **React 19** with React Compiler enabled (via `babel-plugin-react-compiler`)
- **TypeScript 5.9** with strict mode, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`
- **Vite 7** as bundler
- **Zustand 5** for state management
- **PeerJS 1.5** for peer-to-peer multiplayer networking
- **Framer Motion 12** for card animations
- **Tailwind CSS 4** via `@tailwindcss/vite` plugin
- **pnpm** as package manager

## Architecture

### Game Engine (`src/game/engine.ts`)

The core is a pure reducer: `gameReducer(state: GameState, action: GameAction) => GameState`.

**Game modes**: `'solo'` (host + 2 bots), `'duo'` (host + 1 guest + 1 bot), `'trio'` (host + 2 guests)

**Turn order** by mode:
- solo: `host → bot1 → bot2`
- duo: `host → bot1 → guest`
- trio: `host → guest2 → guest`

**Key state fields**:
- `drawPhase: boolean` — true between turns (player must draw), false after drawing
- `dealerFirstTurn: boolean` — dealer skips the draw phase on their first turn of a round
- `drawRestriction` — tracks sapaw-based restrictions (self or opponent sapawed last turn)
- `roundResult` — populated at round end; triggers scoring overlay

**Round end conditions**: Tongit (empty hand), stock depletion, or draw call resolution.

**Draw-from-discard is atomic**: `DRAW_FROM_DISCARD` auto-lays the matching meld in the same action — no separate `LAY_MELD` needed.

### Networking (`src/network/`)

- `host.ts` — `GameHost` generates a 6-char Crockford base-32 room code. Converts to PeerJS ID as `tongits-{CODE}`. Receives `ACTION_INTENT` from guests, validates it's their turn, then dispatches to the reducer.
- `guest.ts` — `GameGuest` connects using the 6-char code. Sends `ACTION_INTENT` for each action, receives `STATE_SNAPSHOT` to sync state.
- Host broadcasts `STATE_SNAPSHOT` on every game state change.
- Lobby sync uses `LOBBY_SNAPSHOT` and `GUEST_READY` messages.

### State Management (`src/store/`)

- `gameStore.ts` — Wraps `gameReducer` in Zustand. `dispatch()` for host/solo; `syncFromHost(snapshot)` for guests (direct state replacement).
- `uiStore.ts` — UI-only state: card selection (`selectedCardIds`), pending meld groups, `hasDrawnThisTurn` (reset via `useRef` on turn change), pile highlight for bot animations.

### Hook Layer (`src/hooks/`)

- `useGame.ts` — All game actions (draw, discard, layMeld, sapaw, etc.). Routes through `sendIntent` for guests or direct `dispatch` for host/solo. Drives bot turns via `useEffect` watching `currentTurn === 'bot*'` with 1200ms draw delay + 400ms discard delay.
- `usePeer.ts` — Manages `GameHost`/`GameGuest` lifecycle: room code, guest connections, ready state, lobby snapshots. Broadcasts `STATE_SNAPSHOT` via `useEffect` on game state changes.

### TypeScript Constraints

- `verbatimModuleSyntax`: use `import type` for type-only imports
- `erasableSyntaxOnly`: no enums, namespaces, or parameter properties
- `moduleResolution: bundler` — no file extensions needed in imports
- ESLint: `argsIgnorePattern: '^_'` allows underscore-prefixed unused parameters

### Tests

Test files live at `src/game/tongits.test.ts` (engine) and `src/network/roomCode.test.ts`. Vitest runs in `node` environment. The tsconfig excludes `*.test.ts` from the production build.
