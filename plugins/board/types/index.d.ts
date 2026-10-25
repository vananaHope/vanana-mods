export type Todo = { id: string; text: string; isDone: boolean; isActive?: boolean }

/** isAuto: Claude가 올리지 않고 답의 마지막 질문을 mod가 옮겨 적은 것 */
export type Decision = { id: string; text: string; isAuto?: boolean }

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
    }
  }
}
