import { useMemo } from 'react';
import * as THREE from 'three';
import type { Card } from '@uno/shared';
import { cardFaceTexture, cardBackTexture } from './cardTextures';

const CARD_W = 0.63;
const CARD_H = 0.88;
const CARD_T = 0.02;

interface Props {
  card?: Card;
  faceUp: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  onClick?: () => void;
}

/**
 * 3D card with front/back textures rendered procedurally onto a canvas.
 * The shape is a thin BoxGeometry — fast to render and shadows correctly.
 */
export function CardMesh({ card, faceUp, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, onClick }: Props) {
  const frontMap = useMemo(() => (card ? cardFaceTexture(card) : null), [card]);
  const backMap = useMemo(() => cardBackTexture(), []);

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <mesh castShadow>
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
        {/* materials in order: +X, -X, +Y, -Y, +Z (front), -Z (back) */}
        <meshStandardMaterial attach="material-0" color="#ffffff" />
        <meshStandardMaterial attach="material-1" color="#ffffff" />
        <meshStandardMaterial attach="material-2" color="#ffffff" />
        <meshStandardMaterial attach="material-3" color="#ffffff" />
        <meshStandardMaterial
          attach="material-4"
          map={faceUp ? frontMap ?? backMap : backMap}
          roughness={0.5}
        />
        <meshStandardMaterial
          attach="material-5"
          map={faceUp ? backMap : frontMap ?? backMap}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

export const CARD_DIMENSIONS = { width: CARD_W, height: CARD_H, thickness: CARD_T };
