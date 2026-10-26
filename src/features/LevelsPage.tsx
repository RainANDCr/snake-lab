import { useMemo, useState } from 'react'
import { ArrowLeft, Lock, Pencil, Star, Trash2 } from 'lucide-react'
import { CHAPTERS, LEVELS, levelGoalText } from '../game/levels/levels'
import { buildCustomConfig } from '../game/modes/configs'
import { MatchConfig } from '../game/core/types'
import { CustomLevelDef, storage } from '../services/storage'
import { audio } from '../services/audio'
import { BoardPreview } from '../components/BoardPreview'
import { ConfirmModal } from '../components/Modal'
import { GameScreenOptions } from '../components/GameScreen'

interface LevelsPageProps {
  onExit: () => void
  onPlay: (levelId: number, difficulty?: 'easy' | 'normal' | 'hard') => void
  onLaunchCustom?: (config: MatchConfig, options: GameScreenOptions) => void
}

function Stars({ count, size = 14 }: { count: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }}>
      {[1, 2, 3].map((i) => (
        <Star key={i} size={size} className={i <= count ? 'star-on' : 'star-off'} />
      ))}
    </span>
  )
}

export function LevelsPage({ onExit, onPlay, onLaunchCustom }: LevelsPageProps) {
  const [tab, setTab] = useState<'official' | 'custom'>('official')
  const [progress, setProgress] = useState(() => storage.loadLevelProgress())
  const [customLevels, setCustomLevels] = useState(() => storage.loadCustomLevels())
  const [deleteTarget, setDeleteTarget] = useState<CustomLevelDef | null>(null)

  const refresh = (): void => {
    setProgress(storage.loadLevelProgress())
    setCustomLevels(storage.loadCustomLevels())
  }

  const totalStars = useMemo(() => Object.values(progress.best).reduce((sum, b) => sum + b.stars, 0), [progress])
  const completedCount = useMemo(() => Object.values(progress.best).filter((b) => b.stars > 0).length, [progress])

  const playCustom = (level: CustomLevelDef): void => {
    const map = storage.loadMaps().find((m) => m.id === level.mapId)
    if (!map) return
    audio.unlock()
    audio.click()
    const config = buildCustomConfig(map, 'normal', { score: level.goalScore, timeLimitSec: level.timeLimitSec })
    config.tickMs = level.tickMs
    if (onLaunchCustom) onLaunchCustom(config, { kind: 'custom', onExit: () => onExit() })
  }

  const deleteCustom = (): void => {
    if (!deleteTarget) return
    storage.saveCustomLevels(customLevels.filter((l) => l.id !== deleteTarget.id))
    setDeleteTarget(null)
    refresh()
  }

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>关卡挑战</h2>
      </header>

      <div className="chip-group">
        <button className={`chip ${tab === 'official' ? 'chip-active' : ''}`} onClick={() => setTab('official')}>
          官方关卡
        </button>
        <button className={`chip ${tab === 'custom' ? 'chip-active' : ''}`} onClick={() => { refresh(); setTab('custom') }}>
          自定义关卡
        </button>
      </div>

      {tab === 'official' && (
        <>
          <div className="level-progress-card">
            <span>
              通关 <b>{completedCount}</b> / {LEVELS.length} 关
            </span>
            <span>
              已获 <b>{totalStars}</b> / {LEVELS.length * 3} 星
            </span>
          </div>
          {CHAPTERS.map((chapter) => (
            <section key={chapter.id} className="setup-section">
              <h3>
                {chapter.name} <small className="chapter-desc">{chapter.description}</small>
              </h3>
              <div className="level-grid">
                {LEVELS.filter((l) => l.chapter === chapter.id).map((level) => {
                  const best = progress.best[level.id]
                  const locked = level.id > progress.unlocked
                  return (
                    <button
                      key={level.id}
                      className={`level-card ${locked ? 'level-locked' : ''}`}
                      disabled={locked}
                      onClick={() => {
                        audio.unlock()
                        audio.click()
                        onPlay(level.id)
                      }}
                    >
                      <div className="level-preview">
                        <BoardPreview map={{ width: level.width, height: level.height, walls: level.walls, spawns: { single: level.spawn } }} />
                        {locked && (
                          <span className="level-lock">
                            <Lock size={18} />
                          </span>
                        )}
                      </div>
                      <div className="level-info">
                        <div className="level-name">
                          {level.id}. {level.name}
                        </div>
                        <div className="level-desc">{level.description}</div>
                        <div className="level-meta">
                          <Stars count={best?.stars ?? 0} />
                          {best && <span className="level-best">最佳 {best.score}</span>}
                        </div>
                        <div className="level-goal">{levelGoalText(level)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          <p className="panel-note">完成一关解锁下一关；历史星级与最佳分数只升不降。允许随时重玩。</p>
        </>
      )}

      {tab === 'custom' && (
        <>
          {customLevels.length === 0 ? (
            <p className="panel-note">
              还没有自定义关卡。前往「地图编辑器」，基于自定义地图设置分数目标、时间限制和速度即可创建。
              自定义关卡进度与官方关卡相互独立。
            </p>
          ) : (
            <div className="level-grid">
              {customLevels.map((level) => {
                const map = storage.loadMaps().find((m) => m.id === level.mapId)
                return (
                  <div key={level.id} className="level-card level-card-static">
                    <div className="level-preview">
                      {map ? (
                        <BoardPreview map={map} />
                      ) : (
                        <div className="level-missing">地图已删除</div>
                      )}
                    </div>
                    <div className="level-info">
                      <div className="level-name">{level.name}</div>
                      <div className="level-desc">
                        目标 {level.goalScore} 分{level.timeLimitSec ? ` · 限时 ${level.timeLimitSec}s` : ''} · 速度 {level.tickMs}ms
                      </div>
                      <div className="level-actions">
                        <button className="btn btn-secondary" disabled={!map} onClick={() => playCustom(level)}>
                          <Pencil size={14} /> 开始
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => setDeleteTarget(level)} aria-label="删除">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={deleteTarget != null}
        title="删除自定义关卡"
        message={`确定删除「${deleteTarget?.name ?? ''}」吗？此操作不可恢复。`}
        confirmLabel="删除"
        danger
        onConfirm={deleteCustom}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
