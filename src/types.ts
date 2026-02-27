export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  x: number;
  y: number;
  angle: number;
  color: string;
  isMe?: boolean;
}

export interface TrapSquare extends Point {
  id: string;
  state: 'safe' | 'warning' | 'collapsed';
}

export interface MazeData {
  grid: number[][];
  width: number;
  height: number;
  start: Point;
  end: Point;
  traps: TrapSquare[];
  safeZones: Point[];
}

export const CELL_SIZE = 40;
export const PLAYER_RADIUS = 10;
export const TRAP_CYCLE_TIME = 8;
export const PHASE_DURATION = 300;
export const SHOP_DURATION = 30;
export const DISTRACTOR_DURATION = 120; // 2 minutes
export const PRACTICE_DURATION = 30;

export function generateMaze(width: number, height: number, difficulty: number = 1): MazeData {
  const grid = Array(height).fill(0).map(() => Array(width).fill(1));
  
  function walk(x: number, y: number) {
    grid[y][x] = 0;
    
    const directions = [
      [0, -2], [0, 2], [-2, 0], [2, 0]
    ].sort(() => Math.random() - 0.5);
    
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 1) {
        grid[y + dy / 2][x + dx / 2] = 0;
        walk(nx, ny);
      }
    }
  }
  
  walk(0, 0);

  // Find a valid end point (nearest floor tile to the bottom-right corner)
  let endX = width - 1;
  let endY = height - 1;
  let foundEnd = false;
  for (let d = 0; d < Math.max(width, height); d++) {
    for (let ty = height - 1; ty >= Math.max(0, height - 1 - d); ty--) {
      for (let tx = width - 1; tx >= Math.max(0, width - 1 - d); tx--) {
        if (grid[ty][tx] === 0) {
          endX = tx;
          endY = ty;
          foundEnd = true;
          break;
        }
      }
      if (foundEnd) break;
    }
    if (foundEnd) break;
  }

  // Generate traps based on difficulty
  const traps: TrapSquare[] = [];
  const trapCount = Math.floor((width * height) * 0.05 * difficulty);
  
  let attempts = 0;
  while (traps.length < trapCount && attempts < 100) {
    const tx = Math.floor(Math.random() * width);
    const ty = Math.floor(Math.random() * height);
    
    // Don't place traps at start or end
    if (grid[ty][tx] === 0 && 
        !(tx === 0 && ty === 0) && 
        !(tx === endX && ty === endY) &&
        !traps.find(t => t.x === tx && t.y === ty)) {
      traps.push({ x: tx, y: ty, id: `${tx}-${ty}`, state: 'safe' });
    }
    attempts++;
  }
  
  // Find shortest path for safe zones
  const path: Point[] = [];
  const visited = Array(height).fill(0).map(() => Array(width).fill(false));
  const parent = new Map<string, Point>();
  const queue: Point[] = [{ x: 0, y: 0 }];
  visited[0][0] = true;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === endX && curr.y === endY) break;

    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 0 && !visited[ny][nx]) {
        visited[ny][nx] = true;
        parent.set(`${nx},${ny}`, curr);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  let curr: Point | undefined = { x: endX, y: endY };
  while (curr) {
    path.push(curr);
    curr = parent.get(`${curr.x},${curr.y}`);
  }
  path.reverse();

  const safeZones: Point[] = [];
  const safeZoneCount = Math.max(1, 4 - Math.floor(difficulty / 3));
  
  if (path.length > 0) {
    const step = Math.floor(path.length / (safeZoneCount + 1));
    for (let i = 1; i <= safeZoneCount; i++) {
      const idx = Math.min(i * step, path.length - 1);
      safeZones.push(path[idx]);
    }
  } else {
    for (let i = 0; i < safeZoneCount; i++) {
      let found = false;
      while (!found) {
        const sx = Math.floor(Math.random() * width);
        const sy = Math.floor(Math.random() * height);
        if (grid[sy][sx] === 0 && !safeZones.find(p => p.x === sx && p.y === sy)) {
          safeZones.push({ x: sx, y: sy });
          found = true;
        }
      }
    }
  }

  return {
    grid,
    width,
    height,
    start: { x: 0, y: 0 },
    end: { x: endX, y: endY },
    traps,
    safeZones
  };
}

export const MUSIC_TRACKS = [
  { name: "Techno Pulse", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", bpm: 128 },
  { name: "Ambient Flow", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", bpm: 90 },
  { name: "Cyber Race", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", bpm: 145 },
  { name: "Deep Focus", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", bpm: 110 }
];
