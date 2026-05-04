import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientGameState,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno/shared';
import { MiniBoard } from './MiniBoard';
import { MiniHand } from './MiniHand';
import { storage } from '../shared/storage';

const SOCKET_URL = 'http://localhost:3001'; // swap to https://api.unochain.gg in prod

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function Popup() {
  const [jwt, setJwt] = useState<string | null>(null);
  const [game, setGame] = useState<ClientGameState | null>(null);
  const [socket, setSocket] = useState<AppSocket | null>(null);

  useEffect(() => {
    storage.get('uno_jwt').then((v) => setJwt(v ?? null));
  }, []);

  useEffect(() => {
    if (!jwt) return;
    const s: AppSocket = io(SOCKET_URL, {
      auth: { token: jwt },
      transports: ['websocket'],
    });
    s.on('game:state', setGame);
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [jwt]);

  if (!jwt) {
    return (
      <div className="p-6 text-center">
        <h1 className="font-bold text-lg" style={{ fontFamily: 'Outfit' }}>
          UNO ONCHAIN
        </h1>
        <p className="my-3 text-sm opacity-70">
          Sign in on the website first, then click &quot;Sync session&quot;.
        </p>
        <button
          onClick={async () => {
            const tabs = await chrome.tabs.query({ url: ['https://unochain.gg/*', 'http://localhost:5173/*'] });
            const tab = tabs[0];
            if (!tab?.id) return;
            const result = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => localStorage.getItem('uno_jwt'),
            });
            const token = result[0]?.result as string | undefined;
            if (token) {
              await storage.set('uno_jwt', token);
              setJwt(token);
            }
          }}
          style={{
            background: '#00FF88', color: '#000', padding: '8px 16px',
            borderRadius: 999, fontWeight: 700, border: 'none', cursor: 'pointer',
          }}
        >
          Sync session
        </button>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="p-6 text-center">
        <p style={{ opacity: 0.7 }}>No active game.</p>
        <p style={{ opacity: 0.5, fontSize: 12, marginTop: 8 }}>
          Open the website to start or join a lobby.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #222' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18 }}>
          UNO <span style={{ color: '#00FF88' }}>ONCHAIN</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>Game: {game.id.slice(0, 8)}…</div>
      </div>
      <MiniBoard game={game} />
      <MiniHand
        game={game}
        onPlay={(cardId, chosenColor) =>
          socket?.emit('game:play_card', { gameId: game.id, cardId, chosenColor })
        }
        onDraw={() => socket?.emit('game:draw_card', { gameId: game.id })}
        onCallUno={() => socket?.emit('game:call_uno', { gameId: game.id })}
      />
    </div>
  );
}
