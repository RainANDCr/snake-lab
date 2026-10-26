import { useCallback, useEffect, useState } from 'react'
import { Difficulty, MatchConfig } from './game/core/types'
import { LevelDef, getLevel, levelToConfig } from './game/levels/levels'
import { audio } from './services/audio'
import { storage } from './services/storage'
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

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'home' })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [theme, setTheme] = useState<ThemeName>(() => storage.loadSettings().theme)

  useEffect(() => applyTheme(theme), [theme])

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

  return (
    <div className="app">
      {route.page === 'home' && <HomePage onNavigate={(entry) => navigate(entry)} entries={ENTRIES} />}
      {route.page === 'single-setup' && <SingleSetupPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'ai-lab' && <AiLabPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'versus-setup' && <VersusSetupPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'levels' && <LevelsPage onExit={() => navigate('home')} onPlay={playLevel} />}
      {route.page === 'editor' && <MapEditorPage onExit={() => navigate('home')} onLaunch={launchGame} />}
      {route.page === 'achievements' && <AchievementsPage onExit={() => navigate('home')} />}
      {route.page === 'stats' && <StatsPage onExit={() => navigate('home')} />}
      {route.page === 'settings' && <SettingsPage onExit={() => navigate('home')} onThemeChange={setTheme} />}
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
