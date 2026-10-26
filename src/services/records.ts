/**
 * 战绩上报：游戏结束/离散事件 → 统计、成就、关卡进度的统一入口。
 * 成就解锁通过 uiBus 弹出 Toast。
 */
import { AchievementsState, AchievementDef, applyGameSummary, applyUiEvent, defaultAchievementsState } from '../game/achievements/definitions'
import { GameSummary } from '../game/core/types'
import { LEVELS, getLevel, starsForScore } from '../game/levels/levels'
import { audio } from './audio'
import { LevelProgressState, StatsState, highScoreKey, storage } from './storage'
import { uiBus } from './uiBus'

function notifyAchievements(unlocked: AchievementDef[]): void {
  for (const def of unlocked) {
    uiBus.push({ title: '成就解锁', message: `${def.icon} ${def.name}`, kind: 'achievement' })
    audio.achievement()
  }
}

/** 一局游戏结束（每局只上报一次，由 GameScreen 保证） */
export function recordGameSummary(summary: GameSummary): void {
  // 1. 统计
  const stats: StatsState = storage.loadStats()
  stats.totalGames += 1
  stats.totalFood += summary.foodEaten
  stats.totalScore += summary.score
  stats.playTimeMs += summary.durationMs
  if (summary.manual && !summary.officialLevelId) {
    const key = highScoreKey(summary.mode, summary.difficulty)
    stats.highScores[key] = Math.max(stats.highScores[key] ?? 0, summary.score)
  }
  stats.recent = [summary, ...stats.recent].slice(0, 10)
  if (summary.versusResult === 'win') stats.versus.wins += 1
  else if (summary.versusResult === 'draw') stats.versus.draws += 1
  else if (summary.versusResult === 'loss') stats.versus.losses += 1
  storage.saveStats(stats)

  // 2. 官方关卡进度（历史星级只升不降）
  if (summary.officialLevelId != null) {
    const def = getLevel(summary.officialLevelId)
    if (def && summary.won) {
      const stars = starsForScore(def, summary.score)
      const progress: LevelProgressState = storage.loadLevelProgress()
      const prev = progress.best[summary.officialLevelId]
      progress.best[summary.officialLevelId] = {
        score: Math.max(prev?.score ?? 0, summary.score),
        stars: Math.max(prev?.stars ?? 0, stars),
      }
      progress.unlocked = Math.max(progress.unlocked, Math.min(summary.officialLevelId + 1, LEVELS.length))
      storage.saveLevelProgress(progress)
      summary.stars = Math.max(summary.stars ?? 0, stars)
    }
  }

  // 3. 成就
  const ach = storage.loadAchievements()
  const unlocked = applyGameSummary(ach, summary)
  storage.saveAchievements(ach)
  notifyAchievements(unlocked)
}

/** AI 控制事件（开局选择或游戏中切换到 AI） */
export function recordAiUse(algorithm: 'bfs' | 'astar'): void {
  const ach = storage.loadAchievements()
  const unlocked = applyUiEvent(ach, { type: 'ai_used', algorithm })
  storage.saveAchievements(ach)
  notifyAchievements(unlocked)
}

/** 算法可视化演示完成 */
export function recordVizDemo(): void {
  const ach = storage.loadAchievements()
  const unlocked = applyUiEvent(ach, { type: 'viz_demo' })
  storage.saveAchievements(ach)
  notifyAchievements(unlocked)
}

/** 保存「新」地图时触发（同一张地图重复保存不重复计数） */
export function recordMapCreatedIfNew(mapId: string): void {
  const known = storage.loadMaps().some((m) => m.id === mapId)
  if (known) return
  const ach = storage.loadAchievements()
  const unlocked = applyUiEvent(ach, { type: 'map_created', mapId })
  storage.saveAchievements(ach)
  notifyAchievements(unlocked)
}

export function resetAllGameData(): void {
  storage.clearAll()
}
