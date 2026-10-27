/**
 * 模式配置构建器：把 UI 选择（模式/难度/地图/对战选项）转换为统一 MatchConfig。
 * 所有模式共用同一引擎，只在这里产生不同配置。
 *
 * 出生点策略：随机选择「身后有容身格 + 面向方向有足够安全跑道」的候选点，
 * 保证玩家开局至少有约 1 秒的反应时间，不会贴墙秒死。
 */
import { ControllerKind, DIR_VECTORS, Difficulty, Direction, GameMode, MatchConfig, Position } from '../core/types'
import { MapData } from '../maps/validation'
import { clonePreset, buildPreset } from '../maps/presets'
import { LEVELS } from '../levels/levels'
import { getCachedCycle, pickAlignedSpawn } from '../ai/hamilton'

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

/** 随机挑选安全出生点；找不到满跑道的逐级放宽跑道要求（8 → 6 → 4 → 2）。random 可注入（每日挑战用种子随机） */
export function pickRandomSpawn(
  walls: Position[],
  width: number,
  height: number,
  wrap: boolean,
  snakeLength: number,
  minRunway = 8,
  random: () => number = Math.random,
): SpawnCandidate {
  for (const runway of [minRunway, 6, 4, 2]) {
    const candidates = collectSpawnCandidates(walls, width, height, wrap, snakeLength, runway)
    if (candidates.length > 0) {
      return candidates[Math.floor(random() * candidates.length) % candidates.length]
    }
  }
  // 兜底：中心（仅在图几乎被墙填满时出现）
  return { spawn: { x: Math.floor(width / 2), y: Math.floor(height / 2) }, direction: 'right' }
}

/** FNV-1a 字符串哈希（每日挑战种子） */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
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
  /** 特殊食物（黄金果/加速/缩短/幽灵），默认开启 */
  powerFood?: boolean
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
    foodRules: opts.powerFood === false ? undefined : { goldenChance: 0.08, powerChance: 0.07 },
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
  let p2Spawn = randomSpawns?.p2 ?? { x: width - 5, y: midY }
  const p2Controller: ControllerKind = kind === 'ai' ? (opts.aiAlgorithm ?? 'safe') : 'human'
  // 完美 AI：空场时沿哈密顿回路对齐出生（身体沿回路排布是数学安全前提）
  let p2BodyCells: Position[] | undefined
  let p2Direction: Direction = 'left'
  if (p2Controller === 'perfect') {
    const cycle = getCachedCycle(width, height)
    if (cycle && walls.length === 0) {
      const p1Body = [p1Spawn, { x: p1Spawn.x - 1, y: p1Spawn.y }, { x: p1Spawn.x - 2, y: p1Spawn.y }]
      const aligned = pickAlignedSpawn(cycle, 3, new Set(walls.map((w) => `${w.x},${w.y}`)), { cells: p1Body, dist: 4 })
      if (aligned) {
        p2Spawn = aligned.spawn
        p2BodyCells = aligned.bodyCells
        p2Direction = aligned.direction
      }
    }
  }
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
        direction: p2Direction,
        length: 3,
        controller: p2Controller,
        bodyCells: p2BodyCells,
      },
    ],
    foodCount: 2,
    foodValue: 10,
    foodGrowth: 1,
    foodRules: powerups ? { goldenChance: 0.06, powerChance: 0.08 } : undefined,
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
  let spawn: Position
  let direction: Direction
  let bodyCells: Position[] | undefined
  if (algorithm === 'perfect' && walls.length === 0) {
    // 完美 AI：身体沿哈密顿回路对齐出生（安全前提）
    const cycle = getCachedCycle(width, height)
    const aligned = cycle ? pickAlignedSpawn(cycle, 4, new Set()) : null
    if (aligned) {
      spawn = aligned.spawn
      direction = aligned.direction
      bodyCells = aligned.bodyCells
    } else {
      const fallback = pickRandomSpawn(walls, width, height, wrap, 4, 8)
      spawn = fallback.spawn
      direction = fallback.direction
    }
  } else {
    const picked = pickRandomSpawn(walls, width, height, wrap, 4, 8)
    spawn = picked.spawn
    direction = picked.direction
  }
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
        bodyCells,
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

/* ==================== 每日挑战 ==================== */

export const DAILY_DURATION_SEC = 120

/** 每日挑战：日期做种子 → 地图/难度/出生点/食物序列全世界一致 */
export function buildDailyConfig(dateKey: string): MatchConfig {
  const seed = hashSeed(`snake-lab-daily-${dateKey}`)
  const rng = lcg(seed)
  const presetKeys = ['cross', 'maze', 'arena', 'ring', 'rooms']
  const map = buildPreset(presetKeys[seed % presetKeys.length])!
  const difficulty: Difficulty = (['easy', 'normal', 'hard'] as Difficulty[])[Math.floor(rng() * 3) % 3]
  const { spawn, direction } = pickRandomSpawn(map.walls, map.width, map.height, false, 3, 8, rng)
  return {
    mode: 'daily',
    width: map.width,
    height: map.height,
    wrap: false,
    walls: map.walls,
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
    foodRules: { goldenChance: 0.08, powerChance: 0.08 },
    seed,
    tickMs: DIFFICULTY_TICK[difficulty],
    goal: { type: 'none' },
    timeLimitMs: DAILY_DURATION_SEC * 1000,
    difficulty,
    meta: { label: `每日挑战 · ${dateKey}`, dailyDate: dateKey, mapName: map.name },
  }
}

/* ==================== AI 锦标赛 ==================== */

export const TOURNAMENT_RULES: string[] = [
  'BFS、A*、安全策略三条 AI 同场竞技，遵守完全相同的碰撞规则',
  '它们互为动态威胁：互相把对方的蛇身视为障碍物',
  '默认规则：活到最后者夺冠；同时全部死亡按得分判定',
  '可切换为限时积分赛：时间到按得分排名',
  '观赛不会计入个人统计与成就',
]

/** 为锦标赛挑选 count 个互相远离的安全出生点 */
function pickTournamentSpawns(
  walls: Position[],
  width: number,
  height: number,
  count: number,
  snakeLength: number,
): SpawnCandidate[] {
  const key = (p: Position): string => `${p.x},${p.y}`
  let chosen: SpawnCandidate[] = []
  for (const minDist of [8, 6, 4, 2]) {
    const pool = [...collectSpawnCandidates(walls, width, height, false, snakeLength, 6)]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    chosen = []
    for (const c of pool) {
      if (chosen.every((k2) => Math.max(Math.abs(k2.spawn.x - c.spawn.x), Math.abs(k2.spawn.y - c.spawn.y)) >= minDist)) {
        chosen.push(c)
        if (chosen.length === count) break
      }
    }
    if (chosen.length === count) break
  }
  if (chosen.length < count) {
    for (const c of collectSpawnCandidates(walls, width, height, false, snakeLength, 2)) {
      if (chosen.length >= count) break
      if (chosen.every((k2) => key(k2.spawn) !== key(c.spawn))) chosen.push(c)
    }
  }
  return chosen
}

export interface TournamentOptions {
  rule: 'last-standing' | 'timed'
  durationSec: number
  difficulty: Difficulty
  map?: MapData | null
}

export function buildTournamentConfig(opts: TournamentOptions): MatchConfig {
  const { rule, durationSec, difficulty, map } = opts
  const width = map?.width ?? 24
  const height = map?.height ?? 24
  const walls = map ? map.walls : []
  const spawns = pickTournamentSpawns(walls, width, height, 3, 3)
  const roster: { id: string; name: string; color: string; headColor: string; controller: ControllerKind }[] = [
    { id: 'p1', name: 'BFS', color: '#22d3ee', headColor: '#a5f3fc', controller: 'bfs' },
    { id: 'p2', name: 'A*', color: '#a78bfa', headColor: '#ddd6fe', controller: 'astar' },
    { id: 'p3', name: '安全策略', color: '#f472b6', headColor: '#fbcfe8', controller: 'safe' },
  ]
  return {
    mode: 'tournament',
    width,
    height,
    wrap: false,
    walls,
    snakes: roster.map((r, i) => ({
      ...r,
      spawn: spawns[i]?.spawn ?? { x: 4 + i * 6, y: Math.floor(height / 2) },
      direction: spawns[i]?.direction ?? 'right',
      length: 3,
      controller: r.controller,
    })),
    foodCount: 2,
    foodValue: 10,
    foodGrowth: 1,
    tickMs: DIFFICULTY_TICK[difficulty],
    goal: { type: 'none' },
    timeLimitMs: rule === 'timed' ? durationSec * 1000 : undefined,
    difficulty,
    meta: {
      label: `AI 锦标赛 · ${rule === 'timed' ? `限时 ${durationSec}s` : '最后幸存'}`,
      rules: TOURNAMENT_RULES,
      mapName: map?.name,
    },
  }
}

/* ==================== Roguelike 战役 ==================== */

export interface CampaignBuff {
  id: string
  icon: string
  name: string
  desc: string
  stackable: boolean
}

export const CAMPAIGN_BUFFS: CampaignBuff[] = [
  { id: 'shieldStart', icon: '🛡', name: '开局护盾', desc: '每关开始时获得 1 层护盾（可抵挡一次致命碰撞）', stackable: true },
  { id: 'ghostStart', icon: '👻', name: '开局幽灵', desc: '每关开始时 8 秒幽灵形态，可穿过蛇身', stackable: true },
  { id: 'slowSpeed', icon: '🐢', name: '从容步伐', desc: '战役中所有关卡速度降低 15%', stackable: false },
  { id: 'growthDown', icon: '✂️', name: '饕餮不胖', desc: '战役中食物不再让蛇变长', stackable: false },
  { id: 'scoreUp', icon: '💰', name: '黄金胃', desc: '所有得分 +25%，可叠加', stackable: true },
  { id: 'goldenUp', icon: '✨', name: '招财进宝', desc: '黄金果出现率翻倍', stackable: false },
  { id: 'extraFood', icon: '🍎', name: '丰饶之地', desc: '场上同时存在 2 份食物', stackable: false },
  { id: 'shortStart', icon: '🪶', name: '轻盈之躯', desc: '每关以 3 节短蛇开局', stackable: false },
]

/** 从增益池随机抽 3 个供选择；不可叠加的已拥有增益不再出现 */
export function rollBuffOffers(owned: string[], random: () => number = Math.random): string[] {
  const available = CAMPAIGN_BUFFS.filter((b) => b.stackable || !owned.includes(b.id))
  const picks: string[] = []
  const pool = [...available]
  while (picks.length < 3 && pool.length > 0) {
    const idx = Math.floor(random() * pool.length) % pool.length
    picks.push(pool[idx].id)
    pool.splice(idx, 1)
  }
  return picks
}

/** 战役第 stage 关：以 15 个官方关卡为素材循环，逐步提速并提升目标 */
export function buildCampaignStageConfig(stage: number, buffs: string[]): MatchConfig {
  const def = LEVELS[(stage - 1) % LEVELS.length]
  let tickMs = Math.round(def.tickMs * (1 - 0.03 * (stage - 1)))
  if (buffs.includes('slowSpeed')) tickMs = Math.round(tickMs * 1.15)
  tickMs = Math.max(55, tickMs)
  const goalScale = 1 + 0.15 * (stage - 1)
  let goal: MatchConfig['goal'] = { type: 'none' }
  if (def.goal.type === 'score') goal = { type: 'score', value: Math.round((def.goal.value * goalScale) / 10) * 10 }
  else if (def.goal.type === 'food') goal = { type: 'food', value: def.goal.value + Math.floor((stage - 1) * 0.6) }
  else if (def.goal.type === 'survive') goal = { type: 'survive', value: Math.round(def.goal.value * (1 + 0.1 * (stage - 1))) }
  const length = buffs.includes('shortStart') ? 3 : def.initialLength
  const goldenChance = buffs.includes('goldenUp') ? 0.16 : 0.08
  return {
    mode: 'campaign',
    width: def.width,
    height: def.height,
    wrap: def.wrap,
    walls: def.walls,
    snakes: [
      {
        id: 'p1',
        name: '玩家',
        color: SNAKE_P1_COLOR,
        headColor: SNAKE_P1_HEAD,
        spawn: def.spawn,
        direction: def.direction,
        length,
        controller: 'human',
        shield: buffs.includes('shieldStart') ? 1 : 0,
        ghostTicks: buffs.includes('ghostStart') ? 80 : 0,
      },
    ],
    foodCount: buffs.includes('extraFood') ? 2 : 1,
    foodValue: 10,
    foodGrowth: buffs.includes('growthDown') ? 0 : 1,
    foodRules: { goldenChance, powerChance: 0.08 },
    tickMs,
    goal,
    timeLimitMs: def.timeLimitSec ? Math.round(def.timeLimitSec * 1000 * (1 + 0.1 * (stage - 1))) : undefined,
    difficulty: 'normal',
    scoreMultiplier: 1 + 0.25 * buffs.filter((b) => b === 'scoreUp').length,
    meta: {
      label: `战役 第 ${stage} 关 · ${def.name}`,
      campaignStage: stage,
    },
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
