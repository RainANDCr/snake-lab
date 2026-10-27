import { useMemo, useState } from 'react'
import { ArrowLeft, Flame, Play, SkipForward } from 'lucide-react'
import { CAMPAIGN_BUFFS, buildCampaignStageConfig } from '../game/modes/configs'
import { storage } from '../services/storage'
import { audio } from '../services/audio'

export interface CampaignRun {
  stage: number
  buffs: string[]
  totalScore: number
}

export function CampaignPage({
  onExit,
  onStartRun,
  run,
  offers,
  onPickBuff,
  onSkipBuff,
  onAbandon,
}: {
  onExit: () => void
  /** 开始一场全新战役（由 App 构建第一关配置并进入游戏） */
  onStartRun: () => void
  /** 非空时进入「选择增益」界面 */
  run?: CampaignRun | null
  offers?: string[]
  onPickBuff?: (buffId: string) => void
  onSkipBuff?: () => void
  /** 放弃当前战役回到开始页 */
  onAbandon?: () => void
}) {
  const rogue = useMemo(() => storage.loadRogue(), [run?.stage, run?.totalScore])
  const buffMode = run != null && offers != null

  const startRun = (): void => {
    audio.unlock()
    audio.click()
    onStartRun()
  }

  /* ---------- 增益选择界面 ---------- */
  if (buffMode) {
    const nextStage = run!.stage
    const preview = buildCampaignStageConfig(nextStage, run!.buffs)
    return (
      <div className="page setup-page">
        <header className="page-header">
          <button className="btn btn-ghost btn-icon" onClick={() => onAbandon?.()} aria-label="放弃">
            <ArrowLeft size={18} />
          </button>
          <h2>
            <Flame size={20} /> 第 {nextStage} 关 · 选择增益
          </h2>
        </header>

        <div className="rogue-run-bar">
          <span>
            已通关 <b>{nextStage - 1}</b> 关
          </span>
          <span>
            战役累计 <b>{run!.totalScore}</b> 分
          </span>
          <span>
            下一关：<b>{preview.meta?.label?.replace(/^战役 第 \d+ 关 · /, '')}</b>
          </span>
        </div>

        {run!.buffs.length > 0 && (
          <section className="setup-section">
            <h3>已持有增益</h3>
            <div className="chip-group">
              {run!.buffs.map((id, i) => {
                const b = CAMPAIGN_BUFFS.find((x) => x.id === id)
                return (
                  <span key={`${id}-${i}`} className="chip chip-active">
                    {b?.icon} {b?.name}
                  </span>
                )
              })}
            </div>
          </section>
        )}

        <section className="setup-section">
          <h3>选择一项增益（三选一）</h3>
          <div className="buff-cards">
            {offers!.map((id) => {
              const b = CAMPAIGN_BUFFS.find((x) => x.id === id)
              if (!b) return null
              const owned = b.stackable && run!.buffs.includes(id)
              return (
                <button key={id} className="buff-card" onClick={() => onPickBuff?.(id)}>
                  <span className="buff-icon">{b.icon}</span>
                  <b>
                    {b.name}
                    {owned && <small> ×{run!.buffs.filter((x) => x === id).length + 1}</small>}
                  </b>
                  <span>{b.desc}</span>
                </button>
              )
            })}
          </div>
          <button className="btn btn-ghost" onClick={() => onSkipBuff?.()}>
            <SkipForward size={15} /> 跳过增益，直接进入下一关
          </button>
        </section>
        <p className="panel-note">增益在整个战役中持续生效；中途退出将放弃本次战役。</p>
      </div>
    )
  }

  /* ---------- 开始页 ---------- */
  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <Flame size={20} /> Roguelike 战役
        </h2>
      </header>

      <section className="setup-section">
        <h3>玩法规则</h3>
        <ul className="rules-panel rules-inline">
          <li>以官方 15 关为素材的无尽战役，难度逐关提升（更快、目标更高）</li>
          <li>每通一关，三选一获得一个增益，增益持续到本次战役结束</li>
          <li>只有一条命：死亡即战役终结，结算累计总分与到达关数</li>
          <li>中途退出视为放弃本次战役（不计成绩）</li>
        </ul>
        <p className="panel-note">
          增益池：{CAMPAIGN_BUFFS.map((b) => `${b.icon}${b.name}`).join(' · ')}
        </p>
      </section>

      <div className="stats-cards">
        <div className="stat-card">
          <span>历史最佳总分</span>
          <b>{rogue.bestScore || '—'}</b>
        </div>
        <div className="stat-card">
          <span>最远到达</span>
          <b>第 {rogue.bestStage || '—'} 关</b>
        </div>
        <div className="stat-card">
          <span>战役次数</span>
          <b>{rogue.runs}</b>
        </div>
      </div>

      <div className="setup-footer">
        <div className="best-score">一条命，走多远？</div>
        <button className="btn btn-primary btn-lg" onClick={startRun}>
          <Play size={18} /> 开始战役
        </button>
      </div>
    </div>
  )
}
