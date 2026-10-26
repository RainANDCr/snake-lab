/** Web Audio API 合成音效：首次用户交互后解锁，可静音与调音量 */
import { storage } from './storage'

class AudioService {
  private ctx: AudioContext | null = null
  private unlocked = false

  /** 在首次用户手势时调用（浏览器自动播放限制） */
  unlock(): void {
    if (this.unlocked) return
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.unlocked = true
    } catch {
      this.unlocked = true // 解锁失败也不再重试，游戏静音运行
    }
  }

  private beep(freq: number, durationSec: number, type: OscillatorType, delaySec = 0, gainScale = 1): void {
    const settings = storage.loadSettings()
    if (!settings.sound) return
    if (!this.ctx) return
    try {
      const t0 = this.ctx.currentTime + delaySec
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, t0)
      const vol = Math.max(0, Math.min(1, settings.volume)) * 0.18 * gainScale
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(t0)
      osc.stop(t0 + durationSec + 0.02)
    } catch {
      // 忽略音频错误
    }
  }

  eat(): void {
    this.beep(660, 0.08, 'square')
    this.beep(990, 0.1, 'square', 0.06)
  }
  specialEat(): void {
    this.beep(880, 0.08, 'triangle')
    this.beep(1174, 0.08, 'triangle', 0.06)
    this.beep(1568, 0.12, 'triangle', 0.12)
  }
  click(): void {
    this.beep(520, 0.05, 'triangle', 0, 0.6)
  }
  countdownTick(): void {
    this.beep(440, 0.09, 'sine', 0, 0.8)
  }
  countdownGo(): void {
    this.beep(880, 0.18, 'sine', 0, 0.9)
  }
  gameOver(): void {
    this.beep(330, 0.16, 'sawtooth')
    this.beep(247, 0.18, 'sawtooth', 0.14)
    this.beep(165, 0.3, 'sawtooth', 0.3)
  }
  win(): void {
    this.beep(523, 0.12, 'triangle')
    this.beep(659, 0.12, 'triangle', 0.1)
    this.beep(784, 0.12, 'triangle', 0.2)
    this.beep(1047, 0.25, 'triangle', 0.3)
  }
  powerup(): void {
    this.beep(740, 0.07, 'square')
    this.beep(1109, 0.12, 'square', 0.05)
  }
  achievement(): void {
    this.beep(659, 0.1, 'sine')
    this.beep(988, 0.14, 'sine', 0.09)
    this.beep(1319, 0.2, 'sine', 0.18)
  }
  shield(): void {
    this.beep(300, 0.15, 'sine', 0, 0.9)
    this.beep(420, 0.1, 'sine', 0.08)
  }
}

export const audio = new AudioService()
