// Icône pixel art rendue depuis une grille (nearest-neighbor via CSS).

import { useMemo } from 'react';
import { gridToCanvas, type Grid } from '../render/pixel';
import { ICON_PALETTE } from './icons';

interface Props {
  grid: Grid;
  alt: string;
}

export function PixelIcon({ grid, alt }: Props) {
  const src = useMemo(() => gridToCanvas(grid, ICON_PALETTE).toDataURL(), [grid]);
  return <img className="pixel-icon" src={src} alt={alt} draggable={false} />;
}
