// 같은 명령이 되풀이해 실패하거나 같은 코드를 거듭 다시 고치면, 사람에게는 토스트로, Claude에게는 도구 결과 뒤 한 줄로 알린다.
import type { EngineInterface, Register } from 'claude-code'

import { LoopWatch } from './loops.ts'
import type { Nudge } from './loops.ts'

type Options = { failLimit?: number; editLimit?: number }

/** 맴돌기를 알린다: 사람에게는 토스트, Claude에게는 도구 결과 뒤에 붙는 한 줄(사람에게는 보이지 않는다) */
function withNudge<T extends { context?: readonly string[] }>($: EngineInterface, ran: T, nudge: Nudge | undefined): T {
  if (!nudge) return ran
  $.ui.toast(`▲ ${nudge.toast}`, { timeoutMs: 9000 })
  return { ...ran, context: [...(ran.context ?? []), `<loop-guard>${nudge.note}</loop-guard>`] }
}

export const register: Register = (on, options) => {
  const { failLimit = 3, editLimit = 3 } = (options ?? {}) as Options
  const loops = new LoopWatch(Math.max(2, Number(failLimit) || 3), Math.max(2, Number(editLimit) || 3))

  on('turn.start', ($, e, next) => {
    loops.startTurn(e.agentId)
    return next(e)
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    return withNudge($, ran, loops.command(e.command, ran.isError === true, e.agentId))
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    const input = e as unknown as { file_path: string; old_string?: string; new_string?: string; content?: string }
    return withNudge($, ran, loops.edit(input.file_path, input.old_string, input.new_string ?? input.content ?? '', e.agentId))
  })
}
