import { useMemo, useState } from 'react'
import { ArrowLeft, FlaskConical, Play } from 'lucide-react'
import { Difficulty, MatchConfig } from '../game/core/types'
import { buildAiLabConfig } from '../game/modes/configs'
import { buildPreset, clonePreset, PRESET_MAPS } from '../game/maps/presets'
import { MapData } from '../game/maps/validation'
import { storage } from '../services/storage'
import { audio } from '../services/audio'
import { BoardPreview } from '../components/BoardPreview'
import { GameScreenOptions } from '../components/GameScreen'

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: '慢速' },
  { value: 'normal', label: '常速' },
  { value: 'hard', label: '快速' },
]

export function AiLabPage({ onExit, onLaunch }: { onExit: () => void; onLaunch: (config: MatchConfig, options: GameScreenOptions) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [mapKey, setMapKey] = useState<string>('default')

  const userMaps = useMemo(() => storage.loadMaps(), [mapKey])
  const selectedMap: MapData | null = useMemo(() => {
    if (mapKey === 'default') return null
    if (mapKey.startsWith('preset:')) return buildPreset(mapKey.slice(7))
    return userMaps.find((m) => m.id === mapKey) ?? null
  }, [mapKey, userMaps])

  const start = (): void => {
    audio.unlock()
    audio.click()
    const map = selectedMap ? (selectedMap.readonly ? clonePreset(selectedMap) : selectedMap) : null
    // AI 实验室开局默认安全策略，进入游戏后可随时切换算法
    const config = buildAiLabConfig({ algorithm: 'safe', difficulty, map })
    onLaunch(config, { kind: 'ai-lab', onExit })
  }

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <FlaskConical size={20} /> AI 算法实验室
        </h2>
      </header>

      <section className="setup-section">
        <h3>关于本实验</h3>
        <p className="panel-note">
          观察 BFS（宽度优先逐层扩散）、A*（Manhattan 启发式聚焦）与安全策略（未来空间模拟 + 追尾保命）
          在同一棋盘上的搜索行为。可视化图层展示已探索格、开放集与规划路径；侧栏提供真实测得的搜索统计，
          并支持 BFS vs A* 同局面对比。明确说明：动态蛇身环境下算法需按 tick 重规划，<b>不保证永不死亡</b>。
        </p>
      </section>

      <section className="setup-section">
        <h3>运行速度</h3>
        <div className="chip-group">
          {DIFFICULTIES.map((d) => (
            <button key={d.value} className={`chip ${difficulty === d.value ? 'chip-active' : ''}`} onClick={() => setDifficulty(d.value)}>
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>实验场地</h3>
        <div className="map-picker">
          <label className={`map-item ${mapKey === 'default' ? 'map-active' : ''}`}>
            <input type="radio" name="labmap" checked={mapKey === 'default'} onChange={() => setMapKey('default')} />
            <BoardPreview map={{ width: 24, height: 24, walls: [], spawns: {} }} />
            <span>空旷场地</span>
          </label>
          {PRESET_MAPS.map((p) => {
            const map = buildPreset(p.key)!
            return (
              <label key={p.key} className={`map-item ${mapKey === `preset:${p.key}` ? 'map-active' : ''}`}>
                <input type="radio" name="labmap" checked={mapKey === `preset:${p.key}`} onChange={() => setMapKey(`preset:${p.key}`)} />
                <BoardPreview map={map} />
                <span>{map.name}</span>
              </label>
            )
          })}
          {userMaps.map((m) => (
            <label key={m.id} className={`map-item ${mapKey === m.id ? 'map-active' : ''}`}>
              <input type="radio" name="labmap" checked={mapKey === m.id} onChange={() => setMapKey(m.id)} />
              <BoardPreview map={m} />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="setup-footer">
        <button className="btn btn-primary btn-lg" onClick={start}>
          <Play size={18} /> 进入实验室
        </button>
      </div>
    </div>
  )
}
