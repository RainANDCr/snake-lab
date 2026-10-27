/**
 * 模式配置构建器：把 UI 选择（模式/难度/地图/对战选项）转换为统一 MatchConfig。
 * 所有模式共用同一引擎，只在这里产生不同配置。
 *
 * 出生点策略：随机选择「身后有容身格 + 面向方向有足够安全跑道」的候选点，
 * 保证玩家开局至少有约 1 秒的反应时间，不会贴墙秒死。
 */
import { ControllerKind, DIR_VECTORS, Difficulty, Direction, GameMode, MatchConfig, Position } from '../core/types'
import { MapData } from '../maps/validation'
import { clonePreset } from '../maps/presets'

export const SNAKE_P1_COLOR = '#22d3ee'
export const SNAKE_P1_HEAD = '#a5f3fc'
export const SNAKE_P2_COLOR = '#fb923c'
export const SNAKE_P2_HEAD = '#fed7aa'
export const SNAKE_AI_COLOR = '#a78bfa'
export const SNAKE_AI_HEAD = '#ddd6fe'

const DIFFICULTY_TICK: Record<Difficulty, number> = { easy: 150, normal: 120, hard: 95 }

const DIR_LIST: Direction[] = ['up', 'right', 'down', 'left']

function isFree(blocked: Set<string>, width: number, height: number, wrap: boolean, x: number, y: number): boolean {
  let nx = x
  let ny = y
  if (wrap) {
    nx = ((x % width) + width) % width
    ny = ((y % height) + height) % height
  } else if (x < 0 || y < 0 || x >= width || y >= height) {
    return false
  }
  return !blocked.has(`${nx},${ny}`)
}

export interface SpawnCandidate {
  spawn: Position
  direction: Direction
}

/** 收集全部安全出生候选：头与身后 length-1 格空闲，且面向方向至少 runway 格畅通 */
export function collectSpawnCandidates(
  walls: Position[],
  width: number,
  height: number,
  wrap: boolean,
  snakeLength: number,
  runway: number,
): SpawnCandidate[] {
  const blocked = new Set(walls.map((w) => `${w.x},${w.y}`))
  const out: SpawnCandidate[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const dir of DIR_LIST) {
        const v = DIR_VECTORS[dir]
        let ok = isFree(blocked, width, height, wrap, x, y) // 头部格子本身必须空闲
        // 身后容身格（body 从 spawn 向后延伸 length-1 格）
        for (let i = 1; i < snakeLength && ok; i++) {
          if (!isFree(blocked, width, height, wrap, x - v.x * i, y - v.y * i)) ok = false
        }
        // 面向方向的安全跑道
        for (let i = 1; i <= runway && ok; i++) {
          if (!isFree(blocked, width, height, wrap, x + v.x * i, y + v.y * i)) ok = false
        }
        if (ok) out.push({ spawn: { x, y }, direction: dir })
      }
    }
  }
  return out
}

/** 随机挑选安全出生点；找不到满跑道的逐级放宽跑道要求（8 → 6 → 4 → 2） */
export function pickRandomSpawn(
  walls: Position[],
  width: number,
  height: number,
  wrap: boolean,
  snakeLength: number,
  minRunway = 8,
): SpawnCandidate {
  for (const runway of [minRunway, 6, 4, 2]) {
    const candidates = collectSpawnCandidates(walls, width, height, wrap, snakeLength, runway)
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length) % candidates.length]
    }
  }
  // 兜底：中心（仅在图几乎被墙填满时出现）
  return { spawn: { x: Math.floor(width / 2), y: Math.floor(height / 2) }, direction: 'right' }
}

/** 每行取一个左右两侧都有跑道的对称候选（对战用，保证公平） */
function pickRandomVersusSpawns(
  walls: Position[],
  width: number,
  height: number,
  snakeLength: number,
  minRunway: number,
): { p1: Position; p2: Position } | null {
  const blocked = new Set(walls.map((w) => `${w.x},${w.y}`))
  const rows: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 2; x < Math.floor(width / 2); x++) {
      const px2 = width - 1 - x
      let ok = isFree(blocked, width, height, false, x, y) && isFree(blocked, width, height, false, px2, y)
      for (let i = 1; i < snakeLength && ok; i++) {
        ok = isFree(blocked, width, height, false, x - i, y) && isFree(blocked, width, height, false, px2 + i, y)
      }
      let run1 = 0
      let run2 = 0
      while (ok && run1 < minRunway && isFree(blocked, width, height, false, x + 1 + run1, y)) run1 += 1
      while (ok && run2 < minRunway && isFree(blocked, width, height, false, px2 - 1 - run2, y)) run2 += 1
      if (ok && run1 >= minRunway && run2 >= minRunway) {
        rows.push(y)
        break // 本行已找到最左候选，换下一行
      }
    }
  }
  if (rows.length === 0) return null
  const y = rows[Math.floor(Math.random() * rows.length) % rows.length]
  // 在该行再次扫描取一个随机 x（保持对称）
  const xs: number[] = []
  for (let x = 2; x < Math.floor(width / 2); x++) {
    const px2 = width - 1 - x
    let ok = isFree(blocked, width, height, false, x, y) && isFree(blocked, width, height, false, px2, y)
    for (let i = 1; i < snakeLength && ok; i++) {
      ok = isFree(blocked, width, height, false, x - i, y) && isFree(blocked, width, height, false, px2 + i, y)
    }
    let run1 = 0
    let run2 = 0
    while (ok && run1 < minRunway && isFree(blocked, width, height, false, x + 1 + run1, y)) run1 += 1
    while (ok && run2 < minRunway && isFree(blocked, width, height, false, px2 - 1 - run2, y)) run2 += 1
    if (ok && run1 >= minRunway && run2 >= minRunway) xs.push(x)
  }
  const x = xs[Math.floor(Math.random() * xs.length) % xs.length]
  return { p1: { x, y }, p2: { x: width - 1 - x, y } }
}

export interface SingleSetupOptions {
  mode: Extract<GameMode, 'classic' | 'endless' | 'speed'>
  difficulty: Difficulty
  map?: MapData | null
}

export function buildSingleConfig(opts: SingleSetupOptions): MatchConfig {
  const { mode, difficulty, map } = opts
  const width = map?.width ?? 24
  const height = map?.height ?? 24
  const walls = map ? map.walls : []
  let tickMs = DIFFICULTY_TICK[difficulty]
  const speedRamp =
    mode === 'speed'
      ? { everyScore: 60, decreaseMs: Math.max(4, Math.round(tickMs * 0.05)), minTickMs: 45 }
      : undefined
  if (mode === 'speed') tickMs = Math.round(tickMs * 0.8)
  const wrap = mode === 'endless' || (map?.wrap ?? false)
  const { spawn, direction } = pickRandomSpawn(walls, width, height, wrap, 3, 8)
  const labels: Record<string, string> = { classic: '经典模式', endless: '无尽穿墙', speed: '极速模式' }
  return {
    mode,
    width,
    height,
    wrap,
    walls,
    snakes: [
      {
        id: 'p1',
        name: '玩家',
        color: SNAKE_P1_COLOR,
        headColor: SNAKE_P1_HEAD,
        spawn,
        direction,
        length: 3,
        controller: 'human',
      },
    ],
    foodCount: 1,
    foodValue: 10,
    foodGrowth: 1,
    tickMs,
    speedRamp,
    goal: { type: 'none' },
    difficulty,
    meta: { label: labels[mode] + (map ? ` · ${map.name}` : ''), mapId: map && !map.readonly ? map.id : undefined, mapName: map?.name },
  }
}

export interface VersusSetupOptions {
  kind: 'classic' | 'timed' | 'ai'
  difficulty: Difficulty
  durationSec: number
  powerups: boolean
  map?: MapData | null
  aiAlgorithm?: ControllerKind
}

export const VERSUS_RULES: string[] = [
  '双方同速同格同步结算，不存在先后手优势',
  '蛇头进入同一格：双方同时判负',
  '两蛇头互换位置：双方同时判负',
  '撞墙、撞自己、撞对方（含尸体）判负',
  '一方死亡则另一方获胜；同时死亡为平局',
  '限时赛：时间到按得分判定，同分为平局',
  '死亡后的蛇身将冻结为障碍物',
  '护盾可抵挡一次致命碰撞，触发后停留在原位',
  '出生位置每局随机，但双方始终左右对称、跑道等长',
]

export function buildVersusConfig(opts: VersusSetupOptions): MatchConfig {
  const { kind, difficulty, durationSec, powerups, map } = opts
  const width = map?.width ?? 24
  const height = map?.height ?? 24
  const walls = map ? map.walls : []
  const tickMs = DIFFICULTY_TICK[difficulty]
  const midY = Math.floor(height / 2)
  // 随机对称出生：每局换行换位置，双方跑道等长
  const randomSpawns = pickRandomVersusSpawns(walls, width, height, 3, 6)
  const p1Spawn = randomSpawns?.p1 ?? { x: 4, y: midY }
  const p2Spawn = randomSpawns?.p2 ?? { x: width - 5, y: midY }
  const p2Controller: ControllerKind = kind === 'ai' ? (opts.aiAlgorithm ?? 'safe') : 'human'
  const mode: GameMode = kind === 'classic' ? 'versus' : kind === 'timed' ? 'versus-timed' : 'versus-ai'
  return {
    mode,
    width,
    height,
    wrap: map?.wrap ?? false,
    walls,
    snakes: [
      {
        id: 'p1',
        name: '玩家一',
        color: SNAKE_P1_COLOR,
        headColor: SNAKE_P1_HEAD,
        spawn: p1Spawn,
        direction: 'right',
        length: 3,
        controller: 'human',
      },
      {
        id: 'p2',
        name: kind === 'ai' ? 'AI 对手' : '玩家二',
        color: kind === 'ai' ? SNAKE_AI_COLOR : SNAKE_P2_COLOR,
        headColor: kind === 'ai' ? SNAKE_AI_HEAD : SNAKE_P2_HEAD,
        spawn: p2Spawn,
        direction: 'left',
        length: 3,
        controller: p2Controller,
      },
    ],
    foodCount: 2,
    foodValue: 10,
    foodGrowth: 1,
    tickMs,
    goal: { type: 'none' },
    timeLimitMs: kind === 'timed' ? durationSec * 1000 : undefined,
    powerups: powerups ? { enabled: true, chancePerTick: 0.006, durationTicks: 40 } : undefined,
    difficulty,
    meta: {
      label: kind === 'classic' ? '经典竞技' : kind === 'timed' ? `限时积分赛 · ${durationSec}s` : '人机对战',
      rules: VERSUS_RULES,
      mapId: map && !map.readonly ? map.id : undefined,
      mapName: map?.name,
    },
  }
}

export interface AiLabOptions {
  algorithm: ControllerKind
  difficulty: Difficulty
  map?: MapData | null
}

export function buildAiLabConfig(opts: AiLabOptions): MatchConfig {
  const { algorithm, difficulty, map } = opts
  const width = map?.width ?? 24
  const height = map?.height ?? 24
  const walls = map ? map.walls : []
  const wrap = map?.wrap ?? false
  const { spawn, direction } = pickRandomSpawn(walls, width, height, wrap, 4, 8)
  return {
    mode: 'custom',
    width,
    height,
    wrap,
    walls,
    snakes: [
      {
        id: 'p1',
        name: '实验体',
        color: SNAKE_AI_COLOR,
        headColor: SNAKE_AI_HEAD,
        spawn,
        direction,
        length: 4,
        controller: algorithm,
      },
    ],
    foodCount: 1,
    foodValue: 10,
    foodGrowth: 1,
    tickMs: DIFFICULTY_TICK[difficulty],
    goal: { type: 'none' },
    difficulty,
    meta: { label: `AI 实验室 · ${map?.name ?? '默认场地'}` },
  }
}

/** 自定义地图试玩 / 自定义关卡 */
export function buildCustomConfig(map: MapData, difficulty: Difficulty, goal?: { score?: number; timeLimitSec?: number }): MatchConfig {
  const base = buildSingleConfig({ mode: 'classic', difficulty, map })
  return {
    ...base,
    mode: 'custom',
    goal: goal?.score ? { type: 'score', value: goal.score } : { type: 'none' },
    timeLimitMs: goal?.timeLimitSec ? goal.timeLimitSec * 1000 : undefined,
    meta: { ...base.meta, label: `自定义 · ${map.name}`, mapId: map.id, mapName: map.name },
  }
}

/** 检查地图在指定模式下是否可玩（出生点/空间校验） */
export function mapPlayable(map: MapData, versus: boolean): { ok: boolean; error?: string } {
  const walls = new Set(map.walls.map((w) => `${w.x},${w.y}`))
  if (versus) {
    const freeCells = map.width * map.height - walls.size
    if (freeCells < 30) return { ok: false, error: '该地图空闲空间过小，不适合对战' }
    // 随机对称出生要求至少存在一行左右通道
    const candidates = collectSpawnCandidates(map.walls, map.width, map.height, map.wrap, 3, 2)
    if (candidates.length < 2) return { ok: false, error: '该地图没有足够的出生空间' }
  } else {
    const candidates = collectSpawnCandidates(map.walls, map.width, map.height, map.wrap, 3, 2)
    if (candidates.length === 0) return { ok: false, error: '该地图没有足够的出生空间' }
  }
  return { ok: true }
}

export { clonePreset }
