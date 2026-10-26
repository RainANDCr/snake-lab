import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Copy, Download, Eraser, Play, Redo2, Save, Shield, Square, Target, Trash2, Undo2, Upload, Wand2 } from 'lucide-react'
import { EditorHistory, EditorSnapshot } from '../game/maps/editor'
import { MapData, createMapId, parseImportedMap, validateMap } from '../game/maps/validation'
import { buildPreset, clonePreset, PRESET_MAPS } from '../game/maps/presets'
import { buildCustomConfig } from '../game/modes/configs'
import { MatchConfig } from '../game/core/types'
import { storage, CustomLevelDef } from '../services/storage'
import { audio } from '../services/audio'
import { recordMapCreatedIfNew } from '../services/records'
import { uiBus } from '../services/uiBus'
import { THEME_COLORS } from '../styles/themes'
import { computeLayout } from '../components/draw'
import { GameCanvas } from '../components/GameCanvas'
import { ConfirmModal, Modal } from '../components/Modal'
import { BoardPreview } from '../components/BoardPreview'
import { GameScreenOptions } from '../components/GameScreen'

type Tool = 'wall' | 'erase' | 'spawn-single' | 'spawn-p1' | 'spawn-p2' | 'foodzone'

const TOOLS: { value: Tool; label: string; icon: React.ReactNode }[] = [
  { value: 'wall', label: '墙壁', icon: <Square size={15} /> },
  { value: 'erase', label: '橡皮', icon: <Eraser size={15} /> },
  { value: 'spawn-single', label: '单人出生', icon: <Target size={15} /> },
  { value: 'spawn-p1', label: 'P1 出生', icon: <Target size={15} /> },
  { value: 'spawn-p2', label: 'P2 出生', icon: <Target size={15} /> },
  { value: 'foodzone', label: '食物区', icon: <Wand2 size={15} /> },
]

interface Draft {
  id: string | null
  name: string
  width: number
  height: number
  wrap: boolean
  walls: Set<string>
  foodZone: Set<string> | null
  spawns: EditorSnapshot['spawns']
}

function newDraft(width = 24, height = 24, name = '新地图'): Draft {
  const midY = Math.floor(height / 2)
  return {
    id: null,
    name,
    width,
    height,
    wrap: false,
    walls: new Set(),
    foodZone: null,
    spawns: { single: { x: 4, y: midY }, p1: { x: 4, y: midY }, p2: { x: width - 5, y: midY } },
  }
}

function draftFromMap(map: MapData): Draft {
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    wrap: map.wrap,
    walls: new Set(map.walls.map((w) => `${w.x},${w.y}`)),
    foodZone: map.foodZone ? new Set(map.foodZone.map((p) => `${p.x},${p.y}`)) : null,
    spawns: { ...map.spawns },
  }
}

function draftToMap(draft: Draft): MapData {
  const now = Date.now()
  const walls = [...draft.walls].map((k) => {
    const [x, y] = k.split(',')
    return { x: Number(x), y: Number(y) }
  })
  const foodZone = draft.foodZone
    ? [...draft.foodZone].map((k) => {
        const [x, y] = k.split(',')
        return { x: Number(x), y: Number(y) }
      })
    : null
  return {
    id: draft.id ?? createMapId(),
    name: draft.name,
    schemaVersion: 1,
    width: draft.width,
    height: draft.height,
    wrap: draft.wrap,
    walls,
    spawns: draft.spawns,
    foodZone,
    createdAt: now,
    updatedAt: now,
  }
}

const SPAWN_COLORS: Record<string, string> = {
  single: '#34d399',
  p1: '#22d3ee',
  p2: '#fb923c',
}

export function MapEditorPage({ onExit, onLaunch }: { onExit: () => void; onLaunch: (config: MatchConfig, options: GameScreenOptions) => void }) {
  const [draft, setDraft] = useState<Draft>(() => newDraft())
  const [tool, setTool] = useState<Tool>('wall')
  const [mapsVersion, setMapsVersion] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [customForm, setCustomForm] = useState({ name: '我的挑战', goalScore: 150, timeLimitSec: 0, tickMs: 120 })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const [, forceRender] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const paintingRef = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const historyRef = useRef<EditorHistory | null>(null)
  if (!historyRef.current) {
    historyRef.current = new EditorHistory(
      () => ({
        walls: [...draftRef.current.walls],
        foodZone: draftRef.current.foodZone ? [...draftRef.current.foodZone] : null,
        spawns: { ...draftRef.current.spawns },
      }),
      (snap) => {
        setDraft((d) => ({
          ...d,
          walls: new Set(snap.walls),
          foodZone: snap.foodZone ? new Set(snap.foodZone) : null,
          spawns: { ...snap.spawns },
        }))
      },
    )
  }
  const history = historyRef.current
  const bump = useCallback(() => forceRender((n) => n + 1), [])

  const userMaps = useMemo(() => storage.loadMaps(), [mapsVersion])
  const customLevels = useMemo(() => storage.loadCustomLevels(), [mapsVersion])

  // —— 绘制 ——
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number) => {
      const d = draftRef.current
      const theme = THEME_COLORS[document.documentElement.dataset.theme === 'light' ? 'light' : document.documentElement.dataset.theme === 'pixel' ? 'pixel' : 'neon']
      const layout = computeLayout(cssWidth, cssHeight, d.width, d.height)
      const { cell, offsetX, offsetY } = layout
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      ctx.fillStyle = theme.boardBg
      ctx.fillRect(offsetX, offsetY, cell * d.width, cell * d.height)
      // 网格
      ctx.strokeStyle = theme.gridLine
      ctx.beginPath()
      for (let x = 1; x < d.width; x++) {
        ctx.moveTo(offsetX + x * cell + 0.5, offsetY)
        ctx.lineTo(offsetX + x * cell + 0.5, offsetY + d.height * cell)
      }
      for (let y = 1; y < d.height; y++) {
        ctx.moveTo(offsetX, offsetY + y * cell + 0.5)
        ctx.lineTo(offsetX + d.width * cell, offsetY + y * cell + 0.5)
      }
      ctx.stroke()
      // 食物区
      if (d.foodZone) {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.12)'
        for (const k of d.foodZone) {
          const [x, y] = k.split(',')
          ctx.fillRect(offsetX + Number(x) * cell, offsetY + Number(y) * cell, cell, cell)
        }
      }
      // 墙
      ctx.fillStyle = theme.wall
      ctx.strokeStyle = theme.wallStroke
      for (const k of d.walls) {
        const [x, y] = k.split(',')
        ctx.fillRect(offsetX + Number(x) * cell + 1, offsetY + Number(y) * cell + 1, cell - 2, cell - 2)
        ctx.strokeRect(offsetX + Number(x) * cell + 1, offsetY + Number(y) * cell + 1, cell - 2, cell - 2)
      }
      // 出生点
      const drawSpawn = (p: { x: number; y: number } | undefined, color: string, label: string): void => {
        if (!p) return
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(offsetX + p.x * cell + cell / 2, offsetY + p.y * cell + cell / 2, Math.max(3, cell * 0.34), 0, Math.PI * 2)
        ctx.fill()
        if (cell >= 18) {
          ctx.fillStyle = '#0b1020'
          ctx.font = `bold ${Math.floor(cell * 0.42)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, offsetX + p.x * cell + cell / 2, offsetY + p.y * cell + cell / 2 + 1)
        }
      }
      drawSpawn(d.spawns.single, SPAWN_COLORS.single, 'S')
      drawSpawn(d.spawns.p1, SPAWN_COLORS.p1, '1')
      drawSpawn(d.spawns.p2, SPAWN_COLORS.p2, '2')
      // 悬停指示
      if (hoverCell) {
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2
        ctx.strokeRect(offsetX + hoverCell.x * cell + 1, offsetY + hoverCell.y * cell + 1, cell - 2, cell - 2)
      }
      if (d.wrap) {
        ctx.strokeStyle = theme.path
        ctx.setLineDash([6, 4])
        ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, cell * d.width - 1, cell * d.height - 1)
        ctx.setLineDash([])
      }
    },
    [hoverCell],
  )

  const repaint = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint(ctx, rect.width, rect.height)
  }, [paint])

  useEffect(() => {
    repaint()
  }, [repaint, draft, tool])

  // —— 工具应用 ——
  const applyTool = useCallback(
    (x: number, y: number, isDragStart: boolean): void => {
      const d = draftRef.current
      const k = `${x},${y}`
      if (isDragStart) history.commit()
      setDraft((prev) => {
        const next = { ...prev, walls: new Set(prev.walls) }
        if (tool === 'wall') {
          // 出生点不可被墙覆盖
          const occupiedBySpawn = [prev.spawns.single, prev.spawns.p1, prev.spawns.p2].some((p) => p && p.x === x && p.y === y)
          if (!occupiedBySpawn) next.walls.add(k)
        } else if (tool === 'erase') {
          next.walls.delete(k)
          if (prev.foodZone) next.foodZone = new Set(prev.foodZone)
          if (next.foodZone) next.foodZone.delete(k)
        } else if (tool === 'foodzone') {
          if (prev.walls.has(k)) return prev
          const zone = new Set(prev.foodZone ?? [])
          if (zone.has(k)) zone.delete(k)
          else zone.add(k)
          next.foodZone = zone
        } else if (tool === 'spawn-single') {
          if (!prev.walls.has(k)) next.spawns = { ...prev.spawns, single: { x, y } }
        } else if (tool === 'spawn-p1') {
          if (!prev.walls.has(k)) next.spawns = { ...prev.spawns, p1: { x, y } }
        } else if (tool === 'spawn-p2') {
          if (!prev.walls.has(k)) next.spawns = { ...prev.spawns, p2: { x, y } }
        }
        return next
      })
    },
    [history, tool],
  )

  const cellFromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const d = draftRef.current
    const layout = computeLayout(rect.width, rect.height, d.width, d.height)
    const x = Math.floor((e.clientX - rect.left - layout.offsetX) / layout.cell)
    const y = Math.floor((e.clientY - rect.top - layout.offsetY) / layout.cell)
    if (x < 0 || y < 0 || x >= d.width || y >= d.height) return null
    return { x, y }
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    audio.unlock()
    e.currentTarget.setPointerCapture(e.pointerId)
    const cell = cellFromEvent(e)
    if (!cell) return
    paintingRef.current = true
    applyTool(cell.x, cell.y, true)
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const cell = cellFromEvent(e)
    setHoverCell(cell)
    if (!paintingRef.current || !cell) return
    if (tool === 'wall' || tool === 'erase' || tool === 'foodzone') applyTool(cell.x, cell.y, false)
  }
  const onPointerUp = (): void => {
    paintingRef.current = false
  }

  // 撤销/重做快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
        bump()
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault()
        history.redo()
        bump()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bump, history])

  // —— 地图管理 ——
  const openNewMap = (size: number): void => {
    setDraft(newDraft(size, size))
    setEditingId(null)
    history.clear()
    setValidation(null)
  }

  const loadMap = (map: MapData): void => {
    if (map.readonly) {
      setDraft(draftFromMap(clonePreset(map)))
      setEditingId(null)
    } else {
      setDraft(draftFromMap(map))
      setEditingId(map.id)
    }
    history.clear()
    setValidation(null)
  }

  const openSave = (): void => {
    setSaveName(draft.name)
    setSaveOpen(true)
  }

  const saveMap = (): void => {
    const map = draftToMap({ ...draftRef.current, name: saveName.trim() || '未命名地图', id: editingId })
    const result = validateMap(map, { requireSingle: true })
    setValidation({ errors: result.errors, warnings: result.warnings })
    if (!result.ok) return
    const maps = storage.loadMaps()
    const existingIdx = maps.findIndex((m) => m.id === map.id)
    if (existingIdx >= 0) maps[existingIdx] = map
    else maps.push(map)
    if (!storage.saveMaps(maps)) {
      uiBus.push({ title: '保存失败', message: '存储空间不足或被禁用', kind: 'error' })
      return
    }
    recordMapCreatedIfNew(map.id)
    setEditingId(map.id)
    setDraft((d) => ({ ...d, id: map.id, name: map.name }))
    setSaveOpen(false)
    setMapsVersion((v) => v + 1)
    audio.click()
  }

  const deleteMap = (): void => {
    if (!deleteId) return
    storage.saveMaps(storage.loadMaps().filter((m) => m.id !== deleteId))
    // 级联删除自定义关卡
    storage.saveCustomLevels(storage.loadCustomLevels().filter((l) => l.mapId !== deleteId))
    if (editingId === deleteId) {
      setEditingId(null)
      setDraft(newDraft())
    }
    setDeleteId(null)
    setMapsVersion((v) => v + 1)
  }

  const exportMap = (map: MapData): void => {
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${map.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportDraft = (): void => {
    exportMap(draftToMap(draftRef.current))
  }

  const importMap = async (file: File): Promise<void> => {
    try {
      if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
        throw new Error('请选择 .json 地图文件')
      }
      if (file.size > 1024 * 1024) throw new Error('文件过大（上限 1MB）')
      const text = await file.text()
      const map = parseImportedMap(text)
      const maps = storage.loadMaps()
      const idx = maps.findIndex((m) => m.id === map.id)
      map.name = idx >= 0 ? `${map.name}·导入` : map.name
      if (idx >= 0) maps[idx] = map
      else maps.push(map)
      storage.saveMaps(maps)
      setMapsVersion((v) => v + 1)
      loadMap({ ...map, readonly: false })
      uiBus.push({ title: '导入成功', message: `已加载地图「${map.name}」`, kind: 'info' })
    } catch (err) {
      uiBus.push({ title: '导入失败', message: err instanceof Error ? err.message : '未知错误', kind: 'error' })
    }
  }

  const validateDraft = (): void => {
    const result = validateMap(draftToMap(draftRef.current), { requireSingle: true })
    setValidation({ errors: result.errors, warnings: result.warnings })
  }

  const playDraft = (versus: boolean): void => {
    const map = draftToMap(draftRef.current)
    const result = validateMap(map, versus ? { requireVersus: true } : { requireSingle: true })
    if (!result.ok) {
      setValidation({ errors: result.errors, warnings: result.warnings })
      return
    }
    audio.unlock()
    audio.click()
    const config = buildCustomConfig(map, 'normal')
    onLaunch(config, { kind: 'custom', onExit })
  }

  const saveCustomLevel = (): void => {
    const map = draftToMap(draftRef.current)
    if (!editingId) {
      setValidation({ errors: ['请先保存地图，再基于它创建自定义关卡'], warnings: [] })
      return
    }
    const level: CustomLevelDef = {
      id: `cl_${Date.now().toString(36)}`,
      name: customForm.name.trim() || `${map.name}挑战`,
      mapId: map.id,
      goalScore: Math.max(10, Math.min(5000, customForm.goalScore)),
      timeLimitSec: customForm.timeLimitSec > 0 ? customForm.timeLimitSec : undefined,
      tickMs: customForm.tickMs,
      createdAt: Date.now(),
    }
    storage.saveCustomLevels([...storage.loadCustomLevels(), level])
    setCustomOpen(false)
    setMapsVersion((v) => v + 1)
    uiBus.push({ title: '已创建自定义关卡', message: level.name, kind: 'info' })
  }

  const validationOk = validation !== null && validation.errors.length === 0

  return (
    <div className="page editor-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>地图编辑器</h2>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-icon" onClick={() => { history.undo(); bump() }} disabled={!history.canUndo} aria-label="撤销">
            <Undo2 size={17} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => { history.redo(); bump() }} disabled={!history.canRedo} aria-label="重做">
            <Redo2 size={17} />
          </button>
        </div>
      </header>

      <div className="editor-layout">
        <div className="editor-board">
          <div className="editor-toolbar">
            {TOOLS.map((t) => (
              <button key={t.value} className={`chip ${tool === t.value ? 'chip-active' : ''}`} onClick={() => setTool(t.value)}>
                {t.icon} {t.label}
              </button>
            ))}
            <input
              className="input input-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="地图名称"
              maxLength={20}
            />
          </div>
          <GameCanvas ref={canvasRef} className="editor-canvas" repaintKey={`${draft.walls.size}:${hoverCell?.x ?? -1},${hoverCell?.y ?? -1}:${draft.spawns.single?.x ?? -1}`} onPaint={paint} />
          <div className="editor-hints">
            <span>点击/拖动绘制 · {tool === 'foodzone' ? '再次点击可取消食物区' : '橡皮擦可清除'}</span>
            <span>
              {draft.width}×{draft.height} · 障碍 {draft.walls.size}
            </span>
            <button className={`chip ${draft.wrap ? 'chip-active' : ''}`} onClick={() => { history.commit(); setDraft((d) => ({ ...d, wrap: !d.wrap })) }}>
              穿墙模式 {draft.wrap ? '开' : '关'}
            </button>
            <button className="chip" onClick={() => { history.commit(); setDraft((d) => ({ ...d, foodZone: null, walls: new Set(d.walls) })) }}>
              清除食物区
            </button>
            <button className="chip" onClick={() => { history.commit(); setDraft((d) => ({ ...d, walls: new Set(), foodZone: null })) }}>
              清空障碍
            </button>
          </div>
          <div className="editor-actions">
            <button className="btn btn-secondary" onClick={openSave}>
              <Save size={15} /> 保存地图
            </button>
            <button className="btn btn-ghost" onClick={validateDraft}>
              校验
            </button>
            <button className="btn btn-ghost" onClick={playDraft.bind(null, false)}>
              <Play size={15} /> 试玩（单人）
            </button>
            <button className="btn btn-ghost" onClick={() => playDraft(true)}>
              试玩（双人）
            </button>
            <button className="btn btn-ghost" onClick={exportDraft}>
              <Download size={15} /> 导出
            </button>
            <label className="btn btn-ghost file-label">
              <Upload size={15} /> 导入
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importMap(f)
                  e.target.value = ''
                }}
              />
            </label>
            <button className="btn btn-ghost" onClick={() => setCustomOpen(true)}>
              <Shield size={15} /> 创建自定义关卡
            </button>
          </div>
          {validation && (
            <div className={`validation-panel ${validationOk ? 'validation-ok' : 'validation-error'}`}>
              {validation.errors.length > 0 ? (
                validation.errors.map((e) => (
                  <p key={e} className="error-text">
                    ⚠ {e}
                  </p>
                ))
              ) : (
                <p className="ok-text">✓ 地图合法，可以保存和游玩</p>
              )}
              {validation.warnings.map((w) => (
                <p key={w} className="panel-note">
                  ℹ {w}
                </p>
              ))}
            </div>
          )}
        </div>

        <aside className="side-panel">
          <section className="panel-card">
            <h4>新建</h4>
            <div className="chip-group">
              {[16, 24, 32].map((s) => (
                <button key={s} className="chip" onClick={() => openNewMap(s)}>
                  {s}×{s}
                </button>
              ))}
            </div>
          </section>
          <section className="panel-card">
            <h4>预设地图（只读）</h4>
            <ul className="map-list">
              {PRESET_MAPS.map((p) => {
                const map = buildPreset(p.key)!
                return (
                  <li key={p.key}>
                    <span className="map-list-name">{map.name}</span>
                    <button className="btn btn-ghost" onClick={() => loadMap(map)}>
                      <Copy size={14} /> 复制编辑
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="panel-card">
            <h4>我的地图</h4>
            {userMaps.length === 0 ? (
              <p className="panel-note">还没有保存的地图。</p>
            ) : (
              <ul className="map-list">
                {userMaps.map((m) => (
                  <li key={m.id} className={editingId === m.id ? 'map-list-active' : ''}>
                    <span className="map-list-name">{m.name}</span>
                    <span className="map-list-actions">
                      <button className="btn btn-ghost" onClick={() => loadMap(m)}>
                        编辑
                      </button>
                      <button className="btn btn-ghost" onClick={() => exportMap(m)} aria-label="导出">
                        <Download size={14} />
                      </button>
                      <button className="btn btn-ghost" onClick={() => setDeleteId(m.id)} aria-label="删除">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {customLevels.length > 0 && (
            <section className="panel-card">
              <h4>基于此地图的自定义关卡</h4>
              <ul className="map-list">
                {customLevels
                  .filter((l) => l.mapId === editingId)
                  .map((l) => (
                    <li key={l.id}>
                      <span className="map-list-name">{l.name}</span>
                      <span className="panel-note">目标 {l.goalScore} 分</span>
                    </li>
                  ))}
              </ul>
              <p className="panel-note">在「关卡挑战 → 自定义关卡」中游玩。</p>
            </section>
          )}
        </aside>
      </div>

      <Modal
        open={saveOpen}
        title={editingId ? '更新地图' : '保存地图'}
        onClose={() => setSaveOpen(false)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setSaveOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveMap}>
              保存
            </button>
          </>
        }
      >
        <label className="field-label">
          名称
          <input className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={20} placeholder="给地图起个名字" />
        </label>
        <p className="panel-note">保存前会自动校验出生点、连通性与食物空间。</p>
      </Modal>

      <Modal
        open={customOpen}
        title="基于当前地图创建自定义关卡"
        onClose={() => setCustomOpen(false)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCustomOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveCustomLevel}>
              创建
            </button>
          </>
        }
      >
        <label className="field-label">
          关卡名称
          <input className="input" value={customForm.name} onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))} maxLength={20} />
        </label>
        <label className="field-label">
          目标分数
          <input
            className="input"
            type="number"
            min={10}
            max={5000}
            value={customForm.goalScore}
            onChange={(e) => setCustomForm((f) => ({ ...f, goalScore: Number(e.target.value) }))}
          />
        </label>
        <label className="field-label">
          时间限制（秒，0 为不限时）
          <input
            className="input"
            type="number"
            min={0}
            max={600}
            value={customForm.timeLimitSec}
            onChange={(e) => setCustomForm((f) => ({ ...f, timeLimitSec: Number(e.target.value) }))}
          />
        </label>
        <label className="field-label">
          速度（毫秒/步，越小越快）
          <select className="input" value={customForm.tickMs} onChange={(e) => setCustomForm((f) => ({ ...f, tickMs: Number(e.target.value) }))}>
            <option value={150}>慢速 150ms</option>
            <option value={120}>常速 120ms</option>
            <option value={95}>快速 95ms</option>
          </select>
        </label>
        {!editingId && <p className="error-text">⚠ 当前地图尚未保存，请先保存地图。</p>}
      </Modal>

      <ConfirmModal
        open={deleteId != null}
        title="删除地图"
        message="确定删除这张地图吗？基于它的自定义关卡也会一并删除，且不可恢复。"
        confirmLabel="删除"
        danger
        onConfirm={deleteMap}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
