import { useMemo, useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
import { Difficulty, GameMode, MatchConfig } from '../game/core/types'
import { buildSingleConfig } from '../game/modes/configs'
import { MapData } from '../game/maps/validation'
import { buildPreset, clonePreset, PRESET_MAPS } from '../game/maps/presets'
import { storage } from '../services/storage'
import { audio } from '../services/audio'
import { BoardPreview } from '../components/BoardPreview'
import { GameScreenOptions } from '../components/GameScreen'

const MODES: { value: GameMode; label: string; desc: string }[] = [
  { value: 'classic', label: '经典模式', desc: '撞墙或撞自己即结束' },
  { value: 'endless', label: '无尽穿墙', desc: '边界首尾相接，穿墙而行' },
  { value: 'speed', label: '极速模式', desc: '随得分逐步提速' },
]

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: '简单' },
  { value: 'normal', label: '普通' },
  { value: 'hard', label: '困难' },
]

export function SingleSetupPage({ onExit, onLaunch }: { onExit: () => void; onLaunch: (config: MatchConfig, options: GameScreenOptions) => void }) {
  const [mode, setMode] = useState<Extract<GameMode, 'classic' | 'endless' | 'speed'>>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [mapKey, setMapKey] = useState<string>('default')

  // 无尽穿墙模式不提供默认空场地，须选择预设或自定义地图
  const changeMode = (next: Extract<GameMode, 'classic' | 'endless' | 'speed'>): void => {
    setMode(next)
    if (next === 'endless' && mapKey === 'default') setMapKey('preset:empty')
  }

  const userMaps = useMemo(() => storage.loadMaps(), [mapKey])
  const selectedMap: MapData | null = useMemo(() => {
    if (mapKey === 'default') return null
    if (mapKey.startsWith('preset:')) return buildPreset(mapKey.slice(7))
    return userMaps.find((m) => m.id === mapKey) ?? null
  }, [mapKey, userMaps])

  const bestScore = useMemo(() => {
    const stats = storage.loadStats()
    return stats.highScores[`${mode}:${difficulty}`] ?? 0
  }, [mode, difficulty, mapKey])

  const start = (): void => {
    audio.unlock()
    audio.click()
    // 使用预设直接游玩；自定义地图以副本形式引用原始数据
    const map = selectedMap ? (selectedMap.readonly ? clonePreset(selectedMap) : selectedMap) : null
    const config = buildSingleConfig({ mode, difficulty, map })
    if (selectedMap?.readonly) config.meta = { ...config.meta, mapId: undefined, mapName: selectedMap.name }
    onLaunch(config, { kind: 'single', onExit })
  }

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>开始游戏</h2>
      </header>

      <section className="setup-section">
        <h3>选择模式</h3>
        <div className="option-cards">
          {MODES.map((m) => (
            <button key={m.value} className={`option-card ${mode === m.value ? 'option-active' : ''}`} onClick={() => changeMode(m.value as Extract<GameMode, 'classic' | 'endless' | 'speed'>)}>
              <b>{m.label}</b>
              <span>{m.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>难度</h3>
        <div className="chip-group">
          {DIFFICULTIES.map((d) => (
            <button key={d.value} className={`chip ${difficulty === d.value ? 'chip-active' : ''}`} onClick={() => setDifficulty(d.value)}>
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>场地</h3>
        <div className="map-picker">
          {mode !== 'endless' && (
            <label className={`map-item ${mapKey === 'default' ? 'map-active' : ''}`}>
              <input type="radio" name="map" checked={mapKey === 'default'} onChange={() => setMapKey('default')} />
              <BoardPreview map={{ width: 24, height: 24, walls: [], spawns: {} }} />
              <span>默认场地</span>
            </label>
          )}
          {PRESET_MAPS.map((p) => {
            const map = buildPreset(p.key)!
            return (
              <label key={p.key} className={`map-item ${mapKey === `preset:${p.key}` ? 'map-active' : ''}`}>
                <input type="radio" name="map" checked={mapKey === `preset:${p.key}`} onChange={() => setMapKey(`preset:${p.key}`)} />
                <BoardPreview map={map} />
                <span>{map.name}</span>
              </label>
            )
          })}
          {userMaps.map((m) => (
            <label key={m.id} className={`map-item ${mapKey === m.id ? 'map-active' : ''}`}>
              <input type="radio" name="map" checked={mapKey === m.id} onChange={() => setMapKey(m.id)} />
              <BoardPreview map={m} />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
        {userMaps.length === 0 && <p className="panel-note">提示：在地图编辑器创建的自定义地图会出现在这里。</p>}
      </section>

      <div className="setup-footer">
        <div className="best-score">当前模式最高分：<b>{bestScore}</b></div>
        <button className="btn btn-primary btn-lg" onClick={start}>
          <Play size={18} /> 开始游戏
        </button>
      </div>
    </div>
  )
}
