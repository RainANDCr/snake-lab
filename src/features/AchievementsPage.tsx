import { useMemo, useState } from 'react'
import { ArrowLeft, Award } from 'lucide-react'
import { ACHIEVEMENTS, AchievementCategory, CATEGORY_LABELS } from '../game/achievements/definitions'
import { storage } from '../services/storage'

const CATEGORIES: (AchievementCategory | 'all')[] = ['all', 'growth', 'score', 'versus', 'ai', 'create', 'level']

export function AchievementsPage({ onExit }: { onExit: () => void }) {
  const state = useMemo(() => storage.loadAchievements(), [])
  const [filter, setFilter] = useState<AchievementCategory | 'all'>('all')

  const unlockedCount = ACHIEVEMENTS.filter((a) => state.unlocked[a.id] != null).length
  const percent = Math.round((unlockedCount / ACHIEVEMENTS.length) * 100)
  const visible = filter === 'all' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.category === filter)

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <Award size={20} /> 成就中心
        </h2>
      </header>

      <div className="ach-summary">
        <div className="ach-ring" role="img" aria-label={`已完成 ${percent}%`}>
          <svg viewBox="0 0 80 80" width="84" height="84">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeDasharray={`${(percent / 100) * 2 * Math.PI * 34} 999`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
          </svg>
          <b>{percent}%</b>
        </div>
        <div className="ach-summary-text">
          <b>
            {unlockedCount} / {ACHIEVEMENTS.length}
          </b>
          <span>已解锁成就</span>
        </div>
      </div>

      <div className="chip-group ach-filter">
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${filter === c ? 'chip-active' : ''}`} onClick={() => setFilter(c)}>
            {c === 'all' ? '全部' : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="ach-grid">
        {visible.map((def) => {
          const unlockedAt = state.unlocked[def.id]
          const progress = Math.min(def.progress(state.counters), def.target)
          const pct = Math.floor((progress / def.target) * 100)
          return (
            <div key={def.id} className={`ach-card ${unlockedAt ? 'ach-unlocked' : 'ach-locked'}`}>
              <div className="ach-icon" aria-hidden="true">
                {def.icon}
              </div>
              <div className="ach-body">
                <div className="ach-title">
                  <b>{def.name}</b>
                  {unlockedAt && <span className="ach-time">{new Date(unlockedAt).toLocaleDateString()}</span>}
                </div>
                <div className="ach-desc">{def.description}</div>
                {unlockedAt ? (
                  <div className="ach-progress ach-done">已解锁 ✓</div>
                ) : (
                  <div className="ach-progress">
                    <div className="goal-track">
                      <div className="goal-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span>
                      {progress} / {def.target}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
