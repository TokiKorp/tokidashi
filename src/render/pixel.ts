// Outillage pixel art : grilles de caractères → canvas (1 char = 1 pixel).
// Le scaling nearest-neighbor est fait par PixiJS au rendu.

export type Grid = string[];
export type Patch = [row: number, col: number, char: string];

export function applyPatches(grid: Grid, patches: Patch[]): Grid {
  const rows = grid.map((r) => r.split(''));
  for (const [row, col, char] of patches) {
    if (rows[row] && col < rows[row].length) rows[row][col] = char;
  }
  return rows.map((r) => r.join(''));
}

export function gridToCanvas(
  grid: Grid,
  palette: Record<string, string>,
): HTMLCanvasElement {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = palette[grid[y][x]];
      if (!color || color === 'transparent') continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}
