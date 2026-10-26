/**
 * 模式配置构建器：把 UI 选择（模式/难度/地图/对战选项）转换为统一 MatchConfig。
 * 所有模式共用同一引擎，只在这里产生不同配置。
 */
import { ControllerKind, Difficulty, Direction, GameMode, MatchConfig, Position } from '../core/types'
import { MapData, wallKeySet } from '../maps/validation'
import { clonePreset } from '../maps/presets'

export const SNAKE_P1_COLOR = '#22d3ee'
export const SNAKE_P1_HEAD = '#a5f3fc'
export const SNAKE_P2_COLOR = '#fb923c'
export const SNAKE_P2_HEAD = '#fed7aa'
export const SNAKE_AI_COLOR = '#a78bfa'
export const SNAKE_AI_HEAD = '#ddd6fe'

const DIFFICULTY_TICK: Record<Difficulty, number> = { easy: 150, normal: 120, hard: 95 }

/** 在地图上找一个安全的出生点（头 + 身后两格均空闲），找不返回中心附近 */
export function findSafeSpawn(walls: Position[], width: number, height: number, prefer?: Position): { spawn: Position; direction: Direction } {
  const blocked = new Set(walls.map((w) => `${w.x},${w.y}`))
  const free = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && !blocked.has(`${x},${y}`)
  const candidate = (x: number, y: number): boolean => free(x, y) && free(x - 1, y) && free(x - 2, y) && free(x + 1, y)
  if (prefer && candidate(prefer.x, prefer.y)) return { spawn: prefer, direction: 'right' }
  const midY = Math.floor(height / 2)
  for (let dy = 0; dy < height; dy++) {
    const y = dy % 2 === 0 ? midY + dy / 2 : midY - (dy + 1) / 2
    if (y < 0 || y >= height) continue
    for (let x = 2; x < width - 1; x++) {
      if (candidate(x, y)) return { spawn: { x, y }, direction: 'right' }
    }
  }
  return { spawn: { x: Math.floor(width / 2), y: midY }, direction: 'right' }
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
  const prefer = map?.spawns?.single
  const { spawn, direction } = prefer ? { spawn: prefer, direction: 'right' as Direction } : findSafeSpawn(walls, width, height)
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
]

export function buildVersusConfig(opts: VersusSetupOptions): MatchConfig {
  const { kind, difficulty, durationSec, powerups, map } = opts
  const width = map?.width ?? 24
  const height = map?.height ?? 24
  const walls = map ? map.walls : []
  const tickMs = DIFFICULTY_TICK[difficulty]
  const midY = Math.floor(height / 2)
  const p1Spawn = map?.spawns?.p1 ?? { x: 4, y: midY }
  const p2Spawn = map?.spawns?.p2 ?? { x: width - 5, y: midY }
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
  const { spawn, direction } = map?.spawns?.single
    ? { spawn: map.spawns.single, direction: 'right' as Direction }
    : findSafeSpawn(walls, width, height)
  return {
    mode: 'custom',
    width,
    height,
    wrap: map?.wrap ?? false,
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
  const walls = wallKeySet(map)
  if (versus) {
    if (!map.spawns.p1 || !map.spawns.p2) return { ok: false, error: '该地图未设置双人出生点' }
    if (walls.has(`${map.spawns.p1.x},${map.spawns.p1.y}`) || walls.has(`${map.spawns.p2.x},${map.spawns.p2.y}`)) {
      return { ok: false, error: '双人出生点位于障碍物上' }
    }
  } else if (map.spawns.single && walls.has(`${map.spawns.single.x},${map.spawns.single.y}`)) {
    return { ok: false, error: '出生点位于障碍物上' }
  }
  return { ok: true }
}

export { clonePreset }
