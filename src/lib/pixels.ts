/*
 * Pixel scenes for the terminal (Terminal.astro, PixelScene.astro). A scene is a 24x18
 * character map; each character names a pastel --px-* token (tokens.css). renderRuns merges
 * same-colour runs on a row into one <rect> each, and throws on a malformed map, so a bad
 * scene fails the build rather than drawing garbage.
 */
export const SCENE_W = 24;
export const SCENE_H = 18;

export const PALETTE: Record<string, string> = {
  s: 'sky',
  c: 'cloud',
  S: 'sun',
  p: 'rose',
  o: 'peach',
  q: 'stone',
  Q: 'stone-dark',
  l: 'lamp',
  k: 'ink',
  m: 'cream',
  b: 'wood',
  D: 'wood-dark',
  t: 'teal',
  u: 'blue',
  g: 'grass',
  G: 'grass-dark',
  e: 'orange',
  w: 'snow',
};

export interface Scene {
  id: string;
  map: string[];
}

export interface Run {
  x: number;
  y: number;
  w: number;
  cls: string;
}

export function renderRuns(scene: Scene): Run[] {
  if (scene.map.length !== SCENE_H) throw new Error(`${scene.id}: ${scene.map.length} rows, want ${SCENE_H}`);
  const runs: Run[] = [];
  scene.map.forEach((row, y) => {
    if (row.length !== SCENE_W) throw new Error(`${scene.id} row ${y}: ${row.length} cols, want ${SCENE_W}`);
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const cls = PALETTE[ch];
      if (!cls) throw new Error(`${scene.id} row ${y}: unknown colour "${ch}"`);
      let w = 1;
      while (row[x + w] === ch) w++;
      runs.push({ x, y, w, cls });
      x += w;
    }
  });
  return runs;
}
