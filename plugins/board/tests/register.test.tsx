import { expect, test } from 'claude-code/testing'

// 엔진의 테스트 호스트에서 hook을 실제 이벤트로 돌린다. 여기 on으로 다는 hook은 엔진 자리에 선다.
const PANE = {
  plugin: 'board',
  component: 'Pane',
  requestId: 'board',
  props: {
    title: '내 보드',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

import type { On } from 'claude-code'

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal'],
  tools: ['mcp__board__update'],
  outputStyle: { name: 'default', isKeepingCodingInstructions: true },
  traits: [],
} as const

function standIn(on: On) {
  on('command.register', () => ({ value: { command: 'board' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__board__update' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [] }))
}

const answer = (text: string) =>
  ({ answer: text, reason: 'answer', durationMs: 1, isAborted: false, turnId: 'turn-1' }) as const

test('Claude가 도구로 할 일을 올리면 보드와 시스템 프롬프트, 패널에 보인다', async ($, on) => {
  standIn(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'mcp__board__update', add_todos: '테스트 돌리기', start_todo: '"t1"' } as never)
  expect(ran.result).toBe('Board now:\nt1 [>] 테스트 돌리기')

  const { sections } = await $.prompt.compose(COMPOSE)
  expect(sections.at(-1)?.text).toContain('t1 [>] 테스트 돌리기')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /테스트 돌리기/ }))?.text).toContain('테스트 돌리기')
    await ui.unmount()
  }
})

test('없는 id를 가리키면 결과에 알려 준다', async ($, on) => {
  standIn(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.tool.call({ tool: 'mcp__board__update', done_todos: ['t9'] } as never)
  expect(String(ran.result)).toContain('Ignored ids not on the board: t9')
})

test('서브에이전트는 보드를 고치지 못한다', async ($, on) => {
  standIn(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.tool.call({ tool: 'mcp__board__update', add_todos: ['몰래'], agentId: 'a1' } as never)
  expect('deny' in ran && ran.deny).toBe('내 보드는 메인 대화만 고칩니다.')
  expect((await $.prompt.compose(COMPOSE)).sections.at(-1)?.text).toContain('Board is empty.')
})

test('답이 질문으로 끝나면 결정 칸에 옮기고, 사용자가 답하면 닫는다', async ($, on) => {
  standIn(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: '만들어줘', turnId: 'turn-1' })
  await $.turn.complete(answer('다 만들었습니다.\n\n다음에 무엇을 할까요? 후보는 이렇습니다.\n1. 삭제\n2. 필터\n\n제 추천은 1번입니다.'))
  expect((await $.prompt.compose(COMPOSE)).sections.at(-1)?.text).toContain('d1 [?] 다음에 무엇을 할까요?')

  await $.prompt.submit({ text: '1번', wait: false, origin: { kind: 'composer' } })
  expect((await $.prompt.compose(COMPOSE)).sections.at(-1)?.text).toContain('Board is empty.')

  // 닫힌 d1은 다시 쓰지 않는다
  await $.tool.call({ tool: 'mcp__board__update', open_decisions: ['배포할까요?'] } as never)
  expect((await $.prompt.compose(COMPOSE)).sections.at(-1)?.text).toContain('d2 [?] 배포할까요?')
})

test('Claude가 이번 턴에 결정을 올렸으면 마지막 질문을 따로 옮기지 않는다', async ($, on) => {
  standIn(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: '골라줘', turnId: 'turn-1' })
  await $.tool.call({ tool: 'mcp__board__update', open_decisions: ['A와 B 중 무엇으로 할까요?'] } as never)
  await $.turn.complete(answer('A와 B 중 무엇으로 할까요?'))
  const text = (await $.prompt.compose(COMPOSE)).sections.at(-1)?.text ?? ''
  expect(text).toContain('d1 [?] A와 B 중 무엇으로 할까요?')
  expect(text).not.toContain('d2')
})

test('무언가를 만든 명령의 링크만 패널에 모은다', async ($, on) => {
  standIn(on)
  on('tool.call', (_, e) => ({
    result: {},
    text:
      'command' in e && String(e.command).startsWith('gh pr create')
        ? 'https://github.com/me/repo/pull/12\n'
        : 'https://github.com/me/repo/pull/99 (조회만)\n',
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view 99' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(1)
  expect((await ui.find({ type: 'Link' }))?.text).toBe('repo PR #12')
  await ui.unmount()
})
