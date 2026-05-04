import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import type { PlayerPublic } from '@uno/shared';
import { CardMesh } from './CardMesh';

interface Props {
  player: PlayerPublic;
  seatIndex: number;
  totalSeats: number;
  isCurrentTurn: boolean;
}

/**
 * 3D player avatar around the table. Seats are evenly spaced in a circle.
 * Seat 0 is closest to the camera (the local player); their cards are rendered
 * via the 2D PlayerHand overlay rather than in 3D for legibility.
 */
export function PlayerSeat({ player, seatIndex, totalSeats, isCurrentTurn }: Props) {
  const angle = useMemo(() => {
    if (totalSeats === 1) return Math.PI / 2;
    return (seatIndex / totalSeats) * Math.PI * 2 + Math.PI / 2;
  }, [seatIndex, totalSeats]);

  const radius = 4.4;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  const isLocal = seatIndex === 0;

  return (
    <group position={[x, 0, z]} rotation={[0, -angle + Math.PI / 2, 0]}>
      {!isLocal &&
        Array.from({ length: Math.min(player.cardCount, 7) }).map((_, i) => (
          <CardMesh
            key={i}
            faceUp={false}
            rotation={[Math.PI / 2, 0, ((i - 3) * 0.12)]}
            position={[(i - 3) * 0.18, 0.12, 0]}
            scale={0.7}
          />
        ))}

      <mesh position={[0, 1.2, 0]}>
        <ringGeometry args={[0.42, 0.5, 32]} />
        <meshBasicMaterial color={isCurrentTurn ? '#00FF88' : '#444'} />
      </mesh>

      <Text
        position={[0, 1.7, 0]}
        fontSize={0.18}
        color={isCurrentTurn ? '#00FF88' : '#fff'}
        anchorX="center"
        anchorY="middle"
      >
        {player.username ?? shorten(player.address)}
      </Text>
      <Text
        position={[0, 1.4, 0]}
        fontSize={0.13}
        color="#aaa"
        anchorX="center"
        anchorY="middle"
      >
        {player.cardCount} cards
      </Text>
    </group>
  );
}

function shorten(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
