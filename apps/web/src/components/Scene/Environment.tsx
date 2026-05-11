import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WildColor } from '@uno/shared';

interface Props {
  activeColor: WildColor;
}

const COLOR_HEX: Record<string, number> = {
  red: 0xff5555,
  blue: 0x5555ff,
  green: 0x55aa55,
  yellow: 0xffaa00,
  wild: 0xffffff,
};

/**
 * Lighting + atmospheric setup. The rim light around the table dynamically
 * follows the active card color — a small visual contract with the player
 * about which color is currently in play.
 */
export function TableEnvironment({ activeColor }: Props) {
  const rimRef = useRef<THREE.PointLight>(null);
  const targetColor = useMemo(() => new THREE.Color(COLOR_HEX[activeColor] ?? 0xffffff), [activeColor]);

  useFrame((_, dt) => {
    if (rimRef.current) {
      rimRef.current.color.lerp(targetColor, Math.min(1, dt * 4));
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <spotLight
        position={[0, 10, 0]}
        angle={0.9}
        penumbra={0.5}
        intensity={120}
        color="#FFF5E1"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight ref={rimRef} position={[0, 1.5, 0]} intensity={20} distance={8} decay={1.5} />
      <fog attach="fog" args={[0x050505, 12, 28]} />
    </>
  );
}
