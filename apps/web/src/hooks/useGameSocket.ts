import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno/shared';
import { useGameState } from './useGameState';
import { useMultiWallet } from './useMultiWallet';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

let socketSingleton: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socketSingleton;
}

export function useGameSocket() {
  const { setGame, setLobbies, setCurrentLobby, setGameOver, setRoute, pushEvent } =
    useGameState();
  const { isConnected, jwt } = useMultiWallet();
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    if (!isConnected || !jwt) return;
    const s = io(SOCKET_URL, {
      auth: { token: jwt },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = s;
    socketSingleton = s;

    s.on('connect_error', (e) => toast.error(`Socket: ${e.message}`));

    s.on('lobby:list', (lobbies) => setLobbies(lobbies));
    s.on('lobby:updated', (lobby) => setCurrentLobby(lobby));
    s.on('lobby:closed', () => {
      setCurrentLobby(null);
      setRoute({ name: 'lobby_browser' });
      toast('Lobby closed.');
    });
    s.on('lobby:game_starting', ({ gameId, countdown }) => {
      toast(`Game starting in ${countdown}s...`);
      setTimeout(() => setRoute({ name: 'game', gameId, mode: 'pvp' }), countdown * 1000);
    });

    s.on('game:state', (state) => setGame(state));
    s.on('game:event', (ev) => pushEvent(JSON.stringify(ev)));
    s.on('game:over', ({ winnerId, payoutTxHash }) =>
      setGameOver({ winnerId, payoutTxHash }),
    );
    s.on('game:error', ({ message }) => toast.error(message));

    s.emit('lobby:list', (resp) => {
      if (resp.ok) setLobbies(resp.data.lobbies);
    });

    return () => {
      s.disconnect();
      socketSingleton = null;
      socketRef.current = null;
    };
  }, [isConnected, jwt, setGame, setLobbies, setCurrentLobby, setGameOver, setRoute, pushEvent]);

  return socketRef;
}
