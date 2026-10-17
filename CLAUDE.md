# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm + turbo monorepo for a proof-of-work captcha. Packages live in `pkgs/`:

- `pkgs/pow-captcha` (`@pow-captcha/pow-captcha`): the TypeScript library, exporting the `server`, `solver` and `wire` namespaces from `src/lib.ts`.
- `pkgs/solver-wasm`: a Rust crate compiled with `wasm-pack` into `pkgs/solver-wasm/dist`, which is published as `@pow-captcha/solver-wasm`.
- `pkgs/benchmark`: a React Router (SSR) + Vite app that times the JS and WASM solvers against each other.

## Commands

```sh
# WASM solver (needs wasm-pack); must run before the rest, see below
pnpm --dir pkgs/solver-wasm build

pnpm install
pnpm build                      # turbo run build (pow-captcha tsc, benchmark react-router build)

# library tests (jest + @swc/jest)
pnpm --filter @pow-captcha/pow-captcha test
pnpm --filter @pow-captcha/pow-captcha test src/solver/solver.spec.ts -t verify

# Rust tests
cargo test --manifest-path pkgs/solver-wasm/Cargo.toml

# benchmark app
pnpm --filter benchmark dev
pnpm --filter benchmark check   # react-router typegen && tsc
pnpm --filter benchmark lint
```

### WASM build is outside turbo

`pnpm-workspace.yaml` registers `pkgs/solver-wasm/dist` as the workspace package, not the crate directory, and `pkgs/solver-wasm/package.json` has no name. This means `pnpm build` never runs `wasm-pack`, and `pnpm install` cannot link `@pow-captcha/solver-wasm` until `dist/` exists. After changing `src/lib.rs`, rebuild it explicitly.

### Consumers use compiled output

`@pow-captcha/pow-captcha` resolves to `dist/lib.js`, so the benchmark only sees library changes after `pow-captcha` is rebuilt (turbo's `^build` handles this for `pnpm build`). The solver spawns its worker through `new URL("./worker.js", import.meta.url)`, which resolves relative to the compiled `dist/solver/` file.

## Architecture

### Protocol (`server.ts`, `wire.ts`)

The server is stateless: everything it needs to remember is signed and round-tripped by the client.

1. `createChallenges` generates `challengeCount` random `[nonce, target]` pairs (base64) plus `difficultyBits`, then signs them.
2. The client solves every challenge and sends back `{ challengesSigned, solutions }` (`challengeSolutionSchema`).
3. `redeemChallengeSolution` checks the signature, verifies every solution, and returns a signed `Redeemed` token.
4. `verifyRedeemed` checks that token.

Signing (`serializeAndSignData` / `verifyAndDeserializeData`) uses `SHA-256` over `` `${json}:${secret}` ``, encoded as UTF-16 code units. Payloads are validated with `zod/mini` schemas, and each payload type carries a fixed `magic` UUID literal so that a signed challenge can't be passed off as a redeemed token or vice versa. The `*Raw` variants skip signing.

### Proof of work (must stay in sync across JS and Rust)

A solution is an 8-byte little-endian counter `i`. It is valid when the first `difficultyBits` bits of `SHA-256(i_le_bytes || nonce)` equal the first `difficultyBits` bits of `target`: whole bytes are compared directly and leftover bits through a high-bit mask. Three implementations exist and must agree:

- `solveJs` and `verify` in `pkgs/pow-captcha/src/solver/solver.ts`
- `solve` in `pkgs/solver-wasm/src/lib.rs`

The JS and Rust test suites share a test vector: nonce `[1, 2]`, target `[3, 4, 5]`, 18 bits → `[45, 176, 0, 0, 0, 0, 0, 0]`.

### Client solving (`solver/`)

`solveChallenges` splits the challenges into chunks according to `navigator.hardwareConcurrency` and starts one module Worker per chunk. Each worker first posts `WORKER_READY`, then receives a `WorkerRequest` and replies with a `WorkerResponse` (types in `shared.ts`). `engine` picks `"js"` or `"wasm"`. If it is unset, the worker tries WASM and falls back to JS. Because the WASM module is imported inside the worker, bundlers must apply WASM/top-level-await plugins to workers too (see `pkgs/benchmark/vite.config.ts`).

## Conventions

- Formatting: tabs (spaces for `*.rs`), LF, Prettier with double quotes. ESLint flat config at the root (`js/recommended` + `typescript-eslint`).
- TypeScript runs with `strict` and `noUncheckedIndexedAccess`. Library tests are `*.spec.ts` next to the source and are excluded from the `tsc` build and from the npm package (`.npmignore`).
- Commits follow Conventional Commits with an optional package scope, e.g. `feat(benchmark): …`, `fix: …`.
