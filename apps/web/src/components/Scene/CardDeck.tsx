import { CardMesh } from './CardMesh';

interface Props {
  count: number;
  onClick?: () => void;
}

export function CardDeck({ count, onClick }: Props) {
  // Render at most 5 stacked cards for visual depth.
  const visible = Math.min(5, Math.max(1, count));
  return (
    <group position={[-1.2, 0.12, 0]}>
      {Array.from({ length: visible }).map((_, i) => (
        <CardMesh
          key={i}
          faceUp={false}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, i * 0.025, 0]}
          onClick={i === visible - 1 ? onClick : undefined}
        />
      ))}
    </group>
  );
}
