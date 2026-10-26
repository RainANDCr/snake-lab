/** 三套主题的 Canvas 配色（与 CSS 变量保持一致的设计语言） */
export interface ThemeColors {
  boardBg: string
  gridLine: string
  wall: string
  wallStroke: string
  food: string
  foodGlow: string
  specialFood: string
  snakeBody: string
  snakeHead: string
  deadSnake: string
  text: string
  explored: string
  frontier: string
  path: string
  powerups: Record<string, string>
}

export const THEME_COLORS: Record<'neon' | 'light' | 'pixel', ThemeColors> = {
  neon: {
    boardBg: '#0b1020',
    gridLine: 'rgba(94, 234, 212, 0.06)',
    wall: '#1e293b',
    wallStroke: '#334155',
    food: '#4ade80',
    foodGlow: 'rgba(74, 222, 128, 0.45)',
    specialFood: '#fbbf24',
    snakeBody: '#22d3ee',
    snakeHead: '#a5f3fc',
    deadSnake: '#475569',
    text: '#e2e8f0',
    explored: 'rgba(56, 189, 248, 0.14)',
    frontier: 'rgba(129, 140, 248, 0.30)',
    path: 'rgba(74, 222, 128, 0.55)',
    powerups: {
      speed: '#f472b6',
      slow: '#60a5fa',
      double: '#fbbf24',
      shield: '#34d399',
    },
  },
  light: {
    boardBg: '#f1f5f9',
    gridLine: 'rgba(100, 116, 139, 0.12)',
    wall: '#94a3b8',
    wallStroke: '#64748b',
    food: '#e11d48',
    foodGlow: 'rgba(225, 29, 72, 0.25)',
    specialFood: '#d97706',
    snakeBody: '#0ea5e9',
    snakeHead: '#0369a1',
    deadSnake: '#cbd5e1',
    text: '#0f172a',
    explored: 'rgba(14, 165, 233, 0.15)',
    frontier: 'rgba(99, 102, 241, 0.28)',
    path: 'rgba(225, 29, 72, 0.45)',
    powerups: {
      speed: '#db2777',
      slow: '#2563eb',
      double: '#d97706',
      shield: '#059669',
    },
  },
  pixel: {
    boardBg: '#101418',
    gridLine: 'rgba(74, 222, 128, 0.08)',
    wall: '#263238',
    wallStroke: '#4ade80',
    food: '#ff5252',
    foodGlow: 'rgba(255, 82, 82, 0.4)',
    specialFood: '#ffd740',
    snakeBody: '#4ade80',
    snakeHead: '#c8facc',
    deadSnake: '#455a64',
    text: '#c8facc',
    explored: 'rgba(74, 222, 128, 0.12)',
    frontier: 'rgba(255, 215, 64, 0.25)',
    path: 'rgba(255, 82, 82, 0.5)',
    powerups: {
      speed: '#ff4081',
      slow: '#448aff',
      double: '#ffd740',
      shield: '#69f0ae',
    },
  },
}

export type ThemeName = keyof typeof THEME_COLORS
