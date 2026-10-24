export type Todo = { id: string; text: string; isDone: boolean; isActive?: boolean }

/** isAuto: Claude가 올리지 않고 답의 마지막 질문을 mod가 옮겨 적은 것 */
export type Decision = { id: string; text: string; isAuto?: boolean }

export type Pin = { href: string; label: string }

declare module 'claude-code' {
  interface PluginState {
    board: {
      decisions: Shaped<Decision[]>
      todos: Shaped<Todo[]>
      links: Shaped<Pin[]>
    }
  }
}
