# UNO ONCHAIN

Multichain UNO with a 3D environment, AI mode, real-time multiplayer, on-chain
escrowed prize pools, and a companion Chrome extension. Strict official UNO
rules — no house rules.

## Repo layout

```
uno-onchain/
├── apps/
│   ├── web/              React + R3F web client
│   ├── server/           Node + Socket.IO authoritative game server
│   └── extension/        Chrome MV3 extension (mini 2D client)
├── packages/
│   └── shared/           Engine, AI, types, constants — used by every app
└── contracts/
    ├── evm/              Solidity escrow (UnoEscrow.sol) + Hardhat
    ├── aptos/            Move escrow module
    └── solana/           Anchor escrow program
```

## What works

- **Game engine** (`packages/shared/src/engine`) — official UNO rules with
  unit tests covering deck composition, Skip/Reverse (incl. 2-player Reverse =
  Skip), Draw Two effect, Wild Draw Four legality + challenge, UNO call/catch,
  scoring, and end-of-round.
- **AI opponent** — easy / medium / hard strategies; runs client-side for solo
  play, no server required.
- **Server** — Socket.IO with JWT auth (EVM signature → JWT exchange), lobby
  manager, authoritative game manager, turn timers, server-only deck shuffle.
  Per-player state projection so opponent hands stay hidden.
- **Web client** — 3D table built with React Three Fiber (procedurally
  generated card-face textures, dynamic rim light tracking the active color),
  2D card-fan overlay for the local hand, color picker for Wilds, lobby
  browser and creation UI, wallet connect via RainbowKit (7 EVM chains).
- **Chrome extension** — MV3 popup with a simplified 2D board, syncs the JWT
  from the website to play in-extension while you work, badge-based
  notifications when it's your turn.
- **EVM escrow contract** — `UnoEscrow.sol` with reentrancy guard, pausable,
  EIP-191 settlement signature verification, refund-on-leave, host-leave
  cancellation refunds all players. Tests in `contracts/evm/test`.
- **Aptos escrow** — Move module with Ed25519 signature verification.
- **Solana escrow** — Anchor program with PDA-per-game, defers Ed25519 verify
  to the native program via Sysvar::Instructions.
- **Postgres schema** — users, games, game_players, game_actions, leaderboard.

## Setup

```bash
# 1. Install
npm install

# 2. Run the engine tests
npm test --workspace=@uno/shared

# 3. Run server + web in parallel (in separate terminals)
npm run dev --workspace=@uno/server
npm run dev --workspace=@uno/web

# 4. Build the Chrome extension
npm run build --workspace=@uno/extension
# Then load apps/extension/dist as an unpacked extension in chrome://extensions
```

## Environment variables

Server (`apps/server/.env`):
```
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
JWT_SECRET=replace-me
DATABASE_URL=postgresql://...
SETTLEMENT_PRIVATE_KEY=0x...   # signs (gameId, winner) for escrow.settleGame
LOG_LEVEL=info
```

Web (`apps/web/.env`):
```
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_WC_PROJECT_ID=your_walletconnect_project_id
```

EVM contract (`contracts/evm/.env`):
```
DEPLOYER_PRIVATE_KEY=0x...
TREASURY_ADDRESS=0x...
SETTLEMENT_SIGNER_ADDRESS=0x...
ETHERSCAN_API_KEY=...
# RPC overrides per network (optional)
BASE_RPC=...
ARBITRUM_RPC=...
```

## Settlement flow

1. Server determines winner (engine-authoritative).
2. Server signs `keccak256(gameId || winner)` using `SETTLEMENT_PRIVATE_KEY`.
3. Server (or any caller) submits `settleGame(gameId, winner, signature)` to
   the chain's escrow contract.
4. Contract verifies signature against the registered `settlementSigner`,
   computes 1.5% fee → treasury, sends remainder → winner.

## Design notes / what's stubbed

- **Solana / Aptos sign-in** — server's `/auth/verify` accepts non-EVM
  signatures without verification. Production would call into chain-specific
  verifiers (`@solana/web3.js`'s `nacl.sign.detached.verify` and Aptos's
  Ed25519 helpers).
- **Solana / Aptos lobby join from the web client** — `useEscrow` only
  implements the EVM path. The Solana / Aptos providers are wired in the
  multi-wallet shell but not the deposit instruction.
- **3D card animations** — meshes and procedural textures are in place;
  bezier deal/play animations and physics-based winner scatter are not yet
  implemented (next milestone).
- **Reconnect grace + AI takeover** — server sets `connected=false` on
  disconnect and broadcasts the change, but the 60-second forfeit timer that
  pays remaining players proportionally isn't wired yet.
- **Admin dashboard** at `/admin` — not implemented.
- **Wild Draw Four challenge legality** — engine inspects the challenged
  player's *current* hand. Since they've just played the WD4 (which leaves
  the hand and adds nothing), this is equivalent to inspecting the hand at
  the moment of play, per the official rule.

## Phase plan

The build follows the spec's recommended order:
- **Phase 1** (engine + 3D + AI + UI shells) — done.
- **Phase 2** (multiplayer lobbies + sockets) — done.
- **Phase 3** (smart contracts + payment integration) — contracts written and
  EVM tested; deploy + wire to lobby flow next.
- **Phase 4** (extension + animation polish + mobile) — extension popup and
  badge done; animation polish + mobile responsive layout pending.

## Security

- All game logic is server-authoritative. Clients send intents
  (`game:play_card`, `game:draw_card`, …) and receive validated state.
- Hidden information: the server projects state per-player and never sends
  opponent hands.
- Cryptographic Fisher–Yates shuffle (Web Crypto on both Node 18+ and the
  browser).
- Settlements require an off-chain signature by the registered settlement
  signer; the contract caps the platform fee at 5%.
- Backend is rate-limited (100 req/min per IP) and Zod-validates every
  socket payload.
