import { useRef, useState } from 'react'
import { ArrowLeft, Download, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react'
import { THEME_COLORS } from '../styles/themes'
import { Settings, storage } from '../services/storage'
import { uiBus } from '../services/uiBus'
import { audio } from '../services/audio'
import { ConfirmModal } from '../components/Modal'

const THEME_CARDS: { value: Settings['theme']; label: string; desc: string }[] = [
  { value: 'neon', label: '霓虹科技', desc: '深蓝底 + 霓虹绿光（默认）' },
  { value: 'light', label: '极简浅色', desc: '清爽明亮的白天模式' },
  { value: 'pixel', label: '经典像素', desc: '复古街机像素风' },
]

const THEME_MODES: { value: Settings['themeMode']; label: string; desc: string }[] = [
  { value: 'auto', label: '跟随系统', desc: '自动切换深浅色' },
  { value: 'dark', label: '深色', desc: '固定霓虹科技' },
  { value: 'light', label: '浅色', desc: '固定极简浅色' },
]

export function SettingsPage({ onExit, onSettingsChange }: { onExit: () => void; onSettingsChange: (s: Settings) => void }) {
  const [settings, setSettings] = useState(() => storage.loadSettings())
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const update = (patch: Partial<Settings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    storage.saveSettings(next)
    onSettingsChange(next)
  }

  const exportBackup = (): void => {
    const json = storage.exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snake-lab-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importBackup = async (file: File): Promise<void> => {
    try {
      const text = await file.text()
      const result = storage.importAll(text)
      if (result.ok) {
        uiBus.push({ title: '恢复完成', message: `已恢复：${result.restored.join('、')}`, kind: 'info' })
        const restored = storage.loadSettings()
        setSettings(restored)
        onSettingsChange(restored)
      } else {
        uiBus.push({ title: '恢复失败', message: result.errors.join('；'), kind: 'error' })
      }
    } catch {
      uiBus.push({ title: '恢复失败', message: '无法读取文件', kind: 'error' })
    }
  }

  const resetAll = (): void => {
    storage.clearAll()
    window.location.reload()
  }

  const usageKb = (storage.usageBytes() / 1024).toFixed(1)

  return (
    <div className="page setup-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={onExit} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <h2>
          <SettingsIcon size={20} /> 设置
        </h2>
      </header>

      <section className="setup-section">
        <h3>主题模式</h3>
        <div className="chip-group">
          {THEME_MODES.map((m) => (
            <button
              key={m.value}
              className={`chip ${settings.themeMode === m.value ? 'chip-active' : ''}`}
              title={m.desc}
              onClick={() => update({ themeMode: m.value, theme: m.value === 'dark' ? 'neon' : m.value === 'light' ? 'light' : settings.theme })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="panel-note">「跟随系统」自动切换深浅色；也可用页面右上角的快捷按钮随时切换。</p>
      </section>

      <section className="setup-section">
        <h3>主题外观</h3>
        <div className="theme-cards">
          {THEME_CARDS.map((t) => (
            <button key={t.value} className={`theme-card ${settings.theme === t.value ? 'option-active' : ''}`} onClick={() => { update({ theme: t.value, themeMode: 'manual' }); audio.click() }}>
              <span className="theme-swatch" style={{ background: THEME_COLORS[t.value].boardBg, borderColor: THEME_COLORS[t.value].snakeBody }}>
                <i style={{ background: THEME_COLORS[t.value].snakeBody }} />
                <i style={{ background: THEME_COLORS[t.value].food }} />
                <i style={{ background: THEME_COLORS[t.value].wall }} />
              </span>
              <b>{t.label}</b>
              <span>{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <h3>声音</h3>
        <div className="setting-row">
          <span>游戏音效</span>
          <button className={`chip ${settings.sound ? 'chip-active' : ''}`} onClick={() => { update({ sound: !settings.sound }); audio.unlock() }}>
            {settings.sound ? '开启' : '静音'}
          </button>
        </div>
        <div className="setting-row">
          <span>音量</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
            disabled={!settings.sound}
          />
        </div>
      </section>

      <section className="setup-section">
        <h3>操作</h3>
        <div className="setting-row">
          <span>虚拟方向键（触屏）</span>
          <button className={`chip ${settings.virtualDpad ? 'chip-active' : ''}`} onClick={() => update({ virtualDpad: !settings.virtualDpad })}>
            {settings.virtualDpad ? '开启' : '关闭'}
          </button>
        </div>
        <p className="panel-note">桌面端：方向键 / WASD 移动，空格暂停，R 重开。对战模式固定为玩家一 WASD、玩家二方向键。触屏支持画布上滑动转向。</p>
      </section>

      <section className="setup-section">
        <h3>数据管理</h3>
        <p className="panel-note">当前存储占用约 {usageKb} KB。建议定期导出备份；导入会覆盖现有数据。</p>
        <div className="chip-group">
          <button className="btn btn-secondary" onClick={exportBackup}>
            <Download size={15} /> 导出备份
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> 导入备份
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} /> 清除全部数据
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importBackup(f)
            e.target.value = ''
          }}
        />
      </section>

      <ConfirmModal
        open={confirmReset}
        title="清除全部数据"
        message="将删除所有存档：统计、成就、自定义地图、关卡进度与设置。此操作不可恢复，确定继续吗？"
        confirmLabel="全部清除"
        danger
        onConfirm={resetAll}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}
