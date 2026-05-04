import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type {
  ApiResponse,
  ClientToServerEvents,
  Lobby,
  ServerToClientEvents,
  SupportedChain,
} from '@uno/shared';
import { ALL_CHAINS, DEFAULT_TURN_TIMER_MS } from '@uno/shared';
import { GameManager } from './gameManager.js';
import { LobbyManager } from './lobbyManager.js';
import { GameError } from '../game/engine.js';
import { logger } from '../utils/logger.js';
import type { AuthPayload } from '../middleware/auth.js';

interface SocketData {
  user: AuthPayload;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const SUPPORTED_CHAIN_SCHEMA = z.enum(ALL_CHAINS as [SupportedChain, ...SupportedChain[]]);

const CreateLobbySchema = z.object({
  maxPlayers: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  buyIn: z.string().regex(/^\d+$/, 'buyIn must be base-10 wei string'),
  chain: SUPPORTED_CHAIN_SCHEMA,
  turnTimeLimit: z.number().int().min(15_000).max(120_000).default(DEFAULT_TURN_TIMER_MS),
  visibility: z.enum(['public', 'private']),
});

const JoinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  depositTxHash: z.string().min(1),
});

const PlayCardSchema = z.object({
  gameId: z.string().min(1),
  cardId: z.string().min(1),
  chosenColor: z.enum(['red', 'yellow', 'green', 'blue']).optional(),
});

const SimpleGameSchema = z.object({ gameId: z.string().min(1) });
const KeepDrawnSchema = z.object({
  gameId: z.string().min(1),
  play: z.boolean(),
  chosenColor: z.enum(['red', 'yellow', 'green', 'blue']).optional(),
});
const CatchUnoSchema = z.object({ gameId: z.string().min(1), targetPlayerId: z.string().min(1) });
const ChatSchema = z.object({
  gameId: z.string().min(1),
  message: z.string().min(1).max(280),
});

export function registerSocketHandlers(
  io: AppServer,
  lobbyManager: LobbyManager,
  gameManager: GameManager,
): void {
  io.on('connection', (socket: AppSocket) => {
    const user = socket.data.user;
    logger.info({ userId: user.address, sid: socket.id }, 'socket connected');

    socket.join(userRoom(user.address));

    // -----------------------------------------------------------------------
    // LOBBY
    // -----------------------------------------------------------------------
    socket.on('lobby:list', (cb) => {
      cb(ok({ lobbies: lobbyManager.list() }));
    });

    socket.on('lobby:create', (raw, cb) => {
      const parsed = CreateLobbySchema.safeParse(raw);
      if (!parsed.success) return cb(err(parsed.error.message, 'BAD_INPUT'));

      try {
        const lobby = lobbyManager.create({
          hostId: user.address,
          hostAddress: user.address,
          chain: parsed.data.chain,
          buyIn: parsed.data.buyIn,
          maxPlayers: parsed.data.maxPlayers,
          turnTimeLimit: parsed.data.turnTimeLimit,
          visibility: parsed.data.visibility,
        });
        socket.join(lobbyRoom(lobby.id));
        broadcastLobbyList(io, lobbyManager);
        cb(ok({ lobby }));
      } catch (e) {
        cb(err((e as Error).message));
      }
    });

    socket.on('lobby:join', (raw, cb) => {
      const parsed = JoinLobbySchema.safeParse(raw);
      if (!parsed.success) return cb(err(parsed.error.message, 'BAD_INPUT'));
      try {
        const lobby = lobbyManager.join(parsed.data.lobbyId, {
          id: user.address,
          address: user.address,
          chain: user.chain,
          depositTxHash: parsed.data.depositTxHash,
        });
        socket.join(lobbyRoom(lobby.id));
        io.to(lobbyRoom(lobby.id)).emit('lobby:updated', lobby);
        broadcastLobbyList(io, lobbyManager);

        if (lobbyManager.isReadyToStart(lobby) || lobby.players.length === lobby.maxPlayers) {
          startGameFromLobby(io, lobbyManager, gameManager, lobby);
        }
        cb(ok({ lobby }));
      } catch (e) {
        cb(err((e as Error).message));
      }
    });

    socket.on('lobby:leave', (raw) => {
      const parsed = SimpleGameSchema.safeParse({ gameId: raw.lobbyId });
      if (!parsed.success) return;
      try {
        const { lobby, cancelled } = lobbyManager.leave(parsed.data.gameId, user.address);
        socket.leave(lobbyRoom(lobby.id));
        if (cancelled) {
          io.to(lobbyRoom(lobby.id)).emit('lobby:closed', {
            lobbyId: lobby.id,
            reason: 'host left',
          });
        } else {
          io.to(lobbyRoom(lobby.id)).emit('lobby:updated', lobby);
        }
        broadcastLobbyList(io, lobbyManager);
      } catch {
        /* ignore */
      }
    });

    socket.on('lobby:ready', (raw) => {
      try {
        const lobby = lobbyManager.setReady(raw.lobbyId, user.address, raw.ready);
        io.to(lobbyRoom(lobby.id)).emit('lobby:updated', lobby);
        if (lobbyManager.isReadyToStart(lobby)) {
          startGameFromLobby(io, lobbyManager, gameManager, lobby);
        }
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'lobby:ready failed');
      }
    });

    // -----------------------------------------------------------------------
    // GAME
    // -----------------------------------------------------------------------
    socket.on('game:play_card', (raw) => {
      const parsed = PlayCardSchema.safeParse(raw);
      if (!parsed.success) return socket.emit('game:error', { code: 'BAD_INPUT', message: parsed.error.message });
      try {
        const result = gameManager.playCard(
          parsed.data.gameId,
          user.address,
          parsed.data.cardId,
          parsed.data.chosenColor,
        );
        for (const ev of result.events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
        broadcastGameState(io, gameManager, parsed.data.gameId);
        if (result.gameOver) {
          finishGame(io, gameManager, parsed.data.gameId);
        }
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:draw_card', (raw) => {
      const parsed = SimpleGameSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const result = gameManager.drawCard(parsed.data.gameId, user.address);
        for (const ev of result.events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
        broadcastGameState(io, gameManager, parsed.data.gameId);
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:keep_drawn', (raw) => {
      const parsed = KeepDrawnSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const result = gameManager.resolveDrawnCard(
          parsed.data.gameId,
          user.address,
          parsed.data.play,
          parsed.data.chosenColor,
        );
        for (const ev of result.events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
        broadcastGameState(io, gameManager, parsed.data.gameId);
        if (result.gameOver) finishGame(io, gameManager, parsed.data.gameId);
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:call_uno', (raw) => {
      const parsed = SimpleGameSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const events = gameManager.callUno(parsed.data.gameId, user.address);
        for (const ev of events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:catch_uno', (raw) => {
      const parsed = CatchUnoSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const events = gameManager.catchUno(
          parsed.data.gameId,
          user.address,
          parsed.data.targetPlayerId,
        );
        for (const ev of events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
        broadcastGameState(io, gameManager, parsed.data.gameId);
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:challenge_wd4', (raw) => {
      const parsed = SimpleGameSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const result = gameManager.challengeWildDrawFour(parsed.data.gameId, user.address);
        for (const ev of result.events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
        broadcastGameState(io, gameManager, parsed.data.gameId);
        if (result.gameOver) finishGame(io, gameManager, parsed.data.gameId);
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:accept_wd4', (raw) => {
      const parsed = SimpleGameSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        const result = gameManager.acceptWildDrawFour(parsed.data.gameId, user.address);
        for (const ev of result.events) io.to(gameRoom(parsed.data.gameId)).emit('game:event', ev);
        broadcastGameState(io, gameManager, parsed.data.gameId);
      } catch (e) {
        emitGameError(socket, e);
      }
    });

    socket.on('game:chat', (raw) => {
      const parsed = ChatSchema.safeParse(raw);
      if (!parsed.success) return;
      io.to(gameRoom(parsed.data.gameId)).emit('game:event', {
        type: 'chat',
        playerId: user.address,
        message: parsed.data.message,
      });
    });

    socket.on('disconnect', (reason) => {
      logger.info({ userId: user.address, reason }, 'socket disconnected');
      // Mark player as disconnected in any game they're in (best-effort).
      // The game manager's reconnection grace timer is responsible for forfeits.
    });
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

function err<T>(message: string, code?: string): ApiResponse<T> {
  return { ok: false, error: message, code };
}

function userRoom(address: string): string {
  return `user:${address.toLowerCase()}`;
}
function lobbyRoom(id: string): string {
  return `lobby:${id}`;
}
function gameRoom(id: string): string {
  return `game:${id}`;
}

function emitGameError(socket: AppSocket, e: unknown): void {
  const msg = (e as Error).message ?? 'unknown error';
  const code = e instanceof GameError ? e.code : 'GAME_ERROR';
  socket.emit('game:error', { code, message: msg });
}

function broadcastLobbyList(io: AppServer, lobbyManager: LobbyManager): void {
  io.emit('lobby:list', lobbyManager.list());
}

function broadcastGameState(io: AppServer, gameManager: GameManager, gameId: string): void {
  const sockets = io.sockets.adapter.rooms.get(gameRoom(gameId));
  if (!sockets) return;
  for (const sid of sockets) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    const view = gameManager.view(gameId, s.data.user.address);
    if (view) s.emit('game:state', view);
  }
}

function finishGame(io: AppServer, gameManager: GameManager, gameId: string): void {
  const state = gameManager.get(gameId);
  if (!state || !state.winnerId) return;
  const scores = gameManager.finalScores(gameId);
  // Settlement to escrow contract is handled out-of-band; payoutTxHash is set later
  // by the on-chain settlement service. Emit the result now and update later.
  io.to(gameRoom(gameId)).emit('game:over', {
    gameId,
    winnerId: state.winnerId,
    scores,
    payoutTxHash: null,
  });
}

function startGameFromLobby(
  io: AppServer,
  lobbyManager: LobbyManager,
  gameManager: GameManager,
  lobby: Lobby,
): void {
  const gameId = `g_${lobby.id}`;
  lobbyManager.markStarting(lobby.id, gameId);
  io.to(lobbyRoom(lobby.id)).emit('lobby:game_starting', {
    lobbyId: lobby.id,
    gameId,
    countdown: 10,
  });
  setTimeout(() => {
    gameManager.create({
      id: gameId,
      mode: 'pvp',
      players: lobby.players.map((p) => ({
        id: p.address,
        address: p.address,
        chain: p.chain,
        username: p.username,
      })),
      turnTimeLimit: lobby.turnTimeLimit,
      chain: lobby.chain,
      buyIn: lobby.buyIn,
      escrowGameId: lobby.id,
    });
    // Move sockets into the game room.
    const lobbyRoomId = lobbyRoom(lobby.id);
    const gameRoomId = gameRoom(gameId);
    const sockets = io.sockets.adapter.rooms.get(lobbyRoomId);
    if (sockets) {
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.join(gameRoomId);
      }
    }
    broadcastGameState(io, gameManager, gameId);
  }, 10_000);
}
