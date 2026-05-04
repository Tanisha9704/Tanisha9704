import { create } from 'zustand';
import type { ClientGameState, Lobby } from '@uno/shared';

export type Route =
  | { name: 'menu' }
  | { name: 'lobby_browser' }
  | { name: 'lobby_create' }
  | { name: 'lobby_waiting'; lobbyId: string }
  | { name: 'game'; gameId: string; mode: 'ai' | 'pvp' };

interface State {
  route: Route;
  setRoute: (r: Route) => void;
  lobbies: Lobby[];
  setLobbies: (l: Lobby[]) => void;
  currentLobby: Lobby | null;
  setCurrentLobby: (l: Lobby | null) => void;
  game: ClientGameState | null;
  setGame: (g: ClientGameState | null) => void;
  gameOver: { winnerId: string; payoutTxHash: string | null } | null;
  setGameOver: (g: State['gameOver']) => void;
  /** Latest event log — used by HUD toasts and animations. */
  recentEvents: string[];
  pushEvent: (e: string) => void;
}

export const useGameState = create<State>((set) => ({
  route: { name: 'menu' },
  setRoute: (r) => set({ route: r }),
  lobbies: [],
  setLobbies: (l) => set({ lobbies: l }),
  currentLobby: null,
  setCurrentLobby: (l) => set({ currentLobby: l }),
  game: null,
  setGame: (g) => set({ game: g }),
  gameOver: null,
  setGameOver: (g) => set({ gameOver: g }),
  recentEvents: [],
  pushEvent: (e) =>
    set((s) => ({ recentEvents: [e, ...s.recentEvents].slice(0, 20) })),
}));
