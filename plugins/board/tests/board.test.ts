import { expect, test } from 'claude-code/testing'

import { addDecision, applyUpdate, isMakingMcp, lastQuestion, mergePins, urlPins } from '../hooks/board.ts'

test('할 일을 더하고 시작하고 끝내면 진행 중 표시가 빠진다', () => {
  let board = applyUpdate({ todos: [], decisions: [] }, { add_todos: ['가', '나'], start_todo: 't1' })
  expect(board.todos.map(t => [t.id, t.isActive])).toEqual([['t1', true], ['t2', false]])
  board = applyUpdate(board, { done_todos: ['t1'] })
  expect(board.todos[0]).toEqual({ id: 't1', text: '가', isDone: true, isActive: false })
})

test('결정은 같은 글이면 하나만 열고, 닫은 뒤 번호는 이어 간다', () => {
  let d = addDecision([], '병합할까요?', true)
  d = addDecision(d, '병합할까요?')
  expect(d).toEqual([{ id: 'd1', text: '병합할까요?', isAuto: true }])
  const board = applyUpdate({ todos: [], decisions: d }, { open_decisions: ['배포할까요?'], decide: [{ id: 'd1', answer: '네' }] })
  expect(board.decisions).toEqual([{ id: 'd2', text: '배포할까요?' }])
})

test('답의 마지막 질문 줄을 찾는다: 한국어 물음표, 목록 기호, 코드 블록', () => {
  expect(lastQuestion('설명입니다.\n\n- **이 둘로 시작할까요?**')).toBe('이 둘로 시작할까요?')
  expect(lastQuestion('끝냈습니다.\n```\nif (a?) b\n```')).toBeUndefined()
  expect(lastQuestion('정말요？')).toBe('정말요？')
  expect(lastQuestion('질문?\n줄1\n줄2\n줄3')).toBeUndefined()
  expect(lastQuestion('3번만 돌리고 멈췄습니다. 모두 exit 2로 실패했습니다. 나머지 2번도 돌릴까요?')).toBe('나머지 2번도 돌릴까요?')
  expect(lastQuestion('1. 첫째 안으로 갈까요?')).toBe('첫째 안으로 갈까요?')
})

test('링크는 GitHub PR·이슈에 짧은 이름을 붙이고 같은 주소는 하나만 남긴다', () => {
  const found = urlPins('Created https://github.com/me/repo/pull/12.')
  expect(found).toEqual([{ href: 'https://github.com/me/repo/pull/12', label: 'repo PR #12' }])
  expect(mergePins(found, found)).toHaveLength(1)
})

test('git push 결과의 저장소 주소(.git)는 링크로 모으지 않는다', () => {
  const out = 'remote:   https://github.com/me/repo/pull/new/fix\nTo https://github.com/me/repo.git\n'
  expect(urlPins(out).map(p => p.href)).toEqual(['https://github.com/me/repo/pull/new/fix'])
})

test('만드는 MCP 도구만 링크를 모은다: 읽기 도구와 서버 이름은 보지 않는다', () => {
  expect(isMakingMcp('mcp__github__create_pull_request')).toBe(true)
  expect(isMakingMcp('mcp__Slack__slack_send_message')).toBe(true)
  expect(isMakingMcp('mcp__Notion__notion-create-file-upload')).toBe(true)
  expect(isMakingMcp('mcp__Slack__slack_read_canvas')).toBe(false)
  expect(isMakingMcp('mcp__Notion__notion-list-shared-pages')).toBe(false)
  expect(isMakingMcp('mcp__share-tools__get_status')).toBe(false)
  expect(isMakingMcp('mcp__board__update')).toBe(false)
  expect(isMakingMcp('Bash')).toBe(false)
})
