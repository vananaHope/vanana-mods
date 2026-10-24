import { expect, test } from 'claude-code/testing'

import { LoopWatch } from '../hooks/loops.ts'

test('같은 명령이 세 번 실패하면 한 번만 알리고, 성공하면 셈을 지운다', () => {
  const w = new LoopWatch(3, 3)
  expect(w.command('npm  test', true)).toBeUndefined()
  expect(w.command('npm test', true)).toBeUndefined()
  expect(w.command('npm test', true)?.toast).toContain('3번 실패')
  expect(w.command('npm test', true)).toBeUndefined()
  w.startTurn()
  w.command('npm test', true)
  w.command('npm test', false)
  expect(w.command('npm test', true)).toBeUndefined()
})

test('서브에이전트의 턴이 시작돼도 메인 대화의 셈은 남는다', () => {
  const w = new LoopWatch(2, 3)
  w.command('make', true)
  w.startTurn('agent-1')
  expect(w.command('make', true)?.toast).toContain('2번 실패')
  expect(w.command('make', true, 'agent-1')).toBeUndefined()
})

test('이번 턴에 고친 코드를 또 고치면 세고, 다른 곳을 고치는 건 세지 않는다', () => {
  const w = new LoopWatch(3, 2)
  const a = 'const answer = compute(1)'
  const b = 'const answer = compute(2)'
  w.edit('src/x.ts', 'unrelated line here', a)
  expect(w.edit('src/y.ts', 'another unrelated line', 'something else entirely')).toBeUndefined()
  expect(w.edit('src/x.ts', a, b)).toBeUndefined()
  expect(w.edit('src/x.ts', b, a)?.toast).toContain('x.ts')
})
