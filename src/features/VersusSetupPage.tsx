import { useMemo, useState } from 'react'
import { ArrowLeft, Play, Swords } from 'lucide-react'
import { Difficulty, MatchConfig } from '../game/core/types'
import { buildVersusConfig, mapPlayable } from '../game/modes/configs'
import { buildPreset, clonePreset, PRESET_MAPS } from '../game/maps/presets'
import { MapData } from '../game/maps/validation'
import { audio } from '../services/audio'
import { storage } from '../services/storage'
import { BoardPreview } from '../components/BoardPreview'
import { GameScreenOptions } from '../components/GameScreen'

type VersusKind = 'classic' | 'timed' | 'ai'

const KINDS: { value: VersusKind; label: string; desc: string }[] = [
  { value: 'classic', label: '经典竞技', desc: '活到最后者获胜' },
  { value: 'timed', label: '限时积分赛', desc: '到时按得分判定' },
  { value: 'ai', label: '人机对战', desc: '对手由 AI 控制' },
]

const DURATIONS = [60, 120, 180]

const AI_LEVELS: { value: 'bfs' | 'astar' | 'safe' | 'perfect'; label: string }[] = [
  { value: 'bfs', label: 'AI·BFS（基础）' },
  { value: 'astar', label: 'AI·A*（进阶）' },
  { value: 'safe', label: 'AI·安全策略（困难）' },
  { value: 'perfect', label: 'AI·完美（地狱）' },
]

export function VersusSetupPage({ onExit, onLaunch }: { onExit: () => void; onLaunch: (config: MatchConfig, options: GameScreenOptions) => void }) {
  const [kind, setKind] = useState<VersusKind>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [duration, setDuration] = useState(120)
  const [powerups, setPowerups] = useState(false)
  const [aiAlgorithm, setAiAlgorithm] = useState<'bfs' | 'astar' | 'safe' | 'perfect'>('safe')
  const [mapKey, setMapKey] = useState<string>('default')
  const [mapError, setMapError] = useState<string | null>(null)

  const userMaps = useMemo(() => storage.loadMaps(), [mapKey])
  const selectedMap: MapData | null = useMemo(() => {
    if (mapKey === 'default') return null
    if (mapKey.startsWith('preset:')) return buildPreset(mapKey.slice(7))
    return userMaps.find((m) => m.id === mapKey) ?? null
  }, [mapKey, userMaps])

  const versusStats = useMemo(() => storage.loadStats().versus, [])

  const selectMap = (key: string): void => {
    setMapKey(key)
    setMapError(null)
    if (key !== 'default') {
      const map = key.startsWith('preset:') ? buildPreset(key.slice(7)) : userMaps.find((m) => m.id === key)
      if (map) {
        const check = mapPlayable(map, true)
        if (!check.ok) setMapError(check.error ?? '该地图不适合双人模式')
      }
    }
  }

  const start = (): void => {
    audio.unlock()
    audio.click()
    if (mapError) return
    const map = selectedMap ? (selectedMap.readonly ? clonePreset(selectedMap) : selectedMap) : null
    const config = buildVersusConfig({ kind, difficulty, durationSec: duration, powerups, map, aiAlgorithm: kind === 'ai' ? aiAlgorithm : undefined })
    if (selectedMap?.readonly) config.meta = { ...config.meta, mapId: undefined, mapName: selectedMap.name }
    onLaunch(config, { kind: 'versus', onExit })
  }

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <Swords size={20} /> 双人对战
        </h2>
      </header>

      <section className="setup-section">
        <h3>对战模式</h3>
        <div className="option-cards">
          {KINDS.map((k) => (
            <button key={k.value} className={`option-card ${kind === k.value ? 'option-active' : ''}`} onClick={() => setKind(k.value)}>
              <b>{k.label}</b>
              <span>{k.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {kind === 'timed' && (
        <section className="setup-section">
          <h3>限时</h3>
          <div className="chip-group">
            {DURATIONS.map((d) => (
              <button key={d} className={`chip ${duration === d ? 'chip-active' : ''}`} onClick={() => setDuration(d)}>
                {d} 秒
              </button>
            ))}
          </div>
        </section>
      )}

      {kind === 'ai' && (
        <section className="setup-section">
          <h3>AI 难度</h3>
          <div className="chip-group">
            {AI_LEVELS.map((a) => (
              <button key={a.value} className={`chip ${aiAlgorithm === a.value ? 'chip-active' : ''}`} onClick={() => setAiAlgorithm(a.value)}>
                {a.label}
              </button>
            ))}
          </div>
          <p className="panel-note">AI 与你遵守完全相同的碰撞与移动规则，且把你的蛇身视为动态威胁。</p>
        </section>
      )}

      <section className="setup-section">
        <h3>速度</h3>
        <div className="chip-group">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <button key={d} className={`chip ${difficulty === d ? 'chip-active' : ''}`} onClick={() => setDifficulty(d)}>
              {d === 'easy' ? '简单' : d === 'normal' ? '普通' : '困难'}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>道具竞技（可选）</h3>
        <button className={`chip ${powerups ? 'chip-active' : ''}`} onClick={() => setPowerups((v) => !v)}>
          {powerups ? '✓ 已开启道具' : '开启道具（加速/减速/双倍/护盾）'}
        </button>
      </section>

      <section className="setup-section">
        <h3>对战场地</h3>
        <div className="map-picker">
          <label className={`map-item ${mapKey === 'default' ? 'map-active' : ''}`}>
            <input type="radio" name="vsmap" checked={mapKey === 'default'} onChange={() => selectMap('default')} />
            <BoardPreview map={{ width: 24, height: 24, walls: [], spawns: {} }} />
            <span>默认场地</span>
          </label>
          {PRESET_MAPS.map((p) => {
            const map = buildPreset(p.key)!
            return (
              <label key={p.key} className={`map-item ${mapKey === `preset:${p.key}` ? 'map-active' : ''}`}>
                <input type="radio" name="vsmap" checked={mapKey === `preset:${p.key}`} onChange={() => selectMap(`preset:${p.key}`)} />
                <BoardPreview map={map} />
                <span>{map.name}</span>
              </label>
            )
          })}
          {userMaps.map((m) => (
            <label key={m.id} className={`map-item ${mapKey === m.id ? 'map-active' : ''}`}>
              <input type="radio" name="vsmap" checked={mapKey === m.id} onChange={() => selectMap(m.id)} />
              <BoardPreview map={m} />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
        {mapError && <p className="error-text">⚠ {mapError}</p>}
      </section>

      <div className="setup-footer">
        <div className="best-score">
          历史战绩：<b className="win-text">{versusStats.wins}胜</b> / {versusStats.draws}平 / <b className="lose-text">{versusStats.losses}负</b>
        </div>
        <button className="btn btn-primary btn-lg" onClick={start} disabled={!!mapError}>
          <Play size={18} /> 开始对战
        </button>
      </div>
      <p className="panel-note center">推荐键盘双人（玩家一 WASD · 玩家二方向键）；移动端为玩家一提供虚拟方向键。</p>
    </div>
  )
}
