export type Todo = { id: string; text: string; isDone: boolean; isActive?: boolean }

/**
 * isAuto: Claude가 올리지 않고 답의 마지막 질문을 mod가 옮겨 적은 것.
 * waited: Claude가 올린 결정이 열린 뒤 사용자가 답을 보낸 횟수
 */
export type Decision = { id: string; text: string; isAuto?: boolean; waited?: number }

export type Pin = { href: string; label: string }

/** 할 일(t)과 결정(d)에 지금까지 붙인 가장 큰 번호 */
export type Ids = { t: number; d: number }

declare module 'claude-code' {
  interface PluginState {
    board: {
      decisions: Shaped<Decision[]>
      todos: Shaped<Todo[]>
      links: Shaped<Pin[]>
      last: Shaped<Ids>
      /** 패널에서 완료한 할 일을 펼쳐 보이는지 */
      showDone: Shaped<boolean>
    }
  }
}
