/**
 * 版本化 localStorage 存储层。
 * 每类数据独立键 + 版本号 + 迁移机制；格式错误/容量不足/禁用存储均不致命。
 */
import { AchievementsState, defaultAchievementsState } from '../game/achievements/definitions'
import { GameSummary } from '../game/core/types'
import { MapData, MAP_SCHEMA_VERSION, validateMap } from '../game/maps/validation'
import { MatchConfig } from '../game/core/types'

const PREFIX = 'snakelab'

export type ThemeMode = 'auto' | 'dark' | 'light' | 'manual'

export interface Settings {
  version: number
  theme: 'neon' | 'light' | 'pixel'
  /** 主题模式：auto 跟随系统深浅色；dark/light 固定；manual 使用 theme 字段（如经典像素） */
  themeMode: ThemeMode
  sound: boolean
  volume: number
  virtualDpad: boolean
}

export function defaultSettings(): Settings {
  return { version: 1, theme: 'neon', themeMode: 'auto', sound: true, volume: 0.5, virtualDpad: false }
}

export interface StatsState {
  version: number
  totalGames: number
  totalFood: number
  totalScore: number
  playTimeMs: number
  /** `${mode}:${difficulty}` -> 人工最高分 */
  highScores: Record<string, number>
  recent: GameSummary[]
  versus: { wins: number; draws: number; losses: number }
}

export function defaultStats(): StatsState {
  return {
    version: 1,
    totalGames: 0,
    totalFood: 0,
    totalScore: 0,
    playTimeMs: 0,
    highScores: {},
    recent: [],
    versus: { wins: 0, draws: 0, losses: 0 },
  }
}

export interface LevelProgressState {
  version: number
  /** 已解锁到的最高关卡 id（初始为 1） */
  unlocked: number
  /** levelId -> 最佳成绩 */
  best: Record<number, { score: number; stars: number }>
}

export function defaultLevelProgress(): LevelProgressState {
  return { version: 1, unlocked: 1, best: {} }
}

export interface CustomLevelDef {
  id: string
  name: string
  mapId: string
  goalScore: number
  timeLimitSec?: number
  tickMs: number
  createdAt: number
}

export interface DailyState {
  version: number
  /** dateKey -> 当日最佳 */
  days: Record<string, { score: number; at: number }>
  /** 连续挑战天数 */
  streak: number
  lastDate?: string
}

export function defaultDaily(): DailyState {
  return { version: 1, days: {}, streak: 0 }
}

export interface RogueState {
  version: number
  runs: number
  bestScore: number
  bestStage: number
  lastBuffs: string[]
}

export function defaultRogue(): RogueState {
  return { version: 1, runs: 0, bestScore: 0, bestStage: 0, lastBuffs: [] }
}

export interface StoredEnvelope<T> {
  version: number
  data: T
}

type Migrator = (raw: unknown) => unknown

function readStored<T>(key: string, currentVersion: number, fallback: T, validate: (d: unknown) => d is T, migrations: Record<number, Migrator>): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`)
    if (raw == null) return fallback
    const envelope = JSON.parse(raw) as Partial<StoredEnvelope<T>>
    if (typeof envelope !== 'object' || envelope === null || typeof envelope.version !== 'number') return fallback
    let version = envelope.version
    let data: unknown = envelope.data
    // 逐步迁移旧版本
    while (version < currentVersion) {
      const migrate = migrations[version]
      if (!migrate) return fallback
      data = migrate(data)
      version += 1
    }
    if (version !== currentVersion) return fallback
    if (!validate(data)) return fallback
    return data
  } catch {
    return fallback
  }
}

function writeStored<T>(key: string, currentVersion: number, data: T): boolean {
  try {
    const envelope: StoredEnvelope<T> = { version: currentVersion, data }
    localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(envelope))
    return true
  } catch {
    // QuotaExceededError 或禁用存储
    return false
  }
}

function isSettings(d: unknown): d is Settings {
  const s = d as Settings
  return typeof s === 'object' && s !== null && ['neon', 'light', 'pixel'].includes(s.theme) && typeof s.sound === 'boolean'
}

const SETTINGS_KEY = `${PREFIX}.settings.v1`

/** 读取设置；旧档缺 themeMode 字段时迁移为 manual（尊重已保存的主题选择） */
function loadSettingsInternal(): Settings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SETTINGS_KEY)
  } catch {
    raw = null
  }
  if (raw == null) return defaultSettings()
  const s = readStored<Settings>('settings.v1', 1, defaultSettings(), isSettings, {})
  const hadMode = typeof raw === 'string' && raw.includes('"themeMode"')
  return { ...defaultSettings(), ...s, themeMode: hadMode ? (s.themeMode ?? 'manual') : 'manual' }
}
function isStats(d: unknown): d is StatsState {
  const s = d as StatsState
  return typeof s === 'object' && s !== null && typeof s.totalGames === 'number' && Array.isArray(s.recent) && typeof s.versus === 'object'
}
function isAchievements(d: unknown): d is AchievementsState {
  const a = d as AchievementsState
  return typeof a === 'object' && a !== null && typeof a.unlocked === 'object' && typeof a.counters === 'object' && a.counters !== null
}
function isMaps(d: unknown): d is MapData[] {
  return Array.isArray(d)
}
function isLevelProgress(d: unknown): d is LevelProgressState {
  const l = d as LevelProgressState
  return typeof l === 'object' && l !== null && typeof l.unlocked === 'number' && typeof l.best === 'object'
}
function isCustomLevels(d: unknown): d is CustomLevelDef[] {
  return Array.isArray(d)
}
function isDaily(d: unknown): d is DailyState {
  const s = d as DailyState
  return typeof s === 'object' && s !== null && typeof s.days === 'object' && typeof s.streak === 'number'
}
function isRogue(d: unknown): d is RogueState {
  const s = d as RogueState
  return typeof s === 'object' && s !== null && typeof s.runs === 'number' && typeof s.bestScore === 'number' && typeof s.bestStage === 'number'
}

export const storage = {
  loadSettings(): Settings {
    return loadSettingsInternal()
  },
  saveSettings(s: Settings): boolean {
    return writeStored('settings.v1', 1, { ...s, version: 1 })
  },
  loadStats(): StatsState {
    const s = readStored<StatsState>('stats.v1', 1, defaultStats(), isStats, {})
    if (s.recent.length > 10) s.recent = s.recent.slice(0, 10)
    return s
  },
  saveStats(s: StatsState): boolean {
    return writeStored('stats.v1', 1, { ...s, recent: s.recent.slice(0, 10) })
  },
  loadAchievements(): AchievementsState {
    const a = readStored<AchievementsState>('achievements.v1', 1, defaultAchievementsState(), isAchievements, {})
    // 与默认计数合并，防止旧档缺字段
    return { ...defaultAchievementsState(), ...a, counters: { ...defaultAchievementsState().counters, ...a.counters } }
  },
  saveAchievements(a: AchievementsState): boolean {
    return writeStored('achievements.v1', 1, a)
  },
  loadMaps(): MapData[] {
    const maps = readStored<MapData[]>('maps.v1', 1, [], isMaps, {})
    return maps.filter((m) => validateMap(m).ok)
  },
  saveMaps(maps: MapData[]): boolean {
    return writeStored('maps.v1', 1, maps.map((m) => ({ ...m, schemaVersion: MAP_SCHEMA_VERSION })))
  },
  loadLevelProgress(): LevelProgressState {
    return readStored<LevelProgressState>('levels.v1', 1, defaultLevelProgress(), isLevelProgress, {})
  },
  saveLevelProgress(l: LevelProgressState): boolean {
    return writeStored('levels.v1', 1, l)
  },
  loadCustomLevels(): CustomLevelDef[] {
    return readStored<CustomLevelDef[]>('customLevels.v1', 1, [], isCustomLevels, {})
  },
  saveCustomLevels(levels: CustomLevelDef[]): boolean {
    return writeStored('customLevels.v1', 1, levels.slice(0, 100))
  },
  loadDaily(): DailyState {
    const d = readStored<DailyState>('daily.v1', 1, defaultDaily(), isDaily, {})
    // 只保留最近 90 天
    const keys = Object.keys(d.days).sort().reverse()
    if (keys.length > 90) {
      for (const k of keys.slice(90)) delete d.days[k]
    }
    return d
  },
  saveDaily(d: DailyState): boolean {
    return writeStored('daily.v1', 1, d)
  },
  loadRogue(): RogueState {
    return readStored<RogueState>('rogue.v1', 1, defaultRogue(), isRogue, {})
  },
  saveRogue(r: RogueState): boolean {
    return writeStored('rogue.v1', 1, r)
  },

  /** 导出全部数据为 JSON 字符串（备份） */
  exportAll(): string {
    return JSON.stringify(
      {
        app: 'snake-lab',
        exportedAt: Date.now(),
        settings: this.loadSettings(),
        stats: this.loadStats(),
        achievements: this.loadAchievements(),
        maps: this.loadMaps(),
        levelProgress: this.loadLevelProgress(),
        customLevels: this.loadCustomLevels(),
        daily: this.loadDaily(),
        rogue: this.loadRogue(),
      },
      null,
      2,
    )
  },

  /** 从备份 JSON 恢复；逐键校验，失败键跳过并报告 */
  importAll(json: string): { ok: boolean; restored: string[]; errors: string[] } {
    const restored: string[] = []
    const errors: string[] = []
    let data: Record<string, unknown>
    try {
      data = JSON.parse(json) as Record<string, unknown>
    } catch {
      return { ok: false, restored, errors: ['文件不是合法的 JSON'] }
    }
    if (typeof data !== 'object' || data === null || data.app !== 'snake-lab') {
      return { ok: false, restored, errors: ['不是 Snake Lab 的备份文件'] }
    }
    const tryRestore = <T,>(name: string, value: unknown, save: (v: T) => boolean): void => {
      if (value === undefined) return
      if (save(value as T)) restored.push(name)
      else errors.push(`${name} 写入失败`)
    }
    tryRestore('设置', data.settings, (v: Settings) => this.saveSettings({ ...defaultSettings(), ...v, themeMode: v.themeMode ?? 'manual' }))
    tryRestore('统计', data.stats, (v: StatsState) => this.saveStats({ ...defaultStats(), ...v }))
    tryRestore('成就', data.achievements, (v: AchievementsState) => this.saveAchievements({ ...defaultAchievementsState(), ...v }))
    tryRestore('关卡进度', data.levelProgress, (v: LevelProgressState) => this.saveLevelProgress({ ...defaultLevelProgress(), ...v }))
    tryRestore('自定义关卡', data.customLevels, (v: CustomLevelDef[]) => this.saveCustomLevels(v))
    tryRestore('每日挑战', data.daily, (v: DailyState) => this.saveDaily({ ...defaultDaily(), ...v }))
    tryRestore('战役', data.rogue, (v: RogueState) => this.saveRogue({ ...defaultRogue(), ...v }))
    if (Array.isArray(data.maps)) {
      const maps = (data.maps as MapData[]).filter((m) => validateMap(m).ok)
      if (this.saveMaps(maps)) restored.push('地图')
      else errors.push('地图写入失败')
    }
    if (restored.length === 0 && errors.length === 0) errors.push('备份中没有任何可恢复的数据')
    return { ok: restored.length > 0, restored, errors }
  },

  /** 危险操作：清除全部数据（需 UI 二次确认） */
  clearAll(): void {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(`${PREFIX}.`)) keys.push(k)
      }
      for (const k of keys) localStorage.removeItem(k)
    } catch {
      // 忽略
    }
  },

  /** 估算当前占用字节数 */
  usageBytes(): number {
    let total = 0
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(`${PREFIX}.`)) total += (localStorage.getItem(k)?.length ?? 0) + k.length
      }
    } catch {
      return 0
    }
    return total * 2 // UTF-16 近似
  },
}

export function highScoreKey(mode: string, difficulty: string): string {
  return `${mode}:${difficulty}`
}

export type { MatchConfig }
