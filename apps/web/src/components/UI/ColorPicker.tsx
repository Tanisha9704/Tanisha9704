import type { Color } from '@uno/shared';

interface Props {
  onPick: (color: Color) => void;
  onCancel: () => void;
}

const SWATCHES: { color: Color; bg: string }[] = [
  { color: 'red', bg: '#FF4444' },
  { color: 'blue', bg: '#2196F3' },
  { color: 'green', bg: '#4CAF50' },
  { color: 'yellow', bg: '#FFC107' },
];

export function ColorPicker({ onPick, onCancel }: Props) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="glass rounded-2xl p-8">
        <div className="mb-4 text-center text-lg font-bold">Choose a color</div>
        <div className="grid grid-cols-2 gap-4">
          {SWATCHES.map(({ color, bg }) => (
            <button
              key={color}
              onClick={() => onPick(color)}
              className="h-24 w-24 rounded-2xl border-4 border-white/30 hover:scale-110 transition-transform"
              style={{ background: bg }}
              aria-label={color}
            />
          ))}
        </div>
        <button onClick={onCancel} className="mt-4 w-full btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
