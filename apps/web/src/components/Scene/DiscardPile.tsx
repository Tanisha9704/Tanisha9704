import { CardMesh } from './CardMesh';
import type { Card, WildColor } from '@uno/shared';

interface Props {
  topCard: Card;
  color: WildColor;
}

export function DiscardPile({ topCard }: Props) {
  return (
    <group position={[1.2, 0.13, 0]}>
      <CardMesh card={topCard} faceUp rotation={[Math.PI / 2, 0, 0.18]} position={[0, 0.04, 0]} />
    </group>
  );
}
