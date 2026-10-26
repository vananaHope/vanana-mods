# vanana-mods

Claude Code mod 모음. mod마다 따로 설치하고 따로 끌 수 있다. Claude Code 2.1.287 이상이 필요하다.

| mod | 하는 일 |
|---|---|
| [board](plugins/board) | 열린 결정, 할 일, 만든 링크(PR·이슈)를 옆 패널(`/board`)에 띄워 둔다. 답이 질문으로 끝나면 그 질문을 결정 칸에 옮긴다. |
| [loop-guard](plugins/loop-guard) | 한 턴에 같은 명령이 3번 실패하거나 이미 고친 코드를 3번 다시 고치면, 토스트로 알리고 Claude에게 멈추고 원인을 다시 보게 한다. |

## 설치

Claude Code 터미널 세션의 프롬프트에서:

```
/plugin install board --marketplace vananaHope/vanana-mods
/plugin install loop-guard --marketplace vananaHope/vanana-mods
```

처음에는 `Add marketplace?`에 `y`, 범위는 user(모든 세션)를 고른다.

셸에서:

```
claude plugin install board --marketplace vananaHope/vanana-mods
claude plugin install loop-guard --marketplace vananaHope/vanana-mods
```

데스크톱 앱에서는 프롬프트 옆 + → Plugins → Add marketplace에 `vananaHope/vanana-mods` → Add plugin.

업데이트: `claude plugin marketplace update vanana-mods` 뒤 `claude plugin update board@vanana-mods`(loop-guard도 같은 방식), 세션에서는 `/reload-plugins`.

## 새 mod 더하기

1. `plugins/<이름>/`에 `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts(x)`를 둔다.
2. `.claude-plugin/marketplace.json`의 `plugins`에 `{ "name": "<이름>", "source": "./plugins/<이름>" }`를 더한다.
3. `claude plugin validate .`과 `claude plugin test plugins/<이름>`으로 확인한다.

고칠 때마다 그 mod의 `plugin.json` `version`을 올려야 다른 컴퓨터의 `claude plugin update`가 새 버전을 받는다. PR마다 GitHub Actions(`.github/workflows/check.yml`)가 validate·test를 돌리고, 고친 mod의 version이 그대로면 실패한다.

가져온 코드는 [NOTICE.md](NOTICE.md).
