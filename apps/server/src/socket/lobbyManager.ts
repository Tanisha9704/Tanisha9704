import { randomUUID } from 'node:crypto';
import type { Lobby, LobbyPlayer, SupportedChain } from '@uno/shared';
import { DEFAULT_TURN_TIMER_MS } from '@uno/shared';

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();

  create(input: {
    hostId: string;
    hostAddress: string;
    chain: SupportedChain;
    buyIn: string;
    maxPlayers: 2 | 3 | 4;
    turnTimeLimit: number;
    visibility: 'public' | 'private';
    depositTxHash?: string;
  }): Lobby {
    const id = randomUUID();
    const host: LobbyPlayer = {
      id: input.hostId,
      address: input.hostAddress,
      chain: input.chain,
      ready: true, // host is auto-ready
      depositTxHash: input.depositTxHash,
      joinedAt: Date.now(),
    };
    const lobby: Lobby = {
      id,
      hostId: input.hostId,
      hostAddress: input.hostAddress,
      chain: input.chain,
      buyIn: input.buyIn,
      maxPlayers: input.maxPlayers,
      turnTimeLimit: input.turnTimeLimit ?? DEFAULT_TURN_TIMER_MS,
      visibility: input.visibility,
      status: 'open',
      players: [host],
      createdAt: Date.now(),
      gameId: null,
    };
    this.lobbies.set(id, lobby);
    return lobby;
  }

  get(id: string): Lobby | undefined {
    return this.lobbies.get(id);
  }

  list(filter?: { chain?: SupportedChain; visibility?: 'public' | 'private' }): Lobby[] {
    return Array.from(this.lobbies.values()).filter((l) => {
      if (l.status !== 'open') return false;
      if (filter?.chain && l.chain !== filter.chain) return false;
      if (filter?.visibility && l.visibility !== filter.visibility) return false;
      // Only public lobbies are listed by default.
      if (!filter?.visibility && l.visibility !== 'public') return false;
      return true;
    });
  }

  join(
    lobbyId: string,
    player: { id: string; address: string; chain: SupportedChain; depositTxHash: string },
  ): Lobby {
    const lobby = this.required(lobbyId);
    if (lobby.status !== 'open') throw new Error('Lobby is not open');
    if (lobby.players.length >= lobby.maxPlayers) throw new Error('Lobby is full');
    if (lobby.players.some((p) => p.id === player.id)) throw new Error('Already joined');
    if (lobby.chain !== player.chain) {
      throw new Error('Wallet chain must match the lobby chain');
    }
    const lobbyPlayer: LobbyPlayer = {
      id: player.id,
      address: player.address,
      chain: player.chain,
      ready: false,
      depositTxHash: player.depositTxHash,
      joinedAt: Date.now(),
    };
    lobby.players.push(lobbyPlayer);
    return lobby;
  }

  leave(lobbyId: string, playerId: string): { lobby: Lobby; cancelled: boolean } {
    const lobby = this.required(lobbyId);
    lobby.players = lobby.players.filter((p) => p.id !== playerId);
    const cancelled = lobby.hostId === playerId || lobby.players.length === 0;
    if (cancelled) {
      lobby.status = 'closed';
      this.lobbies.delete(lobbyId);
    }
    return { lobby, cancelled };
  }

  setReady(lobbyId: string, playerId: string, ready: boolean): Lobby {
    const lobby = this.required(lobbyId);
    const player = lobby.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Player not in lobby');
    player.ready = ready;
    return lobby;
  }

  markStarting(lobbyId: string, gameId: string): Lobby {
    const lobby = this.required(lobbyId);
    lobby.status = 'in_game';
    lobby.gameId = gameId;
    return lobby;
  }

  isReadyToStart(lobby: Lobby): boolean {
    return (
      lobby.status === 'open' &&
      lobby.players.length === lobby.maxPlayers &&
      lobby.players.every((p) => p.ready)
    );
  }

  private required(id: string): Lobby {
    const l = this.lobbies.get(id);
    if (!l) throw new Error('Lobby not found');
    return l;
  }
}
