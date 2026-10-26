/**
 * 成就系统：配置驱动 + 事件驱动。
 * 计数规则明确区分人工/AI：单局分数类成就只统计人工操作局。
 */
import { GameSummary } from '../core/types'

export type AchievementCategory = 'growth' | 'score' | 'versus' | 'ai' | 'create' | 'level'

export interface AchievementCounters {
  totalGames: number
  totalFood: number
  /** 人工操作单局最高分（不含对战与 AI 局） */
  bestManualScore: number
  versusMatches: number
  versusWins: number
  bfsUsed: number
  astarUsed: number
  vizDemoDone: number
  mapsCreated: number
  /** 玩过自定义地图的去重 ID 列表 */
  mapsPlayed: string[]
  /** 官方关卡星级记录 levelId -> stars */
  levelStars: Record<number, number>
}

export interface AchievementsState {
  version: number
  unlocked: Record<string, number>
  counters: AchievementCounters
}

export interface AchievementDef {
  id: string
  name: string
  category: AchievementCategory
  icon: string
  description: string
  target: number
  /** 返回当前进度（0..target） */
  progress: (c: AchievementCounters) => number
}

export const LEVEL_TOTAL = 15

export const ACHIEVEMENTS: AchievementDef[] = [
  // 成长
  { id: 'first-game', name: '初次启程', category: 'growth', icon: '🚀', description: '完成第一局游戏', target: 1, progress: (c) => Math.min(c.totalGames, 1) },
  { id: 'food-10', name: '贪吃新手', category: 'growth', icon: '🍎', description: '累计吃下 10 个食物', target: 10, progress: (c) => Math.min(c.totalFood, 10) },
  { id: 'food-100', name: '美食达人', category: 'growth', icon: '🍽️', description: '累计吃下 100 个食物', target: 100, progress: (c) => Math.min(c.totalFood, 100) },
  { id: 'food-1000', name: '贪吃大师', category: 'growth', icon: '👑', description: '累计吃下 1000 个食物', target: 1000, progress: (c) => Math.min(c.totalFood, 1000) },
  // 分数（仅人工操作）
  { id: 'score-100', name: '崭露头角', category: 'score', icon: '⭐', description: '人工单局达到 100 分', target: 100, progress: (c) => Math.min(c.bestManualScore, 100) },
  { id: 'score-500', name: '百尺竿头', category: 'score', icon: '🌟', description: '人工单局达到 500 分', target: 500, progress: (c) => Math.min(c.bestManualScore, 500) },
  { id: 'score-1000', name: '高分传奇', category: 'score', icon: '🏆', description: '人工单局达到 1000 分', target: 1000, progress: (c) => Math.min(c.bestManualScore, 1000) },
  // 对战
  { id: 'vs-first', name: '初次交锋', category: 'versus', icon: '⚔️', description: '完成第一场本地双人对战', target: 1, progress: (c) => Math.min(c.versusMatches, 1) },
  { id: 'vs-win-5', name: '竞技新星', category: 'versus', icon: '🥉', description: '累计取得 5 场对战胜利', target: 5, progress: (c) => Math.min(c.versusWins, 5) },
  { id: 'vs-win-20', name: '竞技大师', category: 'versus', icon: '🥇', description: '累计取得 20 场对战胜利', target: 20, progress: (c) => Math.min(c.versusWins, 20) },
  // AI
  { id: 'ai-bfs', name: '算法初体验', category: 'ai', icon: '🧭', description: '首次使用 BFS 控制', target: 1, progress: (c) => Math.min(c.bfsUsed, 1) },
  { id: 'ai-astar', name: '启发式探索', category: 'ai', icon: '💡', description: '首次使用 A* 控制', target: 1, progress: (c) => Math.min(c.astarUsed, 1) },
  { id: 'ai-viz', name: '算法观察者', category: 'ai', icon: '🔭', description: '完成一次算法可视化演示', target: 1, progress: (c) => Math.min(c.vizDemoDone, 1) },
  // 创造
  { id: 'map-first', name: '地图设计师', category: 'create', icon: '✏️', description: '保存首张自定义地图', target: 1, progress: (c) => Math.min(c.mapsCreated, 1) },
  { id: 'map-10', name: '创造大师', category: 'create', icon: '🏗️', description: '累计创建 10 张不同的自定义地图', target: 10, progress: (c) => Math.min(c.mapsCreated, 10) },
  { id: 'map-play-5', name: '地图探险家', category: 'create', icon: '🗺️', description: '在 5 张不同的自定义地图中完成一局游戏', target: 5, progress: (c) => Math.min(c.mapsPlayed.length, 5) },
  // 关卡
  { id: 'level-star', name: '第一颗星', category: 'level', icon: '✨', description: '首次获得关卡星级', target: 1, progress: (c) => (Object.values(c.levelStars).some((s) => s > 0) ? 1 : 0) },
  { id: 'level-5', name: '勇往直前', category: 'level', icon: '🔥', description: '通关 5 个不同的官方关卡', target: 5, progress: (c) => Object.values(c.levelStars).filter((s) => s > 0).length },
  { id: 'level-all', name: '挑战大师', category: 'level', icon: '🎖️', description: `通关全部 ${LEVEL_TOTAL} 个初始官方关卡`, target: LEVEL_TOTAL, progress: (c) => Object.values(c.levelStars).filter((s) => s > 0).length },
  { id: 'level-perfect', name: '完美主义者', category: 'level', icon: '💎', description: `全部 ${LEVEL_TOTAL} 个初始官方关卡达到三星`, target: LEVEL_TOTAL, progress: (c) => Object.values(c.levelStars).filter((s) => s >= 3).length },
]

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  growth: '成长',
  score: '分数',
  versus: '对战',
  ai: 'AI',
  create: '创造',
  level: '关卡',
}

export function defaultAchievementsState(): AchievementsState {
  return {
    version: 1,
    unlocked: {},
    counters: {
      totalGames: 0,
      totalFood: 0,
      bestManualScore: 0,
      versusMatches: 0,
      versusWins: 0,
      bfsUsed: 0,
      astarUsed: 0,
      vizDemoDone: 0,
      mapsCreated: 0,
      mapsPlayed: [],
      levelStars: {},
    },
  }
}

function checkUnlocks(state: AchievementsState): AchievementDef[] {
  const newly: AchievementDef[] = []
  for (const def of ACHIEVEMENTS) {
    if (state.unlocked[def.id] != null) continue
    if (def.progress(state.counters) >= def.target) {
      state.unlocked[def.id] = Date.now()
      newly.push(def)
    }
  }
  return newly
}

/** 游戏结束汇总：更新计数并触发解锁 */
export function applyGameSummary(state: AchievementsState, summary: GameSummary): AchievementDef[] {
  const c = state.counters
  c.totalGames += 1
  c.totalFood += summary.foodEaten
  if (summary.mode === 'versus' || summary.mode === 'versus-timed' || summary.mode === 'versus-ai') {
    c.versusMatches += 1
    if (summary.versusResult === 'win') c.versusWins += 1
  } else if (summary.manual) {
    // 人工高分成就：不含对战、不含 AI 局
    c.bestManualScore = Math.max(c.bestManualScore, summary.score)
  }
  if (summary.mapId && !c.mapsPlayed.includes(summary.mapId)) {
    c.mapsPlayed.push(summary.mapId)
    if (c.mapsPlayed.length > 200) c.mapsPlayed = c.mapsPlayed.slice(-200)
  }
  if (summary.officialLevelId != null && summary.stars != null) {
    const prev = c.levelStars[summary.officialLevelId] ?? 0
    c.levelStars[summary.officialLevelId] = Math.max(prev, summary.stars)
  }
  return checkUnlocks(state)
}

export type AchievementUiEvent =
  | { type: 'ai_used'; algorithm: 'bfs' | 'astar' }
  | { type: 'viz_demo' }
  | { type: 'map_created'; mapId: string }

/** UI 离散事件：切换 AI、完成演示、保存新地图 */
export function applyUiEvent(state: AchievementsState, event: AchievementUiEvent): AchievementDef[] {
  const c = state.counters
  if (event.type === 'ai_used') {
    if (event.algorithm === 'bfs') c.bfsUsed += 1
    else c.astarUsed += 1
  } else if (event.type === 'viz_demo') {
    c.vizDemoDone += 1
  } else if (event.type === 'map_created') {
    c.mapsCreated += 1
  }
  return checkUnlocks(state)
}
