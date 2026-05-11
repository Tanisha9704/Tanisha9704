import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { GameTable } from './GameTable';
import { CardDeck } from './CardDeck';
import { DiscardPile } from './DiscardPile';
import { PlayerSeat } from './PlayerSeat';
import { TableEnvironment } from './Environment';
import { GameHUD } from '../UI/GameHUD';
import { PlayerHand } from '../UI/PlayerHand';
import { ColorPicker } from '../UI/ColorPicker';
import { useGameState } from '../../hooks/useGameState';
import { useAiGame } from '../../hooks/useAiGame';
import { getSocket } from '../../hooks/useGameSocket';
import { useState } from 'react';
import type { Card, Color } from '@uno/shared';

export interface GameSceneProps {
  gameId: string;
  mode: 'ai' | 'pvp';
}

export function GameScene({ gameId, mode }: GameSceneProps) {
  const { game } = useGameState();
  const { play: playAi, draw: drawAi, resolveDraw: resolveAiDraw } = useAiGame();
  const [pendingWild, setPendingWild] = useState<Card | null>(null);

  if (!game) return <div className="flex h-full items-center justify-center">Loading game...</div>;

  const playCard = (card: Card, chosenColor?: Color) => {
    if (card.kind === 'wild' && !chosenColor) {
      setPendingWild(card);
      return;
    }
    if (mode === 'ai') {
      playAi(gameId, card.id, chosenColor);
    } else {
      getSocket()?.emit('game:play_card', {
        gameId,
        cardId: card.id,
        chosenColor,
      });
    }
    setPendingWild(null);
  };

  const drawCard = () => {
    if (mode === 'ai') {
      const result = drawAi(gameId);
      if (result?.playable) {
        // Auto-prompt for play; for now we just keep it in hand and let user click again.
      } else {
        resolveAiDraw(gameId, false);
      }
    } else {
      getSocket()?.emit('game:draw_card', { gameId });
    }
  };

  const callUno = () => {
    if (mode === 'ai') {
      // AI mode: simple auto-call (no penalty enforcement client-side beyond engine).
      return;
    }
    getSocket()?.emit('game:call_uno', { gameId });
  };

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        camera={{ position: [0, 8, 8.5], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#050505']} />
        <Suspense fallback={null}>
          <TableEnvironment activeColor={game.currentColor} />
          <GameTable />
          <CardDeck count={game.drawPileCount} onClick={drawCard} />
          {game.topDiscard && <DiscardPile topCard={game.topDiscard} color={game.currentColor} />}
          {game.players.map((p, i) => (
            <PlayerSeat
              key={p.id}
              player={p}
              seatIndex={i}
              totalSeats={game.players.length}
              isCurrentTurn={i === game.currentPlayerIndex}
            />
          ))}
          <OrbitControls
            enablePan={false}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={6}
            maxDistance={14}
          />
        </Suspense>
      </Canvas>

      <GameHUD onCallUno={callUno} />
      <PlayerHand onPlayCard={playCard} />
      {pendingWild && (
        <ColorPicker
          onPick={(color) => playCard(pendingWild, color)}
          onCancel={() => setPendingWild(null)}
        />
      )}
    </div>
  );
}
