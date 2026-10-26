# loop-guard (맴돌기 막기)

Claude가 같은 자리를 맴돌면 멈추게 한다. 모델을 부르지 않는다.

- 한 턴에 같은 셸 명령(Bash·PowerShell)이 `failLimit`번(기본 3) 실패하면 알린다. 그 명령이 한 번 성공하면 셈을 지운다.
- 한 턴에 이미 고친 코드를 `editLimit`번(기본 3) 다시 고치면 알린다. 한 파일의 다른 곳을 고치는 건 세지 않는다. Windows에서 슬래시나 대소문자만 다른 경로(`C:\a\b.ts`, `c:/a/b.ts`)는 같은 파일로 센다.
- 알림은 사람에게는 토스트, Claude에게는 도구 결과 뒤에 붙는 한 줄(원인을 다시 보고 다른 방법을 쓰거나 사용자에게 물으라는 말)이다. 한 맴돌기에 한 번만 알린다.
- 메인 대화와 서브에이전트를 따로 센다.

## 설치

```
/plugin install loop-guard --marketplace vananaHope/vanana-mods
```
