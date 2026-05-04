// =============================================================================
// Card Types
// =============================================================================

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type WildColor = Color | 'wild';

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActionValue = 'skip' | 'reverse' | 'draw_two';
export type WildValue = 'wild' | 'wild_draw_four';

export type CardKind = 'number' | 'action' | 'wild';

export interface NumberCard {
  id: string;
  kind: 'number';
  color: Color;
  value: NumberValue;
}

export interface ActionCard {
  id: string;
  kind: 'action';
  color: Color;
  value: ActionValue;
}

export interface WildCard {
  id: string;
  kind: 'wild';
  color: 'wild';
  value: WildValue;
}

export type Card = NumberCard | ActionCard | WildCard;

// =============================================================================
// Game State
// =============================================================================

export type Direction = 1 | -1;

export type GameStatus = 'waiting' | 'playing' | 'finished' | 'cancelled';

export interface PlayerPublic {
  id: string;
  address: string;
  chain: SupportedChain;
  username?: string;
  seatIndex: number;
  cardCount: number;
  calledUno: boolean;
  connected: boolean;
}

export interface PlayerPrivate extends PlayerPublic {
  hand: Card[];
}

/** What a client receives — opponents' hands are hidden, only their own hand is exposed. */
export interface ClientGameState {
  id: string;
  mode: 'ai' | 'pvp';
  status: GameStatus;
  players: PlayerPublic[];
  selfHand: Card[];
  topDiscard: Card | null;
  currentColor: WildColor;
  currentPlayerIndex: number;
  direction: Direction;
  drawPileCount: number;
  turnStartedAt: number;
  turnTimeLimit: number;
  pendingChallenge: PendingWildDrawFour | null;
  winnerId: string | null;
  payoutTxHash: string | null;
}

/** Server-authoritative state. Players' hands are visible. */
export interface ServerGameState {
  id: string;
  mode: 'ai' | 'pvp';
  status: GameStatus;
  players: PlayerPrivate[];
  deck: Card[];
  discardPile: Card[];
  currentColor: WildColor;
  currentPlayerIndex: number;
  direction: Direction;
  turnStartedAt: number;
  turnTimeLimit: number;
  pendingChallenge: PendingWildDrawFour | null;
  winnerId: string | null;
  escrowGameId: string | null;
  chain: SupportedChain | null;
  buyIn: string;
  createdAt: number;
}

/** When a player plays a Wild Draw Four, the next player has a window to challenge. */
export interface PendingWildDrawFour {
  playerId: string;       // who played the WD4
  targetPlayerId: string; // who must draw 4 (or challenge)
  /** Snapshot of color BEFORE the WD4 was played (used to determine legality). */
  priorColor: WildColor;
  declaredColor: Color;
  expiresAt: number;
}

// =============================================================================
// Lobby
// =============================================================================

export interface Lobby {
  id: string;
  hostId: string;
  hostAddress: string;
  chain: SupportedChain;
  buyIn: string;          // String to preserve big number precision
  maxPlayers: 2 | 3 | 4;
  turnTimeLimit: number;  // ms
  visibility: 'public' | 'private';
  status: 'open' | 'starting' | 'in_game' | 'closed';
  players: LobbyPlayer[];
  createdAt: number;
  gameId: string | null;
}

export interface LobbyPlayer {
  id: string;
  address: string;
  chain: SupportedChain;
  username?: string;
  ready: boolean;
  depositTxHash?: string;
  joinedAt: number;
}

// =============================================================================
// Chains
// =============================================================================

export type EVMChain =
  | 'ethereum'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'polygon'
  | 'avalanche'
  | 'bnb';

export type SupportedChain = EVMChain | 'solana' | 'aptos';

export type ChainType = 'evm' | 'solana' | 'aptos';

export interface ChainInfo {
  id: SupportedChain;
  type: ChainType;
  displayName: string;
  nativeSymbol: string;
  chainId?: number;          // Numeric chainId for EVM
  escrowAddress?: string;    // Per-chain escrow contract address
  rpcUrl: string;
  explorerUrl: string;
}

// =============================================================================
// Socket Events
// =============================================================================

export interface ClientToServerEvents {
  'lobby:create': (
    payload: {
      maxPlayers: 2 | 3 | 4;
      buyIn: string;
      chain: SupportedChain;
      turnTimeLimit: number;
      visibility: 'public' | 'private';
    },
    cb: (resp: ApiResponse<{ lobby: Lobby }>) => void,
  ) => void;
  'lobby:list': (cb: (resp: ApiResponse<{ lobbies: Lobby[] }>) => void) => void;
  'lobby:join': (
    payload: { lobbyId: string; depositTxHash: string },
    cb: (resp: ApiResponse<{ lobby: Lobby }>) => void,
  ) => void;
  'lobby:leave': (payload: { lobbyId: string }) => void;
  'lobby:ready': (payload: { lobbyId: string; ready: boolean }) => void;

  'game:play_card': (payload: {
    gameId: string;
    cardId: string;
    chosenColor?: Color;
  }) => void;
  'game:draw_card': (payload: { gameId: string }) => void;
  'game:keep_drawn': (payload: { gameId: string; play: boolean; chosenColor?: Color }) => void;
  'game:call_uno': (payload: { gameId: string }) => void;
  'game:catch_uno': (payload: { gameId: string; targetPlayerId: string }) => void;
  'game:challenge_wd4': (payload: { gameId: string }) => void;
  'game:accept_wd4': (payload: { gameId: string }) => void;
  'game:chat': (payload: { gameId: string; message: string }) => void;
}

export interface ServerToClientEvents {
  'lobby:updated': (lobby: Lobby) => void;
  'lobby:closed': (payload: { lobbyId: string; reason: string }) => void;
  'lobby:list': (lobbies: Lobby[]) => void;
  'lobby:game_starting': (payload: { lobbyId: string; gameId: string; countdown: number }) => void;

  'game:state': (state: ClientGameState) => void;
  'game:event': (event: GameEvent) => void;
  'game:over': (payload: {
    gameId: string;
    winnerId: string;
    scores: { playerId: string; score: number }[];
    payoutTxHash: string | null;
  }) => void;
  'game:error': (payload: { code: string; message: string }) => void;
}

// =============================================================================
// Game Events (broadcast)
// =============================================================================

export type GameEvent =
  | { type: 'card_played'; playerId: string; card: Card; newColor: WildColor }
  | { type: 'card_drawn'; playerId: string; cardCount: number }
  | { type: 'turn_change'; currentPlayerId: string; direction: Direction; expiresAt: number }
  | { type: 'uno_called'; playerId: string }
  | { type: 'uno_caught'; caughtPlayerId: string; catcherPlayerId: string; penaltyCount: number }
  | { type: 'wd4_played'; playerId: string; targetPlayerId: string; expiresAt: number }
  | {
      type: 'wd4_resolved';
      challengerId: string;
      challengedId: string;
      wasLegal: boolean;
      penaltyCardsDrawn: number;
      challenger: 'drew' | 'skipped';
    }
  | { type: 'player_disconnected'; playerId: string }
  | { type: 'player_reconnected'; playerId: string }
  | { type: 'chat'; playerId: string; message: string };

// =============================================================================
// API
// =============================================================================

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
