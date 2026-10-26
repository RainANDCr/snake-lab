/** Snake Lab 统一核心类型定义 —— 所有模式（单人/对战/AI/关卡）共用 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Position {
  x: number
  y: number
}

/** 网格坐标键 "x,y" */
export type CellKey = string

export function keyOf(p: Position): CellKey {
  return `${p.x},${p.y}`
}

export function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

export const DIR_VECTORS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export const ALL_DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

export type Difficulty = 'easy' | 'normal' | 'hard'

export type ControllerKind = 'human' | 'bfs' | 'astar' | 'safe'

export type GameMode = 'classic' | 'endless' | 'speed' | 'versus' | 'versus-timed' | 'versus-ai' | 'level' | 'custom'

export type GameStatus = 'ready' | 'countdown' | 'playing' | 'paused' | 'won' | 'lost' | 'draw'

export type DeathCause = 'wall' | 'body' | 'head-on' | 'swap'

export type PowerupKind = 'speed' | 'slow' | 'double' | 'shield'

export interface SnakeInit {
  id: string
  name: string
  color: string
  headColor?: string
  spawn: Position
  direction: Direction
  length: number
  controller: ControllerKind
}

export interface SnakeState {
  id: string
  name: string
  color: string
  headColor: string
  /** 头在前的有序坐标 */
  body: Position[]
  direction: Direction
  /** 输入队列：每个逻辑 tick 至多采纳一次转向 */
  queue: Direction[]
  pendingGrowth: number
  alive: boolean
  deathCause?: DeathCause
  score: number
  foodEaten: number
  controller: ControllerKind
  /** 护盾剩余次数 */
  shield: number
  /** 速度倍率（道具） */
  speedMult: number
  speedTicks: number
  /** 得分倍率（道具） */
  scoreMult: number
  scoreTicks: number
  /** 移动累积器：>=1 时本 tick 移动 */
  accumulator: number
}

export interface FoodItem {
  id: number
  position: Position
  value: number
  growth: number
  kind: 'normal' | 'special'
}

export interface PowerupItem {
  id: number
  position: Position
  kind: PowerupKind
}

export interface PowerupConfig {
  enabled: boolean
  /** 每个 tick 的生成概率 */
  chancePerTick: number
  /** 效果持续 tick 数 */
  durationTicks: number
}

export interface SpeedRamp {
  /** 每达到多少分提速一次 */
  everyScore: number
  /** 每次提速减少的 tick 毫秒数 */
  decreaseMs: number
  minTickMs: number
}

export type GoalType = 'score' | 'food' | 'survive' | 'none'

export interface Goal {
  type: GoalType
  /** score: 目标分数；food: 目标食物数；survive: 存活秒数 */
  value?: number
}

export interface MatchConfig {
  mode: GameMode
  width: number
  height: number
  /** 无尽穿墙 */
  wrap: boolean
  walls: Position[]
  snakes: SnakeInit[]
  /** 场上同时存在的食物数 */
  foodCount: number
  foodValue: number
  foodGrowth: number
  /** 特殊食物规则（关卡用） */
  specialFood?: { chance: number; value: number; growth: number }
  /** 基础逻辑步长（毫秒），越小越快 */
  tickMs: number
  speedRamp?: SpeedRamp
  goal: Goal
  /** 限时（毫秒），到时结算 */
  timeLimitMs?: number
  powerups?: PowerupConfig
  difficulty?: Difficulty
  meta?: {
    label?: string
    levelId?: number
    mapId?: string
    mapName?: string
    /** 对战模式说明 */
    rules?: string[]
  }
}

export type GameEventType =
  | 'game_started'
  | 'game_ended'
  | 'food_eaten'
  | 'score_changed'
  | 'snake_died'
  | 'speed_up'
  | 'powerup_spawned'
  | 'powerup_collected'
  | 'shield_used'

export interface GameEvent {
  type: GameEventType
  snakeId?: string
  cause?: DeathCause
  score?: number
  value?: number
  kind?: PowerupKind
  reason?: string
  winnerIds?: string[]
  stars?: number
}

export interface GameResult {
  winnerIds: string[]
  reason: string
}

export interface GameState {
  config: MatchConfig
  wallSet: Set<CellKey>
  status: GameStatus
  /** 逻辑 tick 计数（确定性的逻辑时钟） */
  tick: number
  /** 游戏内累计时间（毫秒，随逻辑步长推进，暂停不计） */
  elapsedMs: number
  snakes: SnakeState[]
  foods: FoodItem[]
  powerups: PowerupItem[]
  nextItemId: number
  /** LCG 随机数状态，确定性可复现 */
  rngSeed: number
  effectiveTickMs: number
  result: GameResult | null
}

export interface GameSummary {
  mode: GameMode
  difficulty: Difficulty
  /** 是否全程人工操作（无 AI 参与） */
  manual: boolean
  score: number
  foodEaten: number
  durationMs: number
  won: boolean
  draw?: boolean
  mapId?: string
  officialLevelId?: number
  stars?: number
  versusResult?: 'win' | 'draw' | 'loss'
  controller: ControllerKind
  /** 记录时间戳 */
  at?: number
}
