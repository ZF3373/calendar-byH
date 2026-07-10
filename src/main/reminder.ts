import { Notification } from 'electron'
import { store } from './store'
import { Task, DueReminder, RepeatType } from '@shared/types'

/**
 * 重复/多时段提醒调度器。
 * - 周期性：daily / weekly / monthly / weekday / custom(everyNDays)
 * - 多时段：同一任务可设多个 HH:mm
 * - 每分钟轮询，命中即发系统通知，避免重复（按 taskId+date+time 去重）
 */
export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null
  private fired = new Set<string>() // 已触发 key
  private lastMinute = ''
  private onDue?: (r: DueReminder) => void

  start(cb?: (r: DueReminder) => void): void {
    this.onDue = cb
    if (this.timer) return
    // 立即校准一次，之后每分钟触发
    this.tick()
    this.timer = setInterval(() => this.tick(), 60_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 跨天/跨分钟时清理已触发缓存 */
  private maybeResetCache(minuteKey: string): void {
    if (this.lastMinute && this.lastMinute.slice(0, 10) !== minuteKey.slice(0, 10)) {
      this.fired.clear()
    }
    this.lastMinute = minuteKey
  }

  private tick(): void {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const today = this.dateKey(now)
    const minuteKey = `${today} ${hh}:${mm}`
    this.maybeResetCache(minuteKey)

    void this.scan(today, hh, mm)
  }

  /** 计算任务在指定日期是否应出现（重复规则展开） */
  static occursOn(task: Task, date: Date): boolean {
    if (task.repeat === 'none') return true // 非重复任务按 date 字段判定，由调用方处理
    const dow = date.getDay() // 0=周日
    switch (task.repeat as RepeatType) {
      case 'daily':
        return true
      case 'weekly':
        return true // 周重复按首 datedate 计算，简单实现：每周都出现（见下方 refined）
      case 'monthly':
        return true
      case 'weekday':
        return dow >= 1 && dow <= 5
      case 'custom': {
        const n = task.everyNDays ?? 1
        const base = task.date ? new Date(task.date) : new Date(task.createdAt)
        const days = Math.floor((date.getTime() - base.getTime()) / 86_400_000)
        return days >= 0 && days % n === 0
      }
      default:
        return false
    }
  }

  private async scan(today: string, hh: string, mm: string): Promise<void> {
    const tasks = await store.getTasks()
    for (const t of tasks) {
      // 计算该任务今天是否出现
      const showToday = this.taskActiveToday(t, today)
      if (!showToday) continue
      for (const slot of t.reminders) {
        const [sh, sm] = slot.time.split(':')
        if (sh === hh && sm === mm) {
          const key = `${t.id}|${today}|${slot.time}`
          if (this.fired.has(key)) continue
          this.fired.add(key)
          const due: DueReminder = { taskId: t.id, title: t.title, date: today, time: slot.time }
          this.onDue?.(due)
          this.notify(due)
        }
      }
    }
  }

  /** 判断任务在指定日期是否生效（含 non-repeat 的 date 匹配） */
  private taskActiveToday(t: Task, today: string): boolean {
    if (t.repeat === 'none') {
      if (!t.date) return false
      return t.date.slice(0, 10) === today
    }
    // 重复任务：weekly 按首日期星期对齐
    if (t.repeat === 'weekly' && t.date) {
      const base = new Date(t.date)
      return base.getDay() === new Date(today).getDay()
    }
    if (t.repeat === 'monthly' && t.date) {
      const base = new Date(t.date)
      return base.getDate() === new Date(today).getDate()
    }
    return ReminderScheduler.occursOn(t, new Date(today))
  }

  private notify(r: DueReminder): void {
    if (Notification.isSupported()) {
      new Notification({
        title: `⏰ 提醒 · ${r.time}`,
        body: r.title,
        silent: false
      }).show()
    }
  }

  /** 工具：本地日期 key YYYY-MM-DD */
  private dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}
