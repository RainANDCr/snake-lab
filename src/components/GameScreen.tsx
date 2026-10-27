import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react'
import { AiViz, Algorithm, CompareRow, aiDecide, compareAlgorithms } from '../game/ai/controller'
import { Direction, GameEvent, GameStatus, GameState, MatchConfig, ControllerKind } from '../game/core/types'
import { createInitialState, setDirection, stepGame, transitionStatus } from '../game/core/engine'
import { getLevel, starsForScore } from '../game/levels/levels'
import { VERSUS_RULES } from '../game/modes/configs'
import { audio } from '../services/audio'
import { recordAiUse, recordGameSummary, recordVizDemo } from '../services/records'
import { storage } from '../services/storage'
import { THEME_COLORS, ThemeName } from '../styles/themes'
import { DrawOptions, drawGame } from './draw'
import { GameCanvas } from './GameCanvas'
import { Modal } from './Modal'
import { VirtualDpad } from './VirtualDpad'

export interface GameScreenOptions {
  kind: 'single' | 'ai-lab' | 'versus' | 'level' | 'custom' | 'daily' | 'tournament' | 'campaign'
  onExit: () => void
  onNextLevel?: (clearedId: number) => void
  /** 战役：当前关通关（带本关得分） */
  onNextStage?: (clearedStage: number, stageScore: number) => void
  /** 战役：失败后重新开始整场战役 */
  onRestartCampaign?: () => void
}

interface SnakeHud {
  id: string
  name: string
  color: string
  score: number
  length: number
  alive: boolean
  shield: number
  speedMult: number
  speedTicks: number
  scoreMult: number
  scoreTicks: number
}

interface Hud {
  scores: SnakeHud[]
  elapsedMs: number
  effectiveTickMs: number
  foodEaten: number
}

const RESULT_TEXT: Record<string, string> = {
  died: '本局结束',
  'board-full': '棋盘被完全占满，完美收官！',
  'goal-score': '目标分数达成！',
  'goal-food': '目标食物收集完成！',
  'goal-survive': '成功存活到终点！',
  'last-standing': '最后的幸存者获胜',
  'both-died': '同归于尽，平局',
  'time-up': '时间到',
}

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

function snakeHud(state: GameState): SnakeHud[] {
  return state.snakes.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    score: s.score,
    length: s.body.length,
    alive: s.alive,
    shield: s.shield,
    speedMult: s.speedMult,
    speedTicks: s.speedTicks,
    scoreMult: s.scoreMult,
    scoreTicks: s.scoreTicks,
  }))
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function GameScreen({ config, options }: { config: MatchConfig; options: GameScreenOptions }) {
  // 主题由 App 解析（含跟随系统）后写入 data-theme，这里直接读取最终生效主题
  const themeName = (document.documentElement.dataset.theme as ThemeName | undefined) ?? 'neon'
  const theme = THEME_COLORS[themeName]
  const settings = storage.loadSettings()
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<GameState>(createInitialState(config))
  const statusRef = useRef<GameStatus>('ready')
  const [status, setStatus] = useState<GameStatus>('ready')
  const reportedRef = useRef(false)
  const anyAiRef = useRef(config.snakes.some((s) => s.controller !== 'human'))
  const countdownTimerRef = useRef<number | null>(null)
  const goTimerRef = useRef<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [pausedAuto, setPausedAuto] = useState(false)

  const [hud, setHud] = useState<Hud>(() => ({ scores: snakeHud(stateRef.current), elapsedMs: 0, effectiveTickMs: config.tickMs, foodEaten: 0 }))
  const bestScore = useMemo(() => {
    const stats = storage.loadStats()
    return stats.highScores[`${config.mode}:${config.difficulty ?? 'normal'}`] ?? 0
  }, [config.mode, config.difficulty])

  const isVersus =
    config.mode === 'versus' || config.mode === 'versus-timed' || config.mode === 'versus-ai' || config.mode === 'tournament'
  const isSpectate = config.mode === 'tournament'
  const isCampaign = options.kind === 'campaign'
  const isAiLab = options.kind === 'ai-lab'
  const levelDef = config.meta?.levelId != null ? getLevel(config.meta.levelId) : undefined

  // AI 实验室
  const [controller, setController] = useState<ControllerKind>(config.snakes[0].controller)
  const controllerRef = useRef<ControllerKind>(config.snakes[0].controller)
  const vizRef = useRef<AiViz | null>(null)
  const vizLayersRef = useRef({ explored: true, frontier: true, path: true })
  const [vizLayers, setVizLayers] = useState(vizLayersRef.current)
  const [aiMetrics, setAiMetrics] = useState<{ explored: number; pathLength: number; ms: number; strategy: string; message: string } | null>(null)
  const [speedSlider, setSpeedSlider] = useState(config.tickMs)
  const speedOverrideRef = useRef<number | null>(null)
  const demoTicksRef = useRef(0)
  const demoDoneRef = useRef(false)
  const [compareRows, setCompareRows] = useState<{ rows: CompareRow[]; food: { x: number; y: number } | null } | null>(null)
  const [showRules, setShowRules] = useState(false)

  const applyStatus = useCallback((s: GameStatus) => {
    statusRef.current = s
    setStatus(s)
  }, [])

  const changeStatus = useCallback(
    (s: GameStatus) => {
      stateRef.current = transitionStatus(stateRef.current, s)
      applyStatus(s)
    },
    [applyStatus],
  )

  const syncHud = useCallback(() => {
    const st = stateRef.current
    setHud({
      scores: snakeHud(st),
      elapsedMs: st.elapsedMs,
      effectiveTickMs: st.effectiveTickMs,
      foodEaten: st.snakes[0].foodEaten,
    })
  }, [])

  const handleEvents = useCallback((events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'food_eaten') {
        if ((e.value ?? 10) >= 30) audio.specialEat()
        else audio.eat()
      } else if (e.type === 'powerup_collected') {
        audio.powerup()
      } else if (e.type === 'shield_used') {
        audio.shield()
      }
    }
  }, [])

  const finishGame = useCallback(
    (state: GameState) => {
      if (reportedRef.current) return
      reportedRef.current = true
      const s0 = state.snakes[0]
      const isVersusMode =
        state.config.mode === 'versus' || state.config.mode === 'versus-timed' || state.config.mode === 'versus-ai'
      let versusResult: 'win' | 'draw' | 'loss' | undefined
      if (isVersusMode) {
        if (state.status === 'draw') versusResult = 'draw'
        else if (state.result?.winnerIds.includes('p1')) versusResult = 'win'
        else versusResult = 'loss'
      }
      const stars = levelDef && state.status === 'won' ? starsForScore(levelDef, s0.score) : undefined
      recordGameSummary({
        mode: state.config.mode,
        difficulty: state.config.difficulty ?? 'normal',
        manual: !anyAiRef.current,
        score: isCampaign ? (state.config.meta?.campaignRunScore ?? 0) + s0.score : s0.score,
        foodEaten: s0.foodEaten,
        durationMs: state.elapsedMs,
        won: state.status === 'won',
        draw: state.status === 'draw',
        mapId: state.config.meta?.mapId,
        officialLevelId: state.config.meta?.levelId,
        stars,
        versusResult,
        controller: s0.controller,
        spectated: isSpectate,
        dailyDate: state.config.meta?.dailyDate,
        campaignStage: isCampaign ? (state.config.meta?.campaignStage ?? 1) : undefined,
        at: Date.now(),
      })
      if (state.status === 'won') audio.win()
      else audio.gameOver()
    },
    [isCampaign, isSpectate, levelDef],
  )

  const runTick = useCallback(() => {
    const before = stateRef.current
    for (const snake of before.snakes) {
      if (!snake.alive) continue
      if (snake.controller !== 'human') {
        const algo: Algorithm =
          snake.controller === 'bfs'
            ? 'bfs'
            : snake.controller === 'astar'
              ? 'astar'
              : snake.controller === 'perfect'
                ? 'perfect'
                : 'safe'
        const decision = aiDecide(before, snake.id, algo)
        if (snake.id === 'p1' && isAiLab) {
          vizRef.current = decision.viz
          setAiMetrics({
            explored: decision.stats.explored,
            pathLength: decision.stats.pathLength,
            ms: decision.stats.ms,
            strategy: decision.stats.strategy,
            message: decision.stats.message,
          })
          if ((speedOverrideRef.current ?? 0) >= 250 && !demoDoneRef.current) {
            demoTicksRef.current += 1
            if (demoTicksRef.current >= 20) {
              demoDoneRef.current = true
              recordVizDemo()
            }
          }
        }
        if (decision.direction) setDirection(before, snake.id, decision.direction)
      }
    }
    const { next, events } = stepGame(before)
    if (speedOverrideRef.current != null && next.status === 'playing') {
      next.effectiveTickMs = speedOverrideRef.current
    }
    stateRef.current = next
    handleEvents(events)
    if (next.status !== 'playing' && next.status !== statusRef.current) {
      applyStatus(next.status)
      finishGame(next)
    }
  }, [applyStatus, finishGame, handleEvents, isAiLab])

  // —— 渲染循环：逻辑固定步长与渲染解耦 ——
  // 用 setTimeout 自调度而非 rAF：保证在 rAF 被节流/禁用的环境中逻辑仍精确推进；
  // 逻辑推进按真实时间差累积，渲染节流到约 60fps。
  useEffect(() => {
    let cancelled = false
    let timer: number | null = null
    let last = performance.now()
    let acc = 0
    let hudAcc = 0
    let lastPaint = 0

    const paint = (now: number): void => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const rect = canvas.getBoundingClientRect()
        if (rect.width > 0) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          const opts: DrawOptions = {
            theme,
            viz: isAiLab ? vizRef.current : null,
            showExplored: vizLayersRef.current.explored,
            showFrontier: vizLayersRef.current.frontier,
            showPath: vizLayersRef.current.path,
            pixelStyle: themeName === 'pixel',
            reducedMotion,
          }
          drawGame(ctx, stateRef.current, rect.width, rect.height, now, opts)
        }
      }
    }

    const frame = (now: number): void => {
      if (cancelled) return
      const dt = Math.min(now - last, 250)
      last = now
      if (statusRef.current === 'playing') {
        acc += dt
        let steps = 0
        while (steps < 8 && stateRef.current.status === 'playing' && acc >= stateRef.current.effectiveTickMs) {
          acc -= stateRef.current.effectiveTickMs
          runTick()
          steps += 1
        }
        hudAcc += dt
        if (hudAcc >= 80) {
          hudAcc = 0
          syncHud()
        }
      } else {
        acc = 0
      }
      if (now - lastPaint >= 14) {
        lastPaint = now
        paint(now)
      }
      const delay = statusRef.current === 'playing' ? 4 : 80
      timer = window.setTimeout(() => frame(performance.now()), delay)
    }

    timer = window.setTimeout(() => frame(performance.now()), 0)
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [runTick, syncHud, theme, themeName, isAiLab, reducedMotion])

  // —— 倒计时 ——
  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (goTimerRef.current != null) {
      window.clearTimeout(goTimerRef.current)
      goTimerRef.current = null
    }
  }, [])

  const beginCountdown = useCallback(
    (from: number) => {
      clearCountdown()
      setCountdown(from)
      audio.countdownTick()
      let n = from
      countdownTimerRef.current = window.setInterval(() => {
        n -= 1
        if (n <= 0) {
          clearCountdown()
          audio.countdownGo()
          changeStatus('playing')
          setCountdown(0)
          goTimerRef.current = window.setTimeout(() => setCountdown(null), 450)
        } else {
          audio.countdownTick()
          setCountdown(n)
        }
      }, 700)
    },
    [changeStatus, clearCountdown],
  )

  // —— 操作 ——
  const startGame = useCallback(() => {
    audio.unlock()
    changeStatus('countdown')
    beginCountdown(3)
  }, [beginCountdown, changeStatus])

  const pauseGame = useCallback(() => {
    clearCountdown()
    setCountdown(null)
    changeStatus('paused')
  }, [changeStatus, clearCountdown])

  const resumeGame = useCallback(() => {
    setPausedAuto(false)
    changeStatus('countdown')
    beginCountdown(1)
  }, [beginCountdown, changeStatus])

  const restartGame = useCallback(() => {
    clearCountdown()
    setCountdown(null)
    setPausedAuto(false)
    reportedRef.current = false
    vizRef.current = null
    demoTicksRef.current = 0
    demoDoneRef.current = false
    setAiMetrics(null)
    setCompareRows(null)
    const fresh = createInitialState(config)
    if (isAiLab) fresh.snakes[0].controller = controllerRef.current
    stateRef.current = fresh
    applyStatus('ready')
    syncHud()
  }, [applyStatus, clearCountdown, config, isAiLab, syncHud])

  // 卸载时清理计时器与循环
  useEffect(() => clearCountdown, [clearCountdown])

  // 失焦自动暂停；返回后需手动继续
  useEffect(() => {
    const autoPause = (): void => {
      if (statusRef.current === 'playing') {
        pauseGame()
        setPausedAuto(true)
      }
    }
    const onVis = (): void => {
      if (document.hidden) autoPause()
    }
    window.addEventListener('blur', autoPause)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', autoPause)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [pauseGame])

  // —— 输入路由 ——
  const routeDirection = useCallback(
    (dir: Direction, keyIsP1: boolean) => {
      if (statusRef.current !== 'playing') return
      if (config.mode === 'tournament') return // 观赛局不接收人工输入
      if (isVersus) {
        setDirection(stateRef.current, keyIsP1 ? 'p1' : 'p2', dir)
      } else {
        if (isAiLab && controllerRef.current !== 'human') return
        setDirection(stateRef.current, 'p1', dir)
      }
    },
    [config.mode, isAiLab, isVersus],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = statusRef.current
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault()
        if (st === 'ready') startGame()
        else if (st === 'playing') pauseGame()
        else if (st === 'paused') resumeGame()
        return
      }
      if (e.code === 'KeyR') {
        if (st === 'playing' || st === 'paused' || st === 'won' || st === 'lost' || st === 'draw') {
          e.preventDefault()
          restartGame()
        }
        return
      }
      const dir = KEY_DIRS[e.code]
      if (!dir) return
      e.preventDefault()
      const isP1Key = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)
      routeDirection(dir, isP1Key)
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [restartGame, resumeGame, routeDirection, startGame, pauseGame])

  // 触控滑动（画布区域阻止页面滚动）
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent): void => {
    audio.unlock()
    touchStartRef.current = { x: e.clientX, y: e.clientY }
    if (statusRef.current === 'ready') startGame()
    else if (statusRef.current === 'paused') resumeGame()
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const start = touchStartRef.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.hypot(dx, dy) < 24) return
    const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    routeDirection(dir, true)
    touchStartRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (): void => {
    touchStartRef.current = null
  }

  // AI 实验室：切换控制器（方向队列安全重置）
  const switchController = (algo: ControllerKind): void => {
    setController(algo)
    controllerRef.current = algo
    stateRef.current.snakes[0].controller = algo
    stateRef.current.snakes[0].queue = []
    vizRef.current = null
    if (algo !== 'human') {
      anyAiRef.current = true
      if (algo === 'bfs' || algo === 'astar') recordAiUse(algo)
    } else {
      setAiMetrics(null)
    }
  }

  const toggleVizLayer = (key: 'explored' | 'frontier' | 'path'): void => {
    const nextLayers = { ...vizLayersRef.current, [key]: !vizLayersRef.current[key] }
    vizLayersRef.current = nextLayers
    setVizLayers(nextLayers)
  }

  const startDemo = (): void => {
    setSpeedSlider(350)
    speedOverrideRef.current = 350
    if (controllerRef.current === 'human') switchController('safe')
    vizLayersRef.current = { explored: true, frontier: true, path: true }
    setVizLayers({ explored: true, frontier: true, path: true })
    if (statusRef.current === 'ready') startGame()
  }

  const runCompare = (): void => {
    setCompareRows(compareAlgorithms(stateRef.current, 'p1'))
  }

  // —— 渲染 ——
  const s0 = hud.scores[0]
  const timeLeft = config.timeLimitMs != null ? config.timeLimitMs - hud.elapsedMs : null
  const speedTilesPerSec = (1000 / hud.effectiveTickMs).toFixed(1)
  // 极速等级：随积分阶梯实时提升（每达到 everyScore 分升一级）
  const speedLevel =
    config.mode === 'speed' && config.speedRamp
      ? Math.floor((s0?.score ?? 0) / config.speedRamp.everyScore) + 1
      : null
  const speedNextGap =
    speedLevel != null && config.speedRamp
      ? config.speedRamp.everyScore - ((s0?.score ?? 0) % config.speedRamp.everyScore)
      : null
  const goalProgress = useMemo(() => {
    const g = config.goal
    if (g.type === 'score') return { label: '目标分数', current: s0?.score ?? 0, target: g.value ?? 0 }
    if (g.type === 'food') return { label: '目标食物', current: s0?.score ?? 0, target: (g.value ?? 0) * config.foodValue }
    if (g.type === 'survive') return { label: '存活时间', current: Math.floor(hud.elapsedMs / 1000), target: g.value ?? 0 }
    return null
  }, [config.goal, config.foodValue, hud.elapsedMs, s0?.score])

  const stars = levelDef && status === 'won' ? starsForScore(levelDef, s0?.score ?? 0) : 0
  const resultTitle =
    status === 'won'
      ? isSpectate
        ? '冠军诞生！'
        : isCampaign
          ? `第 ${config.meta?.campaignStage ?? '?'} 关完成！`
          : isVersus
            ? '胜利！'
            : '通关成功！'
      : status === 'lost'
        ? isCampaign
          ? '战役终结'
          : '游戏结束'
        : '平局'
  const resultReason = RESULT_TEXT[stateRef.current.result?.reason ?? 'died'] ?? (stateRef.current.result?.reason === 'died' ? '本局结束' : '')
  const versusWinner = stateRef.current.result?.winnerIds ?? []
  const hasNextLevel = options.kind === 'level' && levelDef != null && levelDef.id < 15 && status === 'won'
  const rulesText = config.meta?.rules ?? VERSUS_RULES

  return (
    <div className="page game-page">
      <header className="game-header">
        <button className="btn btn-ghost btn-icon" onClick={options.onExit} aria-label="返回">
          <ArrowLeft size={18} />
          <span className="hide-mobile">返回</span>
        </button>
        <h2 className="game-title">{config.meta?.label ?? '游戏'}</h2>
        <div className="game-header-actions">
          {isVersus && (
            <button className="btn btn-ghost" onClick={() => setShowRules((v) => !v)}>
              规则 {showRules ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={restartGame} aria-label="重开">
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      {showRules && isVersus && (
        <div className="rules-panel">
          <h4>规则说明</h4>
          <ul>
            {rulesText.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 记分板 */}
      <div className={`scoreboard ${isVersus ? 'scoreboard-versus' : ''}`}>
        {hud.scores.map((s, i) => (
          <div key={s.id} className={`score-card ${!s.alive ? 'score-dead' : ''}`} style={{ borderColor: s.color }}>
            <div className="score-name">
              <span className="dot" style={{ background: s.color }} />
              {s.name}
              {!s.alive && <span className="dead-tag">出局</span>}
            </div>
            <div className="score-value">{s.score}</div>
            <div className="score-meta">
              <span>长度 {s.length}</span>
              {!isVersus && <span>最高 {Math.max(bestScore, s.score)}</span>}
              {s.shield > 0 && <span className="buff buff-shield">🛡×{s.shield}</span>}
              {s.speedMult > 1 && <span className="buff buff-speed">⚡{Math.ceil(s.speedTicks * hud.effectiveTickMs / 1000)}s</span>}
              {s.speedMult > 0 && s.speedMult < 1 && <span className="buff buff-slow">🐢{Math.ceil(s.speedTicks * hud.effectiveTickMs / 1000)}s</span>}
              {s.scoreMult > 1 && <span className="buff buff-double">×2 {Math.ceil(s.scoreTicks * hud.effectiveTickMs / 1000)}s</span>}
              {i === 0 && !isVersus && <span className="buff">🍎{hud.foodEaten}</span>}
            </div>
          </div>
        ))}
        <div className="score-card score-info">
          <div className="score-name">状态</div>
          <div className="score-value">
            {status === 'playing' ? '进行中' : status === 'ready' ? '准备' : status === 'countdown' ? '倒计时' : status === 'paused' ? '已暂停' : status === 'won' ? '胜利' : status === 'lost' ? '失败' : '平局'}
            {speedLevel != null && <span className="speed-badge">⚡ 极速 Lv.{speedLevel}</span>}
          </div>
          <div className="score-meta">
            <span>{speedTilesPerSec} 格/秒</span>
            {speedNextGap != null && <span className="buff buff-speed">再得 {speedNextGap} 分提速</span>}
            {isCampaign && <span className="buff">💰 战役累计 {config.meta?.campaignRunScore ?? 0} 分</span>}
            {timeLeft != null && (
              <span className={timeLeft < 10000 ? 'time-danger' : ''}>⏱ {formatMs(timeLeft)}</span>
            )}
          </div>
        </div>
      </div>

      {goalProgress && !isVersus && (
        <div className="goal-bar">
          <span>
            {goalProgress.label}：{goalProgress.current} / {goalProgress.target}
          </span>
          <div className="goal-track">
            <div className="goal-fill" style={{ width: `${Math.min(100, (goalProgress.current / Math.max(1, goalProgress.target)) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="game-layout">
        <div className="board-wrap" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <GameCanvas ref={canvasRef} className="game-canvas" />
          {status === 'ready' && (
            <div className="board-overlay" onClick={startGame}>
              <div className="overlay-title">准备就绪</div>
              <div className="overlay-sub">点击画面或按 空格 开始</div>
              <div className="overlay-hint">
                {isVersus ? '玩家一：WASD · 玩家二：方向键' : '方向键 / WASD 移动 · 空格暂停'}
              </div>
            </div>
          )}
          {countdown != null && countdown > 0 && (
            <div className="board-overlay board-overlay-transparent">
              <div className="countdown-num">{countdown}</div>
            </div>
          )}
          {countdown === 0 && (
            <div className="board-overlay board-overlay-transparent">
              <div className="countdown-num countdown-go">GO!</div>
            </div>
          )}
          {status === 'paused' && (
            <div className="board-overlay" onClick={resumeGame}>
              <div className="overlay-title">{pausedAuto ? '已自动暂停' : '已暂停'}</div>
              <div className="overlay-sub">{pausedAuto ? '窗口失焦自动暂停，点击继续' : '点击画面或按 空格 继续'}</div>
            </div>
          )}
        </div>

        {isAiLab && (
          <aside className="side-panel">
            <section className="panel-card">
              <h4>控制方式</h4>
              <div className="chip-group">
                {([['human', '手动'], ['bfs', 'BFS'], ['astar', 'A*'], ['safe', '安全策略'], ['perfect', '完美']] as [ControllerKind, string][]).map(([value, label]) => (
                  <button key={value} className={`chip ${controller === value ? 'chip-active' : ''}`} onClick={() => switchController(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="panel-note">AI 不能穿墙或蛇身；安全策略优先可存活性，复杂动态地图中不保证永不死亡。</p>
            </section>
            <section className="panel-card">
              <h4>可视化图层</h4>
              <div className="chip-group">
                <button className={`chip ${vizLayers.explored ? 'chip-active' : ''}`} onClick={() => toggleVizLayer('explored')}>
                  已探索
                </button>
                <button className={`chip ${vizLayers.frontier ? 'chip-active' : ''}`} onClick={() => toggleVizLayer('frontier')}>
                  开放集
                </button>
                <button className={`chip ${vizLayers.path ? 'chip-active' : ''}`} onClick={() => toggleVizLayer('path')}>
                  规划路径
                </button>
              </div>
              <div className="lab-speed">
                <label htmlFor="lab-speed">步长 {speedSlider}ms</label>
                <input
                  id="lab-speed"
                  type="range"
                  min={60}
                  max={400}
                  step={10}
                  value={speedSlider}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setSpeedSlider(v)
                    speedOverrideRef.current = v
                  }}
                />
              </div>
              <div className="chip-group">
                <button className="btn btn-secondary" onClick={startDemo}>
                  🎬 慢速演示
                </button>
                <button className="btn btn-ghost" onClick={runCompare}>
                  ⚖️ BFS vs A*
                </button>
              </div>
            </section>
            <section className="panel-card">
              <h4>算法指标</h4>
              {aiMetrics ? (
                <ul className="metric-list">
                  <li>
                    <span>策略</span>
                    <b>{aiMetrics.message}</b>
                  </li>
                  <li>
                    <span>探索节点</span>
                    <b>{aiMetrics.explored}</b>
                  </li>
                  <li>
                    <span>路径长度</span>
                    <b>{aiMetrics.pathLength}</b>
                  </li>
                  <li>
                    <span>计算耗时</span>
                    <b>{aiMetrics.ms.toFixed(2)} ms</b>
                  </li>
                </ul>
              ) : (
                <p className="panel-note">选择 AI 控制后显示实时搜索统计。</p>
              )}
            </section>
            {compareRows && compareRows.rows.length > 0 && (
              <section className="panel-card">
                <h4>BFS vs A* 对比（当前局面）</h4>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>算法</th>
                      <th>探索</th>
                      <th>路径</th>
                      <th>耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.rows.map((r) => (
                      <tr key={r.algorithm}>
                        <td>{r.algorithm === 'bfs' ? 'BFS' : 'A*'}</td>
                        <td>{r.explored}</td>
                        <td>{r.found ? r.pathLength : '—'}</td>
                        <td>{r.ms.toFixed(2)}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="panel-note">A* 用 Manhattan 启发式聚焦搜索方向；BFS 逐层扩散。动态蛇身环境两者都需按 tick 重规划。</p>
              </section>
            )}
          </aside>
        )}
      </div>

      {settings.virtualDpad && (
        <div className="dpad-row">
          <VirtualDpad onDirection={(d) => routeDirection(d, true)} color={hud.scores[0]?.color} />
          {isVersus && config.mode !== 'versus-ai' && (
            <div className="dpad-note">双人触控仅控制玩家一，玩家二请使用方向键（推荐键盘双人）</div>
          )}
        </div>
      )}

      <Modal
        open={status === 'won' || status === 'lost' || status === 'draw'}
        title={resultTitle}
        actions={
          <>
            <button className="btn btn-ghost" onClick={options.onExit}>
              {isCampaign && status === 'won' ? '放弃战役' : '返回菜单'}
            </button>
            {isCampaign && status === 'won' && options.onNextStage ? (
              <button
                className="btn btn-primary"
                onClick={() => options.onNextStage?.(config.meta?.campaignStage ?? 1, s0?.score ?? 0)}
              >
                选择增益 →
              </button>
            ) : isCampaign && status !== 'won' && options.onRestartCampaign ? (
              <button className="btn btn-primary" onClick={options.onRestartCampaign}>
                重振旗鼓（重新开始）
              </button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={restartGame}>
                  再来一局
                </button>
                {hasNextLevel && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (options.onNextLevel && levelDef) options.onNextLevel(levelDef.id)
                    }}
                  >
                    下一关 →
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        <p className="modal-message">{resultReason}</p>
        {stars > 0 && <p className="result-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</p>}
        <div className="result-scores">
          {hud.scores.map((s) => (
            <div key={s.id} className="result-score-row">
              <span className="dot" style={{ background: s.color }} />
              <span>{s.name}</span>
              <b>{s.score} 分</b>
              {versusWinner.includes(s.id) && <span className="win-tag">WIN</span>}
            </div>
          ))}
        </div>
        {levelDef && <p className="panel-note">三星阈值：{levelDef.stars.join(' / ')} 分</p>}
      </Modal>
    </div>
  )
}
