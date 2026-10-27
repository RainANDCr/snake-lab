import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Play } from 'lucide-react'
import { DAILY_DURATION_SEC, buildDailyConfig } from '../game/modes/configs'
import { BoardPreview } from '../components/BoardPreview'
import { storage } from '../services/storage'
import { audio } from '../services/audio'

export function todayKey(): string {
  return new Date().toLocaleDateString('sv')
}

function nextMidnightMs(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function DailyPage({ onExit, onPlay }: { onExit: () => void; onPlay: () => void }) {
  const key = todayKey()
  const daily = useMemo(() => storage.loadDaily(), [key])
  const config = useMemo(() => buildDailyConfig(key), [key])
  const [countdown, setCountdown] = useState(nextMidnightMs())

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(nextMidnightMs()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const today = daily.days[key]
  const recentDays = useMemo(() => {
    const out: { key: string; score: number }[] = []
    for (let i = 0; i < 7; i++) {
      const k = dateKeyOffset(-i)
      out.push({ key: k, score: daily.days[k]?.score ?? -1 })
    }
    return out
  }, [daily])

  const start = (): void => {
    audio.unlock()
    audio.click()
    onPlay()
  }

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <CalendarDays size={20} /> 每日挑战
        </h2>
      </header>

      <section className="setup-section">
        <h3>今天的挑战 · {key}</h3>
        <p className="panel-note">
          每天一道全新谜题：<b>{config.meta?.mapName}</b> 场地、
          {config.difficulty === 'easy' ? '简单' : config.difficulty === 'hard' ? '困难' : '普通'}速度、
          {DAILY_DURATION_SEC} 秒限时积分赛、特殊食物开启。
          地图、出生点与食物序列由日期种子决定——所有玩家面对完全相同的局面，比拼谁拿分更高。
        </p>
        <div className="daily-card">
          <div className="daily-preview">
            <BoardPreview map={{ width: config.width, height: config.height, walls: config.walls, spawns: { single: config.snakes[0].spawn } }} />
          </div>
          <div className="daily-info">
            <div className="daily-stats">
              <div className="stat-card">
                <span>今日最佳</span>
                <b>{today?.score ?? '未挑战'}</b>
              </div>
              <div className="stat-card">
                <span>连续天数</span>
                <b>{daily.streak} 天</b>
              </div>
              <div className="stat-card">
                <span>距下期</span>
                <b className="tabular">{formatCountdown(countdown)}</b>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={start}>
              <Play size={18} /> {today ? '再来一次（成绩取最高）' : '开始今日挑战'}
            </button>
          </div>
        </div>
      </section>

      <section className="setup-section">
        <h3>最近 7 天</h3>
        <div className="daily-week">
          {recentDays.map((d, i) => (
            <div key={d.key} className={`daily-day ${i === 0 ? 'daily-today' : ''}`}>
              <span className="daily-date">{d.key.slice(5)}</span>
              <b>{d.score < 0 ? '—' : d.score}</b>
            </div>
          ))}
        </div>
        <p className="panel-note">连续每天完成挑战可以累积连续天数；中断后重新从 1 天开始。</p>
      </section>
    </div>
  )
}

function dateKeyOffset(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('sv')
}
