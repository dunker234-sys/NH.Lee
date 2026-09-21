# mobile — 근로자용 모바일 앱 (STEP 5-A)

React Native(Expo, EAS dev client 전제) 앱. 전체 설계 근거는
`.claude/plans/bubbly-marinating-balloon.md`(계획서)를 참고 — 이 문서는
실행 방법과 알려진 제약만 정리한다.

## 실행

```bash
pnpm install                      # 저장소 루트에서
cd apps/mobile
pnpm start                        # Expo dev server
pnpm android / pnpm ios / pnpm web
```

- `EXPO_PUBLIC_API_BASE_URL` 환경변수로 `apps/api` 주소를 지정한다(기본
  `http://localhost:3000`). 실기기/에뮬레이터에서 `localhost`는 개발 머신을
  가리키지 않으므로 LAN IP를 써야 한다.
- **Expo Go로는 실행할 수 없다** — NFC(`react-native-nfc-manager`), SQLite,
  카메라 등 커스텀 네이티브 모듈이 필요해 EAS dev client 빌드가 전제다
  (`TECH_STACK.md`).

## 알려진 제약 (구현 시점 기준)

- **EAS 자격증명 미보유**: 실기기 빌드·TestFlight 배포에는 Apple Developer
  Program 계정과 Firebase/FCM 프로젝트가 필요하다 — 이 저장소 작업만으로는
  준비할 수 없다. 시뮬레이터/에뮬레이터 빌드(`expo run:ios`/`expo
  run:android`)로 NFC·실제 푸시를 제외한 나머지는 검증 가능.
- **NFC는 시뮬레이터에서 검증 불가** — 하드웨어가 없다. 실기기 필수.
- **QR 타각 end-to-end는 STEP 5-B/6 이후에나 완전 검증 가능** — 사업장 QR이
  정적 스티커가 아니라 TOTP를 실시간 렌더링하는 표시 장치여야 하는데, 그
  장치는 STEP 5-B/6 소관이라 아직 없다.
- **`react-native-nfc-manager`는 New Architecture 검증이 안 된
  패키지**(`expo-doctor` 경고) — TECH_STACK.md가 유일한 NFC 옵션으로 지정한
  패키지라 대안이 없다. EAS 빌드 착수 전 실기기에서 재확인 필요.
- **개인 프로필 정보 없음**: `GET /auth/session`은 `{employeeId, employeeNo,
  role, status}`만 준다(이름·소속 사업장 없음) — 홈 화면 인사말은
  `employeeNo`를 쓴다.
- **화면 8(알림)은 대체로 비어 있는 것이 정상**: `GET /alert-log`는 실제
  엔드포인트지만, 52시간 경고·승인결과 같은 실제 알림을 발송하는 프로듀서
  코드가 STEP6~9 이전에는 없다(`docs/SELF_SERVICE_ENDPOINTS.md` §5 참고).
- **화면 9의 §24④ "지체없는 파기"는 이력 기록만 하고 즉시 삭제는 하지
  않는다** — `docs/SELF_SERVICE_ENDPOINTS.md` §3의 알려진 갭 참고.

## 목업 vs 실제 API

`src/api/index.ts`가 mock↔real 배선이 결정되는 유일한 지점이다. 화면
9개 중 스케줄(5)·휴가(6)·신청함(7)·내 근태(4)와 홈 화면의 52시간 게이지는
STEP6~9 백엔드가 없어 `*.mock.ts` 모듈(로그인한 employeeNo로 시드된
데모 데이터)을 쓴다. 인증·타각·기기토큰·알림이력·동의·위치확인자료·사업장
목록은 전부 실제 백엔드를 호출한다. STEP6~9가 실제 엔드포인트를 만들면
`*.real.ts`를 `src/api/types.ts`의 인터페이스대로 구현해 `index.ts`의 배선
한 줄만 바꾸면 되고, 화면 컴포넌트는 손대지 않는다.

## 오프라인 큐

`src/offline/`. `expo-sqlite`(실제 앱)와 Node 내장 `node:sqlite`(테스트)를
`SqlExecutor` 인터페이스로 통일해, 오프라인 큐의 핵심 로직
(`punchQueueLogic.ts`, `flushLogic.ts`)을 시뮬레이터 없이 Jest로 검증한다:

```bash
pnpm test          # apps/mobile에서
```

완료조건 검증 절차는 [`docs/MANUAL_VERIFICATION.md`](docs/MANUAL_VERIFICATION.md) 참고.
