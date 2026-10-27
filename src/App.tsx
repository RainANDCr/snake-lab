import { useCallback, useEffect, useState } from 'react'
import { Github, Monitor, Moon, Sun } from 'lucide-react'
import { Difficulty, MatchConfig } from './game/core/types'
import { LevelDef, getLevel, levelToConfig } from './game/levels/levels'
import { audio } from './services/audio'
import { Settings, ThemeMode, storage } from './services/storage'
import { Toast, uiBus } from './services/uiBus'
import { ThemeName } from './styles/themes'
import { GameScreen, GameScreenOptions } from './components/GameScreen'
import { HomePage, HomePageEntry } from './features/HomePage'
import { SingleSetupPage } from './features/SingleSetupPage'
import { AiLabPage } from './features/AiLabPage'
import { VersusSetupPage } from './features/VersusSetupPage'
import { LevelsPage } from './features/LevelsPage'
import { MapEditorPage } from './features/MapEditorPage'
import { AchievementsPage } from './features/AchievementsPage'
import { StatsPage } from './features/StatsPage'
import { SettingsPage } from './features/SettingsPage'

type Route =
  | { page: 'home' }
  | { page: 'single-setup' }
  | { page: 'ai-lab' }
  | { page: 'versus-setup' }
  | { page: 'levels' }
  | { page: 'editor' }
  | { page: 'achievements' }
  | { page: 'stats' }
  | { page: 'settings' }
  | { page: 'game'; config: MatchConfig; options: GameScreenOptions }

const ENTRIES: HomePageEntry[] = ['single-setup', 'ai-lab', 'versus-setup', 'levels', 'editor', 'achievements', 'stats', 'settings']

const GITHUB_URL = 'https://github.com/RainANDCr/snake-lab'

/** 解析最终生效主题：auto 跟随系统深浅色，dark/light 固定，manual 使用手动选择（如经典像素） */
function resolveTheme(s: Settings, systemDark: boolean): ThemeName {
  switch (s.themeMode) {
    case 'dark':
      return 'neon'
    case 'light':
      return 'light'
    case 'auto':
      return systemDark ? 'neon' : 'light'
    default:
      return s.theme
  }
}

const THEME_MODE_ORDER: ThemeMode[] = ['auto', 'dark', 'light']

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'home' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings())
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme = resolveTheme(settings, systemDark)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    return uiBus.onToast((t) => {
      setToasts((prev) => [...prev.slice(-3), t])
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3600)
    })
  }, [])

  useEffect(() => {
    const unlock = (): void => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const navigate = useCallback((page: Exclude<Route['page'], 'game'>) => setRoute({ page }), [])

  const launchGame = useCallback((config: MatchConfig, options: GameScreenOptions) => setRoute({ page: 'game', config, options }), [])

  const playLevel = useCallback(
    (levelId: number, difficulty: Difficulty = 'normal') => {
      const def = getLevel(levelId)
      if (!def) return
      const config = levelToConfig(def, difficulty)
      setRoute({
        page: 'game',
        config,
        options: {
          kind: 'level',
          onExit: () => setRoute({ page: 'levels' }),
          onNextLevel: (clearedId: number) => playLevel(clearedId + 1, difficulty),
        },
      })
    },
    [],
  )

  const applySettings = useCallback((next: Settings) => {
    storage.saveSettings(next)
    setSettings(next)
  }, [])

  // 快捷栏：跟随系统 → 深色 → 浅色 循环
  const cycleThemeMode = useCallback(() => {
    audio.click()
    const current = settings.themeMode
    const idx = THEME_MODE_ORDER.indexOf(current)
    const next: ThemeMode = THEME_MODE_ORDER[(idx + 1) % THEME_MODE_ORDER.length] ?? 'auto'
    applySettings({
      ...settings,
      themeMode: next,
      theme: next === 'dark' ? 'neon' : next === 'light' ? 'light' : settings.theme,
    })
  }, [applySettings, settings])

  const themeIcon =
    settings.themeMode === 'dark' ? <Moon size={15} /> : settings.themeMode === 'light' ? <Sun size={15} /> : <Monitor size={15} />
  const themeLabel = settings.themeMode === 'dark' ? '深色' : settings.themeMode === 'light' ? '浅色' : '跟随系统'

  return (
    <div className="app">
      <div className="quick-bar">
        <button className="quick-btn" onClick={cycleThemeMode} title="切换显示模式（跟随系统 / 深色 / 浅色）">
          {themeIcon}
          <span>{themeLabel}</span>
        </button>
        <a className="quick-btn" href={GITHUB_URL} target="_blank" rel="noreferrer" title="GitHub 仓库">
          <Github size={15} />
          <span>GitHub</span>
        </a>
      </div>

      {route.page === 'home' && <HomePage onNavigate={(entry) => navigate(entry)} entries={ENTRIES} />}
      {route.page === 'single-setup' && <SingleSetupPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'ai-lab' && <AiLabPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'versus-setup' && <VersusSetupPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'levels' && <LevelsPage onExit={() => navigate('home')} onPlay={playLevel} />}
      {route.page === 'editor' && <MapEditorPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'achievements' && <AchievementsPage onExit={() => navigate('home')} />}
      {route.page === 'stats' && <StatsPage onExit={() => navigate('home')} />}
      {route.page === 'settings' && <SettingsPage onExit={() => navigate('home')} onSettingsChange={applySettings} />}
      {route.page === 'game' && <GameScreen config={route.config} options={route.options} />}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <b>{t.title}</b>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export type { LevelDef }
