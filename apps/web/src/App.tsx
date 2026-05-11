import { useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { useGameSocket } from './hooks/useGameSocket';
import { MainMenu } from './components/UI/MainMenu';
import { LobbyBrowser } from './components/UI/LobbyBrowser';
import { LobbyCreate } from './components/UI/LobbyCreate';
import { LobbyWaiting } from './components/UI/LobbyWaiting';
import { GameScene } from './components/Scene/GameScene';
import { GameOverModal } from './components/UI/GameOverModal';
import { WalletConnect } from './components/UI/WalletConnect';
import { useMultiWallet } from './hooks/useMultiWallet';

export function App() {
  const { route } = useGameState();
  const { isConnected } = useMultiWallet();
  useGameSocket();

  useEffect(() => {
    document.title = 'UNO ONCHAIN';
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 pointer-events-none">
        <div className="font-display text-2xl font-extrabold tracking-tight pointer-events-auto">
          UNO <span className="text-accent">ONCHAIN</span>
        </div>
        <div className="pointer-events-auto">
          <WalletConnect />
        </div>
      </header>

      {(() => {
        switch (route.name) {
          case 'menu':
            return <MainMenu />;
          case 'lobby_browser':
            return <LobbyBrowser />;
          case 'lobby_create':
            return <LobbyCreate />;
          case 'lobby_waiting':
            return <LobbyWaiting lobbyId={route.lobbyId} />;
          case 'game':
            return <GameScene gameId={route.gameId} mode={route.mode} />;
          default:
            return <MainMenu />;
        }
      })()}

      <GameOverModal />
      {!isConnected && route.name !== 'menu' && route.name !== 'game' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="mb-3 text-xl font-bold">Connect a wallet to continue</div>
            <WalletConnect />
          </div>
        </div>
      )}
    </div>
  );
}
