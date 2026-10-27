import { useMemo, useState } from 'react'
import { ArrowLeft, Crown, Play } from 'lucide-react'
import { TOURNAMENT_RULES, buildTournamentConfig } from '../game/modes/configs'
import { buildPreset, PRESET_MAPS } from '../game/maps/presets'
import { Difficulty } from '../game/core/types'
import { BoardPreview } from '../components/BoardPreview'
import { audio } from '../services/audio'
import { GameScreenOptions } from '../components/GameScreen'

export function TournamentPage({
  onExit,
  onLaunch,
}: {
  onExit: () => void
  onLaunch: (config: import('../game/core/types').MatchConfig, options: GameScreenOptions) => void
}) {
  const [rule, setRule] = useState<'last-standing' | 'timed'>('last-standing')
  const [duration, setDuration] = useState(90)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [mapKey, setMapKey] = useState('default')

  const selectedMap = useMemo(() => {
    if (mapKey === 'default') return null
    return buildPreset(mapKey.slice('preset:'.length))
  }, [mapKey])

  const start = (): void => {
    audio.unlock()
    audio.click()
    const config = buildTournamentConfig({ rule, durationSec: duration, difficulty, map: selectedMap })
    onLaunch(config, { kind: 'tournament', onExit })
  }

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <Crown size={20} /> AI 锦标赛
        </h2>
      </header>

      <section className="setup-section">
        <h3>赛事说明</h3>
        <p className="panel-note">
          BFS、A*、安全策略三条 AI 蛇同场竞技。它们互为动态威胁，互相把对方视为障碍，
          遵守与人类玩家完全相同的碰撞规则。你负责解说——看看哪种算法能活到最后、谁吃得最多。
          观赛不计入个人统计与成就。
        </p>
      </section>

      <section className="setup-section">
        <h3>赛制</h3>
        <div className="option-cards">
          <button className={`option-card ${rule === 'last-standing' ? 'option-active' : ''}`} onClick={() => setRule('last-standing')}>
            <b>最后幸存</b>
            <span>活到最后者夺冠，同时死亡按得分判定</span>
          </button>
          <button className={`option-card ${rule === 'timed' ? 'option-active' : ''}`} onClick={() => setRule('timed')}>
            <b>限时积分赛</b>
            <span>时间到按得分排名</span>
          </button>
        </div>
        {rule === 'timed' && (
          <div className="chip-group">
            {[60, 90, 180].map((d) => (
              <button key={d} className={`chip ${duration === d ? 'chip-active' : ''}`} onClick={() => setDuration(d)}>
                {d} 秒
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="setup-section">
        <h3>比赛速度</h3>
        <div className="chip-group">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <button key={d} className={`chip ${difficulty === d ? 'chip-active' : ''}`} onClick={() => setDifficulty(d)}>
              {d === 'easy' ? '慢速' : d === 'normal' ? '常速' : '快速'}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>比赛场地</h3>
        <div className="map-picker">
          <label className={`map-item ${mapKey === 'default' ? 'map-active' : ''}`}>
            <input type="radio" name="tmap" checked={mapKey === 'default'} onChange={() => setMapKey('default')} />
            <BoardPreview map={{ width: 24, height: 24, walls: [], spawns: {} }} />
            <span>空旷场地</span>
          </label>
          {PRESET_MAPS.filter((p) => p.key !== 'empty').map((p) => {
            const map = buildPreset(p.key)!
            return (
              <label key={p.key} className={`map-item ${mapKey === `preset:${p.key}` ? 'map-active' : ''}`}>
                <input type="radio" name="tmap" checked={mapKey === `preset:${p.key}`} onChange={() => setMapKey(`preset:${p.key}`)} />
                <BoardPreview map={map} />
                <span>{map.name}</span>
              </label>
            )
          })}
        </div>
      </section>

      <div className="setup-footer">
        <div className="best-score">参赛选手：BFS · A* · 安全策略</div>
        <button className="btn btn-primary btn-lg" onClick={start}>
          <Play size={18} /> 开始观赛
        </button>
      </div>
    </div>
  )
}
