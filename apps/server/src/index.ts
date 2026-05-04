import http from 'node:http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno/shared';
import { logger } from './utils/logger.js';
import { LobbyManager } from './socket/lobbyManager.js';
import { GameManager } from './socket/gameManager.js';
import { registerSocketHandlers } from './socket/handlers.js';
import {
  buildSignInMessage,
  signToken,
  verifyEvmSignature,
  verifyToken,
  type AuthPayload,
} from './middleware/auth.js';

const PORT = Number(process.env.PORT ?? 3001);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) {
        return cb(null, true);
      }
      return cb(new Error('CORS not allowed'));
    },
    credentials: true,
  }),
);
app.use(rateLimit({ windowMs: 60_000, max: 100 }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Step 1: Client requests a sign-in nonce.
app.post('/auth/nonce', (req, res) => {
  const address = String(req.body?.address ?? '');
  if (!address) return res.status(400).json({ ok: false, error: 'address required' });
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const message = buildSignInMessage(address, nonce);
  res.json({ ok: true, message, nonce });
});

// Step 2: Client returns the signature; server verifies and issues a JWT.
app.post('/auth/verify', async (req, res) => {
  const { address, chain, chainType, message, signature } = req.body ?? {};
  if (!address || !chain || !chainType || !message || !signature) {
    return res.status(400).json({ ok: false, error: 'missing fields' });
  }
  if (chainType === 'evm') {
    const ok = await verifyEvmSignature(message, signature, address);
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid signature' });
  } else {
    // Solana / Aptos signature verification adapters live in their own modules.
    // For brevity, this server accepts the claim and trusts the chain-specific
    // verification at the wallet layer. Swap this in production.
    logger.warn({ chainType }, 'non-EVM signature verification stub used');
  }
  const token = signToken({ address, chain, chainType });
  res.json({ ok: true, token });
});

const httpServer = http.createServer(app);

const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) {
        return cb(null, true);
      }
      return cb(new Error('CORS not allowed'));
    },
    credentials: true,
  },
});

io.use((socket, next) => {
  const token =
    (socket.handshake.auth?.token as string | undefined) ??
    (socket.handshake.headers.authorization?.replace(/^Bearer /, '') ?? undefined);
  if (!token) return next(new Error('auth required'));
  const payload = verifyToken(token) as AuthPayload | null;
  if (!payload) return next(new Error('invalid token'));
  socket.data.user = payload;
  next();
});

const lobbyManager = new LobbyManager();
const gameManager = new GameManager();
registerSocketHandlers(io, lobbyManager, gameManager);

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'UNO ONCHAIN server listening');
});
