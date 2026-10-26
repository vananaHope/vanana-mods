import { expect, test } from 'claude-code/testing'

import { addDecision, answerDecisions, applyUpdate, artifactPin, describeBoard, isMakingMcp, lastQuestion, mergePins, normalizeUpdate, unknownIds, urlPins } from '../hooks/board.ts'
import type { Board } from '../hooks/board.ts'

const EMPTY: Board = { todos: [], decisions: [], last: { t: 0, d: 0 } }

test('할 일을 더하고 시작하고 끝내면 진행 중 표시가 빠진다', () => {
  let board = applyUpdate(EMPTY, { add_todos: ['가', '나'], start_todo: 't1' })
  expect(board.todos.map(t => [t.id, t.isActive])).toEqual([['t1', true], ['t2', false]])
  board = applyUpdate(board, { done_todos: ['t1'] })
  expect(board.todos[0]).toEqual({ id: 't1', text: '가', isDone: true, isActive: false })
})

test('결정은 같은 글이면 하나만 열고, 닫은 뒤 번호는 이어 간다', () => {
  let board = addDecision(EMPTY, '병합할까요?', true)
  board = addDecision(board, '병합할까요?')
  expect(board.decisions).toEqual([{ id: 'd1', text: '병합할까요?', isAuto: true }])
  board = applyUpdate(board, { open_decisions: ['배포할까요?'], decide: [{ id: 'd1', answer: '네' }] })
  expect(board.decisions).toEqual([{ id: 'd2', text: '배포할까요?' }])
})

test('지운 번호는 다시 쓰지 않는다: 보드를 비워도 다음 id는 이어 간다', () => {
  let board = applyUpdate(EMPTY, { add_todos: ['가', '나', '다'], open_decisions: ['고를까요?'] })
  board = applyUpdate(board, { remove_todos: ['t3'], decide: [{ id: 'd1', answer: '네' }] })
  board = applyUpdate(board, { add_todos: ['라'], open_decisions: ['또 고를까요?'] })
  expect(board.todos.map(t => t.id)).toEqual(['t1', 't2', 't4'])
  expect(board.decisions.map(d => d.id)).toEqual(['d2'])
  // 이전 버전이 남긴 보드(last가 0)에서도 쓰고 있는 번호 다음부터 붙인다
  const old = applyUpdate({ ...EMPTY, todos: [{ id: 't7', text: '옛 일', isDone: false }] }, { add_todos: ['새 일'] })
  expect(old.todos.at(-1)?.id).toBe('t8')
})

test('입력을 스키마대로 거른다: 문자열 하나는 한 항목, 엉뚱한 값은 버린다', () => {
  expect(normalizeUpdate({ add_todos: '테스트 돌리기', done_todos: ['t1', 3, ' ', null] })).toEqual({
    add_todos: ['테스트 돌리기'],
    done_todos: ['t1'],
  })
  expect(normalizeUpdate({ decide: ['d1', { id: 'd2', answer: '네' }, { answer: 'id 없음' }], start_todo: 5 })).toEqual({
    decide: [{ id: 'd1', answer: '' }, { id: 'd2', answer: '네' }],
  })
  expect(normalizeUpdate(undefined)).toEqual({})
  // 실제 세션에서 Claude가 보낸 모양
  expect(normalizeUpdate({ done_todos: ['t1'], start_todo: '"t5"', decide: [{ id: "'d1'", answer: '네' }] })).toEqual({
    start_todo: 't5',
    done_todos: ['t1'],
    decide: [{ id: 'd1', answer: '네' }],
  })
  const board = applyUpdate(EMPTY, normalizeUpdate({ add_todos: 'abc' }))
  expect(board.todos).toHaveLength(1)
})

test('보드에 없는 id를 찾아 알려 준다: 방금 더한 것과 지운 것은 아는 id다', () => {
  const before = applyUpdate(EMPTY, { add_todos: ['가'] })
  const change = { add_todos: ['나'], start_todo: 't2', remove_todos: ['t1'], done_todos: ['t9'], decide: [{ id: 'd4', answer: '' }] }
  expect(unknownIds(before, applyUpdate(before, change), change)).toEqual(['t9', 'd4'])
})

test('답의 마지막 질문 줄을 찾는다: 한국어 물음표, 목록 기호, 코드 블록', () => {
  expect(lastQuestion('설명입니다.\n\n- **이 둘로 시작할까요?**')).toBe('이 둘로 시작할까요?')
  expect(lastQuestion('끝냈습니다.\n```\nif (a?) b\n```')).toBeUndefined()
  expect(lastQuestion('정말요？')).toBe('정말요？')
  expect(lastQuestion('질문?\n줄1\n줄2\n줄3')).toBeUndefined()
  expect(lastQuestion('3번만 돌리고 멈췄습니다. 모두 exit 2로 실패했습니다. 나머지 2번도 돌릴까요?')).toBe('나머지 2번도 돌릴까요?')
  expect(lastQuestion('1. 첫째 안으로 갈까요?')).toBe('첫째 안으로 갈까요?')
  expect(lastQuestion('괜찮을까요? 아무튼 끝냈습니다.')).toBeUndefined()
})

test('질문 뒤에 후보 목록이 오면 목록 위 줄의 질문을 찾는다', () => {
  const reply = '다 만들었습니다.\n\n다음에 무엇을 더 할까요? 후보는 아래와 같습니다.\n1. `delete` 명령 추가\n2. 마감일 필드\n3. 필터 옵션\n4. argparse로 전환\n5. 다른 방향'
  expect(lastQuestion(reply)).toBe('다음에 무엇을 더 할까요?')
  expect(lastQuestion('어느 쪽으로 갈까요?\n- A안\n- B안')).toBe('어느 쪽으로 갈까요?')
  expect(lastQuestion('바뀐 점:\n- 파일 둘\n- 테스트 하나')).toBeUndefined()
  // 목록 뒤에 추천 한 줄이 붙어도 찾는다(실제 세션의 답)
  expect(lastQuestion('다음에 무엇을 더 할까요? 후보는 이렇습니다.\n1. 삭제 명령\n2. 필터\n\n제 추천은 1번입니다. 가장 먼저 필요해집니다.')).toBe('다음에 무엇을 더 할까요?')
  expect(lastQuestion('어떻게 할까요?\n- A\n- B\n줄1\n줄2\n줄3')).toBeUndefined()
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

test('보드 글에는 끝난 할 일을 id만 한 줄로 적는다', () => {
  const board = applyUpdate(EMPTY, { add_todos: ['가', '나', '다'], start_todo: 't3', done_todos: ['t1', 't2'] })
  expect(describeBoard(board)).toBe('Board now:\nt3 [>] 다\nDone (2): t1, t2')
})

test('사용자가 답할 때마다 Claude가 올린 결정은 기다린 횟수가 늘고, 두 번이면 닫으라고 적는다', () => {
  let board = addDecision(addDecision(EMPTY, '배포할까요?'), '옮긴 질문?', true)
  board = { ...board, decisions: answerDecisions(board.decisions) }
  expect(board.decisions).toEqual([{ id: 'd1', text: '배포할까요?', waited: 1 }])
  expect(describeBoard(board)).not.toContain('decide it')
  board = { ...board, decisions: answerDecisions(board.decisions) }
  expect(describeBoard(board)).toContain('d1 [?] 배포할까요? (open across 2 user replies: decide it if already answered)')
})

test('Artifact 도구는 게시할 때만 링크를 남기고, 제목이나 파일 이름을 붙인다', () => {
  const text = 'Published https://claude.ai/code/artifact/0a1b-2c3d (private).'
  expect(artifactPin({ file_path: 'C:\\tmp\\report.html' }, text)).toEqual({
    href: 'https://claude.ai/code/artifact/0a1b-2c3d',
    label: '아티팩트 report',
  })
  expect(artifactPin({ action: 'publish', title: '주간 보고' }, text)?.label).toBe('아티팩트 주간 보고')
  expect(artifactPin({ action: 'read', url: 'x' }, text)).toBeUndefined()
  expect(artifactPin({ asset: true, file_path: 'a.png' }, text)).toBeUndefined()
  expect(artifactPin({}, 'no link here')).toBeUndefined()
})
