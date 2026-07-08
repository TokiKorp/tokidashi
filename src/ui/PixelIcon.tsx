// Icône pixel art rendue depuis une grille (nearest-neighbor via CSS).

import { useMemo } from 'react';
import { gridToCanvas, type Grid } from '../render/pixel';
import { ICON_PALETTE } from './icons';

interface Props {
  grid: Grid;
  alt: string;
  /** Override rendered size in px (default: 16). Grid is always 12×12 pixels scaled to this. */
  size?: number;
}

export function PixelIcon({ grid, alt, size = 16 }: Props) {
  const src = useMemo(() => gridToCanvas(grid, ICON_PALETTE).toDataURL(), [grid]);
  return (
    <img
      className="pixel-icon"
      src={src}
      alt={alt}
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}
