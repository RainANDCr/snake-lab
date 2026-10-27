import { Award, BarChart3, Brain, CalendarDays, Crown, Flame, Gamepad2, Map as MapIcon, PencilRuler, Settings as SettingsIcon, Swords, Trophy } from 'lucide-react'

export type HomePageEntry =
  | 'single-setup'
  | 'daily'
  | 'ai-lab'
  | 'tournament'
  | 'versus-setup'
  | 'campaign'
  | 'levels'
  | 'editor'
  | 'achievements'
  | 'stats'
  | 'settings'

const CARD_DEFS: Record<HomePageEntry, { title: string; desc: string; icon: React.ReactNode; className: string }> = {
  'single-setup': { title: '开始游戏', desc: '经典 · 无尽穿墙 · 极速', icon: <Gamepad2 size={30} />, className: 'card-cyan' },
  daily: { title: '每日挑战', desc: '每天一道全民同款谜题', icon: <CalendarDays size={30} />, className: 'card-gold' },
  'ai-lab': { title: 'AI 算法实验室', desc: 'BFS · A* · 安全 · 完美 AI', icon: <Brain size={30} />, className: 'card-violet' },
  tournament: { title: 'AI 锦标赛', desc: '三大算法同场竞技观赛', icon: <Crown size={30} />, className: 'card-pink' },
  'versus-setup': { title: '双人对战', desc: '本地竞技 · 限时赛 · 人机', icon: <Swords size={30} />, className: 'card-orange' },
  campaign: { title: 'Roguelike 战役', desc: '一条命 + 三选一增益', icon: <Flame size={30} />, className: 'card-red' },
  levels: { title: '关卡挑战', desc: '3 章节 · 15 关 · 三星评级', icon: <Trophy size={30} />, className: 'card-gold' },
  editor: { title: '地图编辑器', desc: '绘制 · 预设 · 导入导出', icon: <PencilRuler size={30} />, className: 'card-green' },
  achievements: { title: '成就中心', desc: '20 个徽章等你解锁', icon: <Award size={30} />, className: 'card-pink' },
  stats: { title: '游戏统计', desc: '最高分 · 战绩 · 历史记录', icon: <BarChart3 size={30} />, className: 'card-blue' },
  settings: { title: '设置', desc: '主题 · 音效 · 存档备份', icon: <SettingsIcon size={30} />, className: 'card-gray' },
}

export function HomePage({ onNavigate, entries }: { onNavigate: (entry: HomePageEntry) => void; entries: HomePageEntry[] }) {
  return (
    <div className="page home-page">
      <header className="home-hero">
        <div className="home-logo" aria-hidden="true">
          <MapIcon size={26} className="home-logo-snake" />
          <span>🐍</span>
        </div>
        <h1 className="home-title">Snake Lab</h1>
        <p className="home-subtitle">贪吃蛇实验室 —— 经典街机 × 算法实验 × 本地竞技 × 关卡挑战</p>
      </header>
      <nav className="home-grid" aria-label="功能导航">
        {entries.map((entry) => {
          const def = CARD_DEFS[entry]
          return (
            <button key={entry} className={`home-card ${def.className}`} onClick={() => onNavigate(entry)}>
              <span className="home-card-icon">{def.icon}</span>
              <span className="home-card-title">{def.title}</span>
              <span className="home-card-desc">{def.desc}</span>
            </button>
          )
        })}
      </nav>
      <footer className="home-footer">纯本地运行 · 数据保存在浏览器 localStorage · 无需网络</footer>
    </div>
  )
}
