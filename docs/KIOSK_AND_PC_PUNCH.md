# KIOSK_AND_PC_PUNCH — STEP 5-B 공용 키오스크 + PC 웹 타각

`apps/kiosk`(React+Vite), `apps/admin-web`(Next.js 최소 부트스트랩,
로그인+타각 위젯만 — 본격 확장은 STEP6), 백엔드는 `apps/api/src/modules/
{kiosk-devices,kiosk-punches}/` + `apps/api/src/modules/punches/`의 작은
확장(§3).

## 1. 왜 새 인증 파이프라인이 필요했나

기존 `PrincipalGuard`는 15분 JWT 하나가 요청 생애주기 내내 직원 1명을
고정한다 — "공용 기기 1대, 하루 수십 명, 5초 회전"에 구조적으로 맞지
않는다. 그래서 키오스크는 `JwtAuthGuard`/`PrincipalGuard`를
`@Public()`으로 완전히 우회하고, `KioskDeviceGuard`(기기 자격증명 헤더
`X-Kiosk-Device-Credential`)만으로 인증한다. **타각 대상 직원은 요청 안에서
사번+PIN으로 그때그때 확정**되지 `request.principal`에서 오지 않는다 —
JWT를 매 타각마다 발급/폐기하는 낭비를 피한다.

## 2. 스키마

- `EmployeeCredential.pin*`(`pinHash`/`pinFailedAttempts`/`pinLockedUntil`/
  `pinSetAt`) — 비밀번호 잠금 카운터와 **분리**. 같은 카운터를 쓰면 키오스크
  PIN 공격이 그 직원의 모바일 앱 비밀번호 로그인까지 잠가버린다.
- `KioskDevice` — `id`가 곧 `punch_raw.deviceId`. `credentialHash =
  sha256(원본 페어링 토큰)`(`RefreshToken.tokenHash`와 같은 이유로 bcrypt
  아님 — 고엔트로피 랜덤값이라 느린 해시가 불필요).
- `SiteIpAllowlist` — `policy_config`가 아니다(CIDR 목록은 법령 수치가
  아니라 구조적 접근제어 설정).
- 마이그레이션: `20260828093030_step5b_kiosk_pc_punch`. `PunchRaw`/
  `RegistrationMethod`는 이미 STEP4/5-A가 `PC`/`TABLET`을 지원해 변경
  없음.

## 3. `PunchesService` 신뢰 분기(유일하게 손댄 기존 코드)

`processOne()`이 신뢰 판정을 `DeviceBindingService.resolve()`에서 가져오던
자리를 `registrationMethod`로 분기했다:
- `TABLET` → `KioskDevicesRepository.findById(deviceId).status==='ACTIVE'`.
- `PC` → 무조건 `true`(IP 허용목록이 요청이 여기 도달하기 전에 이미
  걸러낸다 — 대체 보안장치).
- `GPS`/`NFC`/`QR` → 무변경.

이유: 공용 기기의 `deviceId`는 하루 수십 명이 공유하는데, 기존
`DeviceBindingService`는 "직원별 첫 기기가 자동 신뢰"라는 1인:1기기 모델이라
— 이미 개인폰이 신뢰기기로 등록된 직원은 키오스크에서 평생
`DEVICE_NOT_TRUSTED`+`LOW`로 남는다(승급 경로가 없다).

**부수효과**: 이 분기는 키오스크/PC 위젯 여부와 무관하게 `POST /punches`에
`registrationMethod:'PC'`를 직접 보내는 모든 요청에 적용된다 — 의도된
결과다(IP 허용목록이 그 자리를 대신 지킨다).

## 4. `POST /kiosk/*` 엔드포인트

- `POST /kiosk/pair` — `@Public()`, 유일하게 기기 자격증명 없이 호출.
  페어링 토큰이 유효한 활성 `KioskDevice`인지 확인 후 `{kioskDeviceId,
  siteId, siteName}` 반환.
- `POST /kiosk/punches` — 온라인 1건. `{employeeNo, pin, punchType,
  recordedAt, clientEventId}`. PIN 검증(`AuthService.
  recordFailedAttempt()`의 원자적 increment 패턴을 PIN 전용 컬럼에
  미러링) → 성공 시 기존 `PunchesService.create()` 그대로 호출. 응답은
  `{punchId, punchType, maskedName, verificationLevel, completedAt}`뿐 —
  `employeeId`/`employeeNo`도 되돌려주지 않는다(개인정보 노출 최소화).
- `POST /kiosk/punches/bulk` — 오프라인 복구 재전송. **항목별로 PIN을
  재검증한다** — 키오스크는 오프라인 중 PIN을 서버에 검증받을 방법이
  전혀 없어, "한 번 검증됐으니 재검증 불필요"가 성립하지 않는다(모바일
  오프라인 큐와의 핵심 차이). 배치 중 어떤 사번이 잠기면 그 사번의 남은
  항목은 즉시 `PIN_LOCKED`.
- `GET /kiosk/qr-code` — QR 표시 모드. `QrSecretProvisioningService.
  getCurrentCode(siteId)`(신규 메서드, 기존 `generateTotp()`를 처음으로
  표시 경로에서 호출)가 `{code, periodSeconds, expiresAt}`를 반환. QR
  페이로드는 **6자리 코드 문자열 그대로**(추가 인코딩 없음) —
  `apps/mobile`의 `ScanScreen`이 이미 스캔한 문자열을 그대로
  `qrOrNfcToken`으로 전달하는 구조라 모바일 앱 쪽 변경이 전혀 필요 없다.

**PIN 무차별대입 잠금 시 관리자 알림**: `NOTIFICATION_TYPES.
KIOSK_PIN_LOCKOUT`(`urgent:true`), 수신자는 그 사업장의 활성
`SITE_MANAGER`들(`org-scope-resolver.service.ts`와 같은 "활성 배정" 날짜
범위 패턴). 수신자가 0명이어도 잠금 자체는 유지된다 — 알림 실패가 보안
조치를 되돌리지 않는다.

## 5. IP 허용목록(PC 전용)

`IpAllowlistGuard`가 `PunchesController.create`/`createBulk`에 붙는다 —
`registrationMethod==='PC'`인 요청만 실질적으로 검사한다(그 외 방식은
즉시 통과). 허용목록이 하나도 없으면 **fail-closed**(사업장이 명시적으로
최소 1개는 등록해야 PC 타각이 열린다).

**`normalizeIp()`의 `::1`→`127.0.0.1` 매핑은 실측으로 발견한 결과다**:
admin-web을 실제 브라우저로 붙여 테스트하던 중, 같은 개발 머신에서도
"localhost"가 어떤 요청은 `::ffff:127.0.0.1`로, 어떤 요청은 순수 `::1`로
접속하는 것을 확인했다(Node/OS의 DNS 해석 순서에 달려 있어 클라이언트가
통제할 수 없음). 이 매핑이 보안을 약화시키지 않는 이유: 루프백 주소는
애초에 같은 물리/가상 호스트에서만 도달 가능해 원격 공격자가 스푸핑할
방법이 없다 — 실제 운영 환경의 CIDR은 사무실 IP 대역이지 루프백이 아니다.

`main.ts`가 `app.set('trust proxy', ...)`를 호출하지 않으므로 `request.ip`는
지금은 TCP 소켓 주소 그대로다 — **나중에 리버스 프록시를 앞에 두면 이 값이
프록시 주소가 되므로 그때 신중히 재검토해야 한다.**

## 6. `apps/kiosk` 오프라인 큐 — 모바일과의 핵심 차이

`apps/mobile/src/offline/{punchQueueLogic,flushLogic}.ts`와 같은 순수
로직+어댑터 모양으로 **포팅**했다(CLAUDE.md "앱 간 코드 공유는
packages/shared-types를 통해서만" — 오케스트레이션 로직까지 포함하지
않으므로 복제가 맞다). 저장소는 `localStorage`(IndexedDB 아님 — 소량
데이터라 인덱싱 불필요).

**PIN은 오프라인에서 검증될 수 없다**(키오스크가 `pinHash`를 가진 적이
없다) — 그래서 입력은 받되 검증은 재연결 시점으로 미룬다. 큐 항목은
PIN을 `pinCipher.ts`(AES-GCM, 기기 자격증명에서 유도한 키)로 암호화해
담는다. **이건 강한 암호화가 아니라 최소한의 눈가림임을 명확히 인지한다**
— 복호화 키가 같은 `localStorage`에 있어 저장소 전체를 탈취당하면
의미가 없다. 실질적 방어선은 재연결 시 서버가 PIN을 실제로 재검증하고
잠금 로직이 그대로 적용된다는 것이다.

## 7. 알려진 갭

1. **`apps/admin-web`에 키오스크 기기 관리 화면이 없다** — 사용자가 확정한
   "admin-web 최소화" 결정 때문. 지금은 `POST /admin/kiosk-devices`를
   Swagger(`/docs`) 또는 직접 API 호출로 쓴다.
2. **QR 표시 모드 e2e는 시크릿 발급 UI가 없어 서비스 메서드 단위로만
   검증했다** — `QrSecretProvisioningService.provision()`이 여전히
   "관리 UI는 STEP5-B/6 몫"이라 시드/테스트가 직접 호출한다.
3. **워커 본인이 키오스크에서 PIN을 바꾸는 셀프서비스는 범위 밖** — PIN
   최초 발급/재설정은 `POST /employees/:id/pin`(관리자 전용)만 있다.
4. **실제 태블릿 하드웨어/키오스크 모드 잠금(홈 화면 이탈 방지 등)은 이
   환경에서 검증 불가** — 코드/API/브라우저 단위까지는 검증했다(실제
   브라우저로 페어링→타각→QR모드→오프라인 저장 전 구간을 확인).
5. **`GET /kiosk/qr-code`의 QR 페이로드가 사업장 배정 문제를 그대로
   물려받는다** — 워커의 `primarySite`가 그 키오스크의 `siteId`와 다르면
   `apps/mobile`이 항상 `sites[0]`으로 제출하는 기존 한계로 실패한다
   (STEP5-A부터 있던 갭, STEP5-B가 새로 만들지 않음).

## 8. 검증

`apps/api/test/{kiosk-punches-timing,kiosk-offline-recovery,
ip-allowlist}.e2e-spec.ts`(실제 Postgres+Redis) + `apps/api/src/modules/
punches/guards/ip-allowlist.guard.spec.ts`(가짜 ExecutionContext 직접
호출, `::1` 케이스 포함) + `apps/api/src/common/{net/cidr.util.spec.ts,
text/name-mask.util.spec.ts}` + `apps/kiosk/src/offline/__tests__/*`
(Node, 브라우저 없이) — 전부 통과 확인. 실제 브라우저(Claude Browser
pane)로 apps/api+apps/kiosk+apps/admin-web을 동시에 띄워 페어링→
사번+PIN 타각 성공→오답 PIN 오류→QR 모드→admin-web 로그인→PC 타각
성공까지 실제 종단 플로우를 확인했다(이 과정에서 `::1` 정규화 버그를
실제로 발견해 수정했다 — §5).
