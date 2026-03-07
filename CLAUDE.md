# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start dev server with HMR
pnpm build      # Type-check and build for production (tsc -b && vite build)
pnpm lint       # Run ESLint
pnpm preview    # Preview production build
```

There is no test runner configured yet.

## Stack

- **React 19** with React Compiler enabled (via `babel-plugin-react-compiler`)
- **TypeScript 5.9** with strict mode, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`
- **Vite 7** as bundler
- **pnpm** as package manager

## Architecture

This project is a fresh scaffold — only the default Vite + React + TypeScript boilerplate exists in `src/`. The application (a Tongits card game) has not been built yet.

### TypeScript notes

- `verbatimModuleSyntax` is enabled: use `import type` for type-only imports
- `erasableSyntaxOnly` is enabled: avoid TypeScript syntax that requires emit (e.g., enums, namespaces, parameter properties)
- Module resolution is `bundler` mode — no need for file extensions in imports
