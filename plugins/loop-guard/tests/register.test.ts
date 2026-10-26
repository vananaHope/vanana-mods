import { expect, test } from 'claude-code/testing'

import type { On } from 'claude-code'

// 엔진의 테스트 호스트에서 hook을 실제 이벤트로 돌린다. 여기 on으로 다는 hook은 엔진 자리에 선다.
function standIn(on: On, toasts: string[], isError: boolean) {
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => (isError ? { result: {}, isError: true as const, text: 'boom' } : { result: {}, text: 'ok' }))
}

test('같은 명령이 세 번 실패하면 토스트를 띄우고 Claude에게 한 줄을 붙인다', async ($, on) => {
  const toasts: string[] = []
  standIn(on, toasts, true)
  await $.turn.start({ text: '고쳐줘', turnId: 'turn-1' })

  for (let i = 0; i < 2; i++) expect((await $.tool.call({ tool: 'Bash', command: 'npm test' })).context ?? []).toEqual([])
  const third = await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(third.context?.at(-1)).toContain('<loop-guard>The command `npm test` has now failed 3 times')
  expect(toasts).toEqual(['▲ 같은 명령이 3번 실패했습니다: npm test'])

  // 한 맴돌기에 한 번만, 새 턴이면 처음부터
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.start({ text: '다시', turnId: 'turn-2' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(toasts).toHaveLength(1)
})

test('editLimit 설정대로 같은 코드를 다시 고치면 알린다', { options: { editLimit: 2 } }, async ($, on) => {
  const toasts: string[] = []
  standIn(on, toasts, false)
  await $.turn.start({ text: '고쳐줘', turnId: 'turn-1' })
  const edit = (old_string: string, new_string: string) =>
    $.tool.call({ tool: 'Edit', file_path: 'C:\\repo\\x.ts', old_string, new_string } as never)

  await edit('unrelated line here', 'const answer = compute(1)')
  await edit('const answer = compute(1)', 'const answer = compute(2)')
  const ran = await edit('const answer = compute(2)', 'const answer = compute(1)')
  expect(ran.context?.at(-1)).toContain('<loop-guard>You have now rewritten code')
  expect(toasts).toEqual(['▲ x.ts: 이번 턴에 같은 코드를 2번 다시 고쳤습니다'])
})
