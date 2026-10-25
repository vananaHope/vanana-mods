// 보드의 순수 로직. sirkitree/pinboard(MIT, Jerad Bitner)의 방식을 바탕으로 고쳐 썼다.
import type { Decision, Ids, Pin, Todo } from '../types'

export type Update = {
  add_todos?: string[]
  start_todo?: string
  done_todos?: string[]
  remove_todos?: string[]
  open_decisions?: string[]
  decide?: { id: string; answer: string }[]
}

/** last: 지금까지 붙인 가장 큰 번호. 지운 번호를 다시 쓰지 않아서 Claude가 기억하는 옛 id가 새 항목을 가리키지 않는다 */
export type Board = { todos: Todo[]; decisions: Decision[]; last: Ids }

/** 쓰고 있는 번호와 지금까지 붙인 번호 중 가장 큰 것 다음 */
const nextNumber = (prefix: string, used: number, ids: string[]) =>
  Math.max(used, ...ids.map(id => Number(id.slice(prefix.length)) || 0)) + 1

const texts = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)

/** id는 따옴표를 걷어 낸다: 실제 세션에서 Claude가 start_todo에 "\"t5\""를 보냈다 */
const ids = (value: unknown): string[] => texts(value).map(x => x.replace(/^["'`]+|["'`]+$/g, '').trim()).filter(Boolean)

/**
 * 모델이 보낸 입력을 스키마대로 걸러 낸다. 배열 대신 문자열 하나를 보내면 한 항목으로 받는다
 * (그대로 돌면 글자마다 할 일이 생긴다). decide는 id 문자열만 보내도 받는다.
 */
export function normalizeUpdate(input: unknown): Update {
  const raw = (input ?? {}) as Record<string, unknown>
  const decide = (Array.isArray(raw.decide) ? raw.decide : [raw.decide]).flatMap(x => {
    const item = x as { id?: unknown; answer?: unknown } | null
    const [id] = ids(item && typeof item === 'object' ? item.id : x)
    if (!id) return []
    return [{ id, answer: item && typeof item === 'object' && typeof item.answer === 'string' ? item.answer : '' }]
  })
  const change: Update = {}
  const add = texts(raw.add_todos)
  const done = ids(raw.done_todos)
  const remove = ids(raw.remove_todos)
  const open = texts(raw.open_decisions)
  const [start] = ids(raw.start_todo)
  if (add.length) change.add_todos = add
  if (start) change.start_todo = start
  if (done.length) change.done_todos = done
  if (remove.length) change.remove_todos = remove
  if (open.length) change.open_decisions = open
  if (decide.length) change.decide = decide
  return change
}

export function applyUpdate(board: Board, change: Update): Board {
  let { todos: t, decisions: d, last } = board
  for (const text of change.add_todos ?? []) {
    const n = nextNumber('t', last.t, t.map(x => x.id))
    last = { ...last, t: n }
    t = [...t, { id: `t${n}`, text, isDone: false }]
  }
  for (const text of change.open_decisions ?? []) ({ decisions: d, last } = addDecision({ todos: t, decisions: d, last }, text))
  const done = new Set(change.done_todos ?? [])
  const removed = new Set(change.remove_todos ?? [])
  const decided = new Set((change.decide ?? []).map(x => x.id))
  t = t.filter(x => !removed.has(x.id)).map(x => (done.has(x.id) ? { ...x, isDone: true } : x))
  // 진행 중은 한 번에 하나이고, 끝난 할 일은 진행 중에서 빠진다
  if (change.start_todo) t = t.map(x => ({ ...x, isActive: x.id === change.start_todo }))
  t = t.map(x => (x.isDone && x.isActive ? { ...x, isActive: false } : x))
  d = d.filter(x => !decided.has(x.id))
  return { todos: t, decisions: d, last }
}

/** 이 변경이 가리켰지만 보드에 없는 id: Claude에게 알려서 옛 id로 헛짚었음을 알게 한다 */
export function unknownIds(before: Board, after: Board, change: Update): string[] {
  const todoIds = new Set([...before.todos, ...after.todos].map(x => x.id))
  const decisionIds = new Set([...before.decisions, ...after.decisions].map(x => x.id))
  return [
    ...[change.start_todo ?? [], change.done_todos ?? [], change.remove_todos ?? []].flat().filter(id => !todoIds.has(id)),
    ...(change.decide ?? []).map(x => x.id).filter(id => !decisionIds.has(id)),
  ].filter((id, i, all) => all.indexOf(id) === i)
}

/** 같은 글의 결정이 이미 열려 있으면 그대로 둔다 */
export function addDecision(board: Board, text: string, isAuto = false): Board {
  if (board.decisions.some(x => x.text === text)) return board
  const n = nextNumber('d', board.last.d, board.decisions.map(x => x.id))
  const decision: Decision = { id: `d${n}`, text }
  return { ...board, decisions: [...board.decisions, isAuto ? { ...decision, isAuto } : decision], last: { ...board.last, d: n } }
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

const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+/
const sentencesOf = (line: string) => line.split(/(?<=[.!?。？])\s+/)

/**
 * "…할까요? 후보는 이렇습니다." 다음에 후보 목록(두 항목 이상)이 오고, 그 뒤에 추천 같은 짧은 줄이
 * 두 줄까지 붙는 답: 목록 바로 위 줄을 돌려준다. 실제 세션의 답이 이렇게 끝났다.
 */
function lineAboveOptions(lines: string[]): string | undefined {
  for (let skip = 0; skip <= 2; skip++) {
    const end = lines.length - skip
    const after = lines.slice(end)
    if (after.some(l => LIST_ITEM.test(l) || isQuestion(l))) return undefined
    let start = end
    while (start > 0 && LIST_ITEM.test(lines[start - 1] ?? '') && !isQuestion(lines[start - 1] ?? '')) start--
    if (end - start >= 2) {
      const above = lines[start - 1]
      return above !== undefined && sentencesOf(above).some(isQuestion) ? above : undefined
    }
  }
  return undefined
}

/**
 * 답이 사용자에게 묻고 끝나면 그 질문 문장을 돌려준다. 코드 블록은 빼고, 마지막 세 줄 중 물음표로 끝나는 줄이나
 * 끝의 후보 목록 바로 위 줄을 본다. 한 줄에 여러 문장이 있으면 물음표로 끝나는 마지막 문장만 쓰고,
 * 목록 기호와 굵게 표시는 걷어 내고, 너무 길면 자른다.
 */
export function lastQuestion(reply: string): string | undefined {
  const lines = reply.replace(/```[\s\S]*?```/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  const line = lines.slice(-3).reverse().find(isQuestion) ?? lineAboveOptions(lines)
  if (!line) return undefined
  const sentence = sentencesOf(line).reverse().find(isQuestion) ?? line
  const text = sentence.replace(LIST_ITEM, '').replace(/^>\s+/, '').replace(/\*\*|__|`/g, '').trim()
  return text.length > 200 ? text.slice(0, 199) + '…' : text
}

const isQuestion = (text: string) => /[?？][*_`)"'\]]*$/.test(text)

// 무언가를 만드는 명령과 MCP 도구에서만 링크를 모은다. 읽기·조회 결과의 URL은 건너뛴다.
export const MAKES_COMMAND = /\bgh\s+(?:(?:pr|issue|release|repo|gist)\s+create|(?:pr|issue)\s+comment)\b|\bgit\s+push\b/
const MAKES_MCP = /create|draft|send|publish|share|canvas|upload/i
const READS_MCP = /(?:^|[_-])(?:read|get|list|search|fetch|query|download)(?:[_-]|$)/i

/** 서버 이름은 빼고 도구 이름만 본다: slack_read_canvas, list-shared-pages 같은 읽기 도구는 건너뛴다 */
export function isMakingMcp(tool: string): boolean {
  const name = /^mcp__.+?__(.+)$/.exec(tool)?.[1]
  return name !== undefined && MAKES_MCP.test(name) && !READS_MCP.test(name)
}

const URL = /https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9\-._~:/?#[\]!$&'()*+,;=%@]*)?/g

export const urlPins = (text: string): Pin[] =>
  [...new Set([...text.matchAll(URL)].map(m => m[0].replace(/[)\].,;:'!?*]+$/, '')))]
    // git push가 찍는 저장소 주소(…/repo.git)는 만든 것이 아니다
    .filter(href => !href.includes('@') && !/\.git$/.test(href) && href.length <= 2048)
    .map(href => {
      const gh = /github\.com\/[^/]+\/([^/]+)\/(pull|issues)\/(\d+)/.exec(href)
      return { href, label: gh ? `${gh[1]} ${gh[2] === 'pull' ? 'PR' : '이슈'} #${gh[3]}` : href.slice(8) }
    })

/** 새 링크를 앞에, 같은 주소는 하나만, 최대 12개 */
export const mergePins = (old: Pin[], found: Pin[]): Pin[] =>
  [...found, ...old.filter(p => !found.some(f => f.href === p.href))].slice(0, 12)
