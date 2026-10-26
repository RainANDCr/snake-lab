import { useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, Trash2 } from 'lucide-react'
import { Difficulty } from '../game/core/types'
import { highScoreKey, storage } from '../services/storage'
import { ConfirmModal } from '../components/Modal'

const MODE_LABELS: Record<string, string> = {
  classic: '经典模式',
  endless: '无尽穿墙',
  speed: '极速模式',
}
const DIFF_LABELS: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' }
const RESULT_LABELS: Record<string, string> = {
  classic: '经典',
  endless: '无尽',
  speed: '极速',
  level: '关卡',
  versus: '对战',
  'versus-timed': '限时赛',
  'versus-ai': '人机',
  custom: '自定义',
}

export function StatsPage({ onExit }: { onExit: () => void }) {
  const [stats, setStats] = useState(() => storage.loadStats())
  const [confirmClear, setConfirmClear] = useState(false)

  const highScoreRows = useMemo(() => {
    const rows: { mode: string; difficulty: Difficulty; score: number }[] = []
    for (const mode of ['classic', 'endless', 'speed']) {
      for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
        rows.push({ mode, difficulty, score: stats.highScores[highScoreKey(mode, difficulty)] ?? 0 })
      }
    }
    return rows
  }, [stats])

  const clearHistory = (): void => {
    const next = { ...stats, recent: [], highScores: {}, versus: { wins: 0, draws: 0, losses: 0 } }
    storage.saveStats(next)
    setStats(next)
    setConfirmClear(false)
  }

  const totalTimeMin = Math.floor(stats.playTimeMs / 60000)

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <BarChart3 size={20} /> 游戏统计
        </h2>
      </header>

      <div className="stats-cards">
        <div className="stat-card">
          <span>总游玩局数</span>
          <b>{stats.totalGames}</b>
        </div>
        <div className="stat-card">
          <span>累计食物</span>
          <b>{stats.totalFood}</b>
        </div>
        <div className="stat-card">
          <span>累计得分</span>
          <b>{stats.totalScore}</b>
        </div>
        <div className="stat-card">
          <span>游玩时长</span>
          <b>{totalTimeMin} 分钟</b>
        </div>
        <div className="stat-card">
          <span>对战战绩</span>
          <b>
            <span className="win-text">{stats.versus.wins}胜</span> / {stats.versus.draws}平 / <span className="lose-text">{stats.versus.losses}负</span>
          </b>
        </div>
      </div>

      <section className="setup-section">
        <h3>单人模式最高分（仅人工操作）</h3>
        <table className="stat-table">
          <thead>
            <tr>
              <th>模式</th>
              <th>简单</th>
              <th>普通</th>
              <th>困难</th>
            </tr>
          </thead>
          <tbody>
            {['classic', 'endless', 'speed'].map((mode) => (
              <tr key={mode}>
                <td>{MODE_LABELS[mode]}</td>
                {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                  <td key={d}>{highScoreRows.find((r) => r.mode === mode && r.difficulty === d)?.score ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="panel-note">AI 实验室与人机对战的分数不计入人工最高分。</p>
      </section>

      <section className="setup-section">
        <h3>最近 10 局</h3>
        {stats.recent.length === 0 ? (
          <p className="panel-note">还没有任何记录，去玩一局吧！</p>
        ) : (
          <table className="stat-table">
            <thead>
              <tr>
                <th>模式</th>
                <th>分数</th>
                <th>食物</th>
                <th>时长</th>
                <th>结果</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r, i) => (
                <tr key={i}>
                  <td>{RESULT_LABELS[r.mode] ?? r.mode}</td>
                  <td>{r.score}</td>
                  <td>{r.foodEaten}</td>
                  <td>{Math.floor(r.durationMs / 1000)}s</td>
                  <td>{r.draw ? '平局' : r.won ? '胜' : r.versusResult === 'loss' ? '负' : '败'}</td>
                  <td>{new Date(r.at ?? Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="setup-footer">
        <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
          <Trash2 size={15} /> 清除统计数据
        </button>
      </div>

      <ConfirmModal
        open={confirmClear}
        title="清除统计数据"
        message="将清除最高分、最近记录与对战战绩，此操作不可恢复。确定继续吗？"
        confirmLabel="清除"
        danger
        onConfirm={clearHistory}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
