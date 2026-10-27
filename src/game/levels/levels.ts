/**
 * 15 个官方关卡配置：3 大章节，每关有实际地图数据、初始条件与可执行胜负条件。
 * 星级按最终得分阈值评定（生存类关卡同样按通关时得分计星）。
 */
import { Direction, MatchConfig, Position } from '../core/types'
import { Difficulty } from '../core/types'

export interface LevelDef {
  id: number
  chapter: 1 | 2 | 3
  name: string
  description: string
  width: number
  height: number
  wrap: boolean
  walls: Position[]
  spawn: Position
  direction: Direction
  initialLength: number
  tickMs: number
  timeLimitSec?: number
  goal: { type: 'score' | 'food' | 'survive'; value: number }
  /** 一/二/三星的得分阈值（升序） */
  stars: [number, number, number]
  specialFood?: boolean
}

function hLine(y: number, x1: number, x2: number): Position[] {
  const out: Position[] = []
  for (let x = x1; x <= x2; x++) out.push({ x, y })
  return out
}

function vLine(x: number, y1: number, y2: number): Position[] {
  const out: Position[] = []
  for (let y = y1; y <= y2; y++) out.push({ x, y })
  return out
}

function fillRect(x1: number, y1: number, x2: number, y2: number): Position[] {
  const out: Position[] = []
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) out.push({ x, y })
  return out
}

/** 蛇形迷宫：三道横墙，左右交替留缺口 */
function serpentineMaze(): Position[] {
  return [...hLine(6, 2, 17), ...hLine(12, 7, 21), ...hLine(18, 2, 17)]
}

/** 狭窄通道：三道竖墙，中部留缺口 */
function corridors(): Position[] {
  return [
    ...vLine(7, 0, 8),
    ...vLine(7, 13, 23),
    ...vLine(13, 0, 8),
    ...vLine(13, 13, 23),
    ...vLine(19, 0, 8),
    ...vLine(19, 13, 23),
  ]
}

export const LEVELS: LevelDef[] = [
  // ── 第一章：新手启程 ──
  {
    id: 1, chapter: 1, name: '移动初体验', description: '空旷场地，收集 8 份食物即可通关。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 4, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 160, goal: { type: 'food', value: 8 }, stars: [50, 80, 130],
  },
  {
    id: 2, chapter: 1, name: '连续收集食物', description: '不间断地收集，拿到 150 分。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 4, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 145, goal: { type: 'score', value: 150 }, stars: [80, 150, 220],
  },
  {
    id: 3, chapter: 1, name: '简单障碍', description: '场地中央出现障碍方块，绕行收集。',
    width: 24, height: 24, wrap: false, walls: fillRect(9, 9, 14, 14),
    spawn: { x: 4, y: 4 }, direction: 'right', initialLength: 3,
    tickMs: 150, goal: { type: 'score', value: 100 }, stars: [60, 100, 160],
  },
  {
    id: 4, chapter: 1, name: '基础限时赛', description: '60 秒内拿到 100 分。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 4, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 130, timeLimitSec: 60, goal: { type: 'score', value: 100 }, stars: [60, 100, 160],
  },
  {
    id: 5, chapter: 1, name: '初级综合挑战', description: '双横墙障碍 + 90 秒限时，目标 150 分。',
    width: 24, height: 24, wrap: false, walls: [...hLine(6, 6, 17), ...hLine(17, 6, 17)],
    spawn: { x: 3, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 140, timeLimitSec: 90, goal: { type: 'score', value: 150 }, stars: [100, 150, 220],
  },
  // ── 第二章：复杂地形 ──
  {
    id: 6, chapter: 2, name: '狭窄通道', description: '三道竖墙分隔出狭窄通道，从缺口穿行。',
    width: 24, height: 24, wrap: false, walls: corridors(),
    spawn: { x: 2, y: 4 }, direction: 'right', initialLength: 3,
    tickMs: 130, goal: { type: 'score', value: 150 }, stars: [100, 150, 220],
  },
  {
    id: 7, chapter: 2, name: '多障碍区', description: '五个障碍块散布场地，谨慎规划路线。',
    width: 24, height: 24, wrap: false,
    walls: [...fillRect(5, 5, 7, 7), ...fillRect(16, 5, 18, 7), ...fillRect(5, 16, 7, 18), ...fillRect(16, 16, 18, 18), ...fillRect(11, 11, 12, 12)],
    spawn: { x: 2, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 130, goal: { type: 'score', value: 180 }, stars: [120, 180, 260],
  },
  {
    id: 8, chapter: 2, name: '迷宫搜索', description: '蛇形迷宫中穿行觅食。',
    width: 24, height: 24, wrap: false, walls: serpentineMaze(),
    spawn: { x: 2, y: 2 }, direction: 'right', initialLength: 3,
    tickMs: 140, goal: { type: 'score', value: 150 }, stars: [100, 150, 220],
  },
  {
    id: 9, chapter: 2, name: '长蛇生存', description: '以 10 节长蛇开局，存活 60 秒。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 12, y: 12 }, direction: 'right', initialLength: 10,
    tickMs: 140, goal: { type: 'survive', value: 60 }, stars: [80, 140, 220],
  },
  {
    id: 10, chapter: 2, name: '中级综合挑战', description: '迷宫 + 90 秒限时，目标 200 分。',
    width: 24, height: 24, wrap: false, walls: serpentineMaze(),
    spawn: { x: 2, y: 2 }, direction: 'right', initialLength: 3,
    tickMs: 130, timeLimitSec: 90, goal: { type: 'score', value: 200 }, stars: [140, 200, 280],
  },
  // ── 第三章：极限挑战 ──
  {
    id: 11, chapter: 3, name: '高速移动', description: '基础速度大幅提升，考验反应。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 4, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 90, goal: { type: 'score', value: 200 }, stars: [140, 200, 280],
  },
  {
    id: 12, chapter: 3, name: '复杂迷宫', description: '迷宫叠加四角柱障，目标 200 分。',
    width: 24, height: 24, wrap: false,
    walls: [...serpentineMaze(), ...fillRect(5, 5, 6, 6), ...fillRect(17, 5, 18, 6), ...fillRect(5, 17, 6, 18), ...fillRect(17, 17, 18, 18)],
    spawn: { x: 2, y: 2 }, direction: 'right', initialLength: 3,
    tickMs: 120, goal: { type: 'score', value: 200 }, stars: [140, 200, 280],
  },
  {
    id: 13, chapter: 3, name: '高分目标', description: '无障碍纯走位，冲击 400 分。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 4, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 120, goal: { type: 'score', value: 400 }, stars: [250, 400, 560],
  },
  {
    id: 14, chapter: 3, name: '时间压力', description: '只有 45 秒，目标 180 分，分秒必争。',
    width: 24, height: 24, wrap: false, walls: [],
    spawn: { x: 4, y: 12 }, direction: 'right', initialLength: 3,
    tickMs: 110, timeLimitSec: 45, goal: { type: 'score', value: 180 }, stars: [120, 180, 240],
  },
  {
    id: 15, chapter: 3, name: '终极综合挑战', description: '通道 + 柱障 + 100ms 高速 + 120 秒限时，目标 300 分。',
    width: 24, height: 24, wrap: false,
    walls: [...corridors(), ...fillRect(10, 4, 11, 5), ...fillRect(10, 18, 11, 19), ...fillRect(16, 11, 17, 12)],
    spawn: { x: 2, y: 4 }, direction: 'right', initialLength: 3,
    tickMs: 100, timeLimitSec: 120, goal: { type: 'score', value: 300 }, stars: [200, 300, 420],
  },
]

export const CHAPTERS: { id: 1 | 2 | 3; name: string; description: string }[] = [
  { id: 1, name: '第一章 · 新手启程', description: '学习移动、收集与避障' },
  { id: 2, name: '第二章 · 复杂地形', description: '通道、迷宫与长蛇生存' },
  { id: 3, name: '第三章 · 极限挑战', description: '高速、高压与终极试炼' },
]

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id)
}

export function levelToConfig(def: LevelDef, difficulty: Difficulty): MatchConfig {
  const speedFactor = difficulty === 'easy' ? 1.25 : difficulty === 'hard' ? 0.85 : 1
  return {
    mode: 'level',
    width: def.width,
    height: def.height,
    wrap: def.wrap,
    walls: def.walls,
    snakes: [
      {
        id: 'p1',
        name: '玩家',
        color: '#34d399',
        headColor: '#a7f3d0',
        spawn: def.spawn,
        direction: def.direction,
        length: def.initialLength,
        controller: 'human',
      },
    ],
    foodCount: 1,
    foodValue: 10,
    foodGrowth: 1,
    foodRules: def.specialFood ? { goldenChance: 0.15, powerChance: 0.08 } : { goldenChance: 0.06, powerChance: 0 },
    tickMs: Math.round(def.tickMs * speedFactor),
    goal: { type: def.goal.type, value: def.goal.value },
    timeLimitMs: def.timeLimitSec ? def.timeLimitSec * 1000 : undefined,
    difficulty,
    meta: { label: `第 ${def.id} 关 · ${def.name}`, levelId: def.id },
  }
}

export function starsForScore(def: LevelDef, score: number): number {
  if (score >= def.stars[2]) return 3
  if (score >= def.stars[1]) return 2
  if (score >= def.stars[0]) return 1
  return 0
}

export function levelGoalText(def: LevelDef): string {
  const goal =
    def.goal.type === 'score'
      ? `达到 ${def.goal.value} 分`
      : def.goal.type === 'food'
        ? `收集 ${def.goal.value} 份食物`
        : `存活 ${def.goal.value} 秒`
  const time = def.timeLimitSec ? ` · 限时 ${def.timeLimitSec}s` : ''
  return `${goal}${time}`
}
