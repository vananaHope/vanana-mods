// 같은 자리를 맴도는지 세는 순수 로직. mishgoldenberg/claude-mods의 loop-breaker(MIT, Michael Goldenberg)를 바탕으로 고쳐 썼다.
// 바꾼 점: 메인 대화와 서브에이전트를 따로 센다. 한 쪽의 턴이 시작돼도 다른 쪽 셈은 지우지 않는다.

/** 12자 이상인 의미 있는 줄만: 괄호나 빈 줄이 겹친다고 같은 코드로 보지 않는다 */
const lines = (text: string) => text.split('\n').map(l => l.trim()).filter(l => l.length >= 12)

export const normCommand = (command: string) => command.replace(/\s+/g, ' ').trim().slice(0, 300)

type Loop = {
  failures: Map<string, number>
  reworks: Map<string, number>
  written: Map<string, Set<string>>
  nudged: Set<string>
}

const fresh = (): Loop => ({ failures: new Map(), reworks: new Map(), written: new Map(), nudged: new Set() })

export type Nudge = { toast: string; note: string }

export class LoopWatch {
  private loops = new Map<string, Loop>()

  constructor(private failLimit: number, private editLimit: number) {}

  private loop(agentId?: string): Loop {
    const key = agentId ?? 'main'
    let loop = this.loops.get(key)
    if (!loop) this.loops.set(key, (loop = fresh()))
    return loop
  }

  /** 그 대화의 새 턴: 셈을 처음부터 */
  startTurn(agentId?: string) {
    this.loops.set(agentId ?? 'main', fresh())
  }

  /** 한 번 알린 맴돌기는 그 턴에 다시 알리지 않는다 */
  private once(loop: Loop, id: string, nudge: Nudge): Nudge | undefined {
    if (loop.nudged.has(id)) return undefined
    loop.nudged.add(id)
    return nudge
  }

  command(command: string, isError: boolean, agentId?: string): Nudge | undefined {
    const loop = this.loop(agentId)
    const key = normCommand(command)
    if (!isError) {
      loop.failures.delete(key)
      return undefined
    }
    const n = (loop.failures.get(key) ?? 0) + 1
    loop.failures.set(key, n)
    if (n < this.failLimit) return undefined
    return this.once(loop, `fail:${key}`, {
      toast: `같은 명령이 ${n}번 실패했습니다: ${key.slice(0, 50)}`,
      note:
        `The command \`${key.slice(0, 200)}\` has now failed ${n} times this turn. Stop retrying it. ` +
        'Re-read the full error output, state the root cause in one sentence, and either try a genuinely different approach or ask the user.',
    })
  }

  /** old: Edit의 old_string(Write면 undefined), next: 새로 쓴 내용 */
  edit(path: string, old: string | undefined, next: string, agentId?: string): Nudge | undefined {
    const loop = this.loop(agentId)
    const seen = loop.written.get(path)
    // 한 파일의 여러 곳을 고치는 건 계획이고, 이번 턴에 이미 고친 코드를 또 고치는 건 맴돌기다
    const isRework = seen !== undefined && (old === undefined || lines(old).some(l => seen.has(l)))
    loop.written.set(path, new Set([...(seen ?? []), ...lines(next)]))
    if (!isRework) return undefined
    const n = (loop.reworks.get(path) ?? 0) + 1
    loop.reworks.set(path, n)
    if (n < this.editLimit) return undefined
    const name = path.split(/[\\/]/).at(-1) ?? path
    return this.once(loop, `edit:${path}`, {
      toast: `${name}: 이번 턴에 같은 코드를 ${n}번 다시 고쳤습니다`,
      note:
        `You have now rewritten code you already changed in ${path} ${n} times this turn. ` +
        "Pause: re-read the whole file as it is now, work out why the earlier attempts didn't hold, and make one deliberate change instead of more patches.",
    })
  }
}
