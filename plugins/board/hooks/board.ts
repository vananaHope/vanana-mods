// 보드의 순수 로직. sirkitree/pinboard(MIT, Jerad Bitner)의 방식을 바탕으로 고쳐 썼다.
import type { Decision, Pin, Todo } from '../types'

export type Update = {
  add_todos?: string[]
  start_todo?: string
  done_todos?: string[]
  remove_todos?: string[]
  open_decisions?: string[]
  decide?: { id: string; answer: string }[]
}

export type Board = { todos: Todo[]; decisions: Decision[] }

/** 접두어별 다음 id: 쓰고 있는 가장 큰 번호 다음 */
const nextId = (prefix: string, ids: string[]) =>
  prefix + (Math.max(0, ...ids.map(id => Number(id.slice(prefix.length)) || 0)) + 1)

export function applyUpdate(board: Board, change: Update): Board {
  let { todos: t, decisions: d } = board
  for (const text of change.add_todos ?? []) t = [...t, { id: nextId('t', t.map(x => x.id)), text, isDone: false }]
  for (const text of change.open_decisions ?? []) d = addDecision(d, text)
  const done = new Set(change.done_todos ?? [])
  const removed = new Set(change.remove_todos ?? [])
  const decided = new Set((change.decide ?? []).map(x => x.id))
  t = t.filter(x => !removed.has(x.id)).map(x => (done.has(x.id) ? { ...x, isDone: true } : x))
  // 진행 중은 한 번에 하나이고, 끝난 할 일은 진행 중에서 빠진다
  if (change.start_todo) t = t.map(x => ({ ...x, isActive: x.id === change.start_todo }))
  t = t.map(x => (x.isDone && x.isActive ? { ...x, isActive: false } : x))
  d = d.filter(x => !decided.has(x.id))
  return { todos: t, decisions: d }
}

/** 같은 글의 결정이 이미 열려 있으면 그대로 둔다 */
export function addDecision(decisions: Decision[], text: string, isAuto = false): Decision[] {
  if (decisions.some(x => x.text === text)) return decisions
  const decision: Decision = { id: nextId('d', decisions.map(x => x.id)), text }
  return [...decisions, isAuto ? { ...decision, isAuto } : decision]
}

export function describeBoard(board: Board): string {
  if (board.todos.length + board.decisions.length === 0) return 'Board is empty.'
  return [
    'Board now:',
    ...board.todos.map(t => `${t.id} [${t.isDone ? 'x' : t.isActive ? '>' : ' '}] ${t.text}`),
    ...board.decisions.map(d => `${d.id} [?] ${d.text}`),
  ].join('\n')
}

/** 바뀐 내용을 한 줄로: 대화에 남는 흐린 줄 */
export function summarize(change: Update): string {
  const parts = [
    change.add_todos?.length && `할 일 +${change.add_todos.length}`,
    change.start_todo && `${change.start_todo} 시작`,
    change.done_todos?.length && `${change.done_todos.length}개 완료`,
    change.remove_todos?.length && `할 일 -${change.remove_todos.length}`,
    change.open_decisions?.length && `결정 +${change.open_decisions.length}`,
    change.decide?.length && `결정 ${change.decide.length}개 닫음`,
  ].filter(Boolean)
  return '내 보드: ' + (parts.join(', ') || '바뀐 것 없음')
}

/**
 * 답이 사용자에게 묻고 끝나면 그 질문 문장을 돌려준다. 코드 블록은 빼고 마지막 세 줄만 본다.
 * 한 줄에 여러 문장이 있으면 마지막 문장만 쓰고, 목록 기호와 굵게 표시는 걷어 내고, 너무 길면 자른다.
 */
export function lastQuestion(reply: string): string | undefined {
  const prose = reply.replace(/```[\s\S]*?```/g, '')
  const lines = prose.split('\n').map(l => l.trim()).filter(Boolean).slice(-3)
  const line = [...lines].reverse().find(l => /[?？][*_`)"'\]]*$/.test(l))
  if (!line) return undefined
  const sentence = line.split(/(?<=[.!。])\s+/).at(-1) ?? line
  const text = sentence.replace(/^(?:[-*+>]|\d+[.)])\s+/, '').replace(/\*\*|__|`/g, '').trim()
  return text.length > 200 ? text.slice(0, 199) + '…' : text
}

// 무언가를 만드는 명령과 MCP 도구에서만 링크를 모은다. 읽기·조회 결과의 URL은 건너뛴다.
export const MAKES_COMMAND = /\bgh\s+(?:(?:pr|issue|release|repo|gist)\s+create|(?:pr|issue)\s+comment)\b|\bgit\s+push\b/
export const MAKES_MCP = /^mcp__.*(?:create|draft|send|publish|share|canvas|upload)/i

const URL = /https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9\-._~:/?#[\]!$&'()*+,;=%@]*)?/g

export const urlPins = (text: string): Pin[] =>
  [...new Set([...text.matchAll(URL)].map(m => m[0].replace(/[)\].,;:'!?*]+$/, '')))]
    .filter(href => !href.includes('@') && href.length <= 2048)
    .map(href => {
      const gh = /github\.com\/[^/]+\/([^/]+)\/(pull|issues)\/(\d+)/.exec(href)
      return { href, label: gh ? `${gh[1]} ${gh[2] === 'pull' ? 'PR' : '이슈'} #${gh[3]}` : href.slice(8) }
    })

/** 새 링크를 앞에, 같은 주소는 하나만, 최대 12개 */
export const mergePins = (old: Pin[], found: Pin[]): Pin[] =>
  [...found, ...old.filter(p => !found.some(f => f.href === p.href))].slice(0, 12)
