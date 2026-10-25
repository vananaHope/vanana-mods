import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Decision, Pin, Todo } from '../types'
import { addDecision, applyUpdate, describeBoard, isMakingMcp, lastQuestion, MAKES_COMMAND, mergePins, summarize, urlPins } from './board.ts'
import type { Board, Update } from './board.ts'

const PANE = 'board'
const TITLE = '내 보드'
const TOOL = 'mcp__board__update'
/** Windows의 PowerShell 도구는 다른 플랫폼의 타입에 없어서 이름 대신 정규식으로 맞춘다 */
const SHELLS = /^(?:Bash|PowerShell)$/

const decisions = atom({ plugin: 'board', key: 'decisions' } as const, [] as Decision[], { shape: 'decisions-1' })
const todos = atom({ plugin: 'board', key: 'todos' } as const, [] as Todo[], { shape: 'todos-1' })
const links = atom({ plugin: 'board', key: 'links' } as const, [] as Pin[], { shape: 'links-1' })

// Pinboard와 달리 "질문은 전부 올려라"를 넣지 않는다. 답의 마지막 질문은 mod가 직접 옮겨 적는다.
const DESCRIPTION = [
  "Keep the session's task list and open decisions on the user's board, a sidebar that stays in view while the transcript scrolls.",
  'Use it in place of writing task lists in your reply whenever the work takes 3+ distinct steps or the user gives new instructions.',
  'add_todos: one action per item. start_todo: the todo id you are working on now; exactly one is in progress at a time. done_todos / remove_todos: todo ids.',
  'Update in real time; do not batch completions. Mark a todo done only after the work is actually done, including any verification it needs, never based on intent.',
  'If blocked or partly done, leave it in progress and add a follow-up todo describing the blocker.',
  'open_decisions: questions that need the user to choose. decide: close a decision by id once the user has answered it, including ones you did not open yourself.',
  'The current board, with ids, is at the end of your system prompt.',
].join(' ')

const strings = { type: 'array', items: { type: 'string' } }
const SCHEMA = {
  type: 'object',
  properties: {
    add_todos: strings,
    start_todo: { type: 'string' },
    done_todos: strings,
    remove_todos: strings,
    open_decisions: strings,
    decide: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, answer: { type: 'string' } }, required: ['id', 'answer'] },
    },
  },
}

type Options = { autoOpen?: boolean }

const readBoard = async ($: EngineInterface): Promise<Board> => ({ todos: await read($, todos), decisions: await read($, decisions) })

const isEmpty = async ($: EngineInterface) =>
  (await read($, decisions)).length + (await read($, todos)).length + (await read($, links)).length === 0

const runtime = { autoOpen: false }

/** 바꾸고, 설정이 켜져 있으면 빈 보드에 처음 생긴 항목에 패널을 연다 */
async function capture($: EngineInterface, change: () => Promise<unknown>): Promise<void> {
  const wasEmpty = runtime.autoOpen && (await isEmpty($))
  await change()
  if (wasEmpty && !(await isEmpty($))) await $.ui.open({ id: PANE, title: TITLE })
}

/** 보이면 닫고, 아니면 연다. 열었으면 true */
async function togglePane($: EngineInterface): Promise<boolean> {
  const pane = (await $.ui.panes()).find(item => item.id === PANE)
  const wasOpen = !!pane && pane.isShown && pane.isPlaced
  if (wasOpen) await $.ui.close({ id: PANE })
  else await $.ui.open({ id: PANE, title: TITLE })
  return !wasOpen
}

export const register: Register = (on, options) => {
  const { autoOpen = false } = (options ?? {}) as Options
  runtime.autoOpen = autoOpen === true
  // 이번 턴에 Claude가 결정을 직접 올렸으면 마지막 질문을 따로 옮기지 않는다
  let pinnedThisTurn = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: '열린 결정·할 일·링크 패널 열기·닫기', immediate: true })
    // ToolSearch 뒤에 두면 Claude가 스키마를 먼저 불러와야 해서 잘 쓰지 않는다: 처음부터 도구 목록에 둔다
    await $.tool.register({ name: 'update', description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => ({ text: (await togglePane($)) ? '내 보드를 열었습니다.' : '내 보드를 닫았습니다.' }))

  // 보드는 시스템 프롬프트 끝(캐시 경계 뒤)에 붙어서 답에 목록을 되풀이할 필요가 없다
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return { sections: [...sections, { id: 'board:board', text: describeBoard(await readBoard($)), scope: 'session' }] }
  })

  // 답에서 옮긴 질문은 사용자가 다음 말을 하면 닫는다: Claude는 도구를 따로 불러 닫지 않는다(시험에서 확인)
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && e.text.trim()) {
      await update($, decisions, old => (old.some(d => d.isAuto) ? old.filter(d => !d.isAuto) : old)).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (!e.agentId) pinnedThisTurn = false
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (e.agentId) return { deny: '내 보드는 메인 대화만 고칩니다.' }
    const change = e as Update
    if (change.open_decisions?.length) pinnedThisTurn = true
    let board: Board = { todos: [], decisions: [] }
    await capture($, async () => {
      board = applyUpdate(await readBoard($), change)
      await update($, todos, () => board.todos)
      await update($, decisions, () => board.decisions)
    })
    return { result: describeBoard(board) }
  })

  // Pinboard의 Stop hook처럼 Claude를 되돌려 보내지 않는다(턴이 하나 더 들고 "Stop hook error"가 뜬다).
  // 답이 질문으로 끝나면 그 줄을 결정 칸에 직접 옮긴다: 모델 호출 없음.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId || e.reason !== 'answer' || pinnedThisTurn) return done
    const question = lastQuestion(e.answer)
    if (question) await capture($, () => update($, decisions, old => addDecision(old, question, true)))
    return done
  })

  // 무언가를 만든 명령(gh pr create, git push 등)이면 그 결과의 링크를 모은다
  on('tool.call', { tool: SHELLS }, async ($, e, next) => {
    const ran = await next(e)
    const command = 'command' in e && typeof e.command === 'string' ? e.command : ''
    if (ran.deny !== undefined || ran.isError === true || e.agentId || !MAKES_COMMAND.test(command)) return ran
    const found = urlPins(ran.text ?? '')
    if (found.length > 0 && found.length <= 3) await capture($, () => update($, links, old => mergePins(old, found)))
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId || !isMakingMcp(e.tool) || !('text' in ran) || ran.isError) return ran
    const found = urlPins(ran.text ?? '')
    if (found.length > 0 && found.length <= 3) await capture($, () => update($, links, old => mergePins(old, found)))
    return ran
  })

  // 보드 갱신은 대화에 흐린 한 줄로만 남고, 보드 자체는 패널에 있다
  on('ui.render', { component: 'ToolUse', props: { tool: TOOL } }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{summarize((e.props.input ?? {}) as Update)}</Text>
  })

  on('ui.render', { component: 'ToolResult', props: { tool: TOOL } }, async ($, e, next) =>
    e.props.isErrored ? next(e) : $.ui.resolve(e).Text({ children: [''] }),
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    // 사방에 한 칸씩 여백
    const inner = Math.max(10, e.props.bodyColumns - 2)
    const allDecisions = await read($, decisions)
    const allTodos = await read($, todos)
    const allLinks = await read($, links)
    const doneCount = allTodos.filter(t => t.isDone).length

    const header = (title: string, count: string) => (
      <Text bold>
        {title} <Text dimColor>{count}</Text>
      </Text>
    )
    const empty = (text: string) => <Text dimColor>  {text}</Text>
    // 기호는 따로 한 칸을 차지해서 줄이 넘어가도 글 아래로 들여 쓴다
    const item = (bullet: string, text: string, isDim = false, color?: string) => (
      <Box flexDirection="row" width={inner}>
        <Text dimColor={isDim} color={color}>{'  ' + bullet + ' '}</Text>
        <Box flexShrink={1} flexGrow={1}>
          <Text dimColor={isDim} color={color} wrap="wrap">
            {text}
          </Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" width={inner + 2} padding={1}>
        {header('열린 결정', allDecisions.length ? String(allDecisions.length) : '')}
        {allDecisions.length === 0 && empty('기다리는 결정이 없습니다.')}
        {allDecisions.map(d => item('?', d.isAuto ? `${d.text} (답에서 옮김)` : d.text))}
        <Text> </Text>

        {header('할 일', allTodos.length ? `${doneCount}/${allTodos.length}` : '')}
        {allTodos.length === 0 && empty('아직 할 일이 없습니다.')}
        {allTodos.filter(t => !t.isDone).map(t => (t.isActive ? item('▸', t.text, false, 'warning') : item('○', t.text)))}
        {/* 끝난 할 일은 한 줄로 접어서 남은 일이 위에 있게 */}
        {doneCount > 0 && <Text dimColor>{`  ✓ ${doneCount}개 완료`}</Text>}
        <Text> </Text>

        <Box flexDirection="row" justifyContent="space-between" width={inner}>
          {header('링크', allLinks.length ? String(allLinks.length) : '')}
          <Button key="clear-links" label="비우기" hotkey="l" plain dimColor onPress={() => update($, links, () => [])} />
        </Box>
        {allLinks.length === 0 && empty('아직 만든 것이 없습니다.')}
        {allLinks.map(p => (
          <Text wrap="truncate-middle">
            {'  '}
            <Link href={p.href} label={p.label} />
          </Text>
        ))}
        <Text> </Text>
        <Box flexDirection="row" width={inner}>
          <Button key="clear-done" label="완료 지우기" hotkey="c" plain dimColor onPress={() => update($, todos, old => old.filter(t => !t.isDone))} />
          <Text> </Text>
          <Button key="clear-decisions" label="결정 모두 닫기" hotkey="x" plain dimColor onPress={() => update($, decisions, () => [])} />
        </Box>
      </Box>
    )
  })
}
