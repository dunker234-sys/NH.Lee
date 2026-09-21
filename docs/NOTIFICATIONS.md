# NOTIFICATIONS — STEP 4.5 알림 발송 인프라

`apps/api/src/modules/notifications/`. CLAUDE.md 절대 규칙 7("알림은
NotificationService를 통해서만 발송한다")을 실제로 구현한다 — STEP5~9는
전부 `NotificationService.notify()`만 호출한다.

## 1. 공개 API

```ts
notify(
  type: string,                       // notification-types.registry.ts에 등록된 값
  recipientEmployeeId: string,
  payload: Record<string, unknown>,   // 템플릿 변수
  options?: { targetPeriod?: string; stage?: string; channels?: AlertLogChannel[] },
): Promise<{ alertLogIds: string[] }>
```
별도 "트리거 서비스" 간접 계층이 없다 — `notify()` 자체가 멱등 적재와
조건부 enqueue를 한 번에 한다(recalculation의 `RecalculationTriggerService`와
다른 점).

## 2. 멱등성 — 이 STEP의 핵심

`dedupKey = sha256(canonicalJson({recipientEmployeeId, notificationType,
channel, targetPeriod, stage}))`, `alert_log.dedup_key`의 유니크 제약이
유일한 방어선이다. `AlertLogRepository.createIdempotent()`는
`PunchRawRepository.createIdempotent()`와 같은 모양(INSERT 먼저 시도 →
P2002 캐치 → 기존 행 재조회)으로 동시 요청 TOCTOU를 막는다.

BullMQ 잡 ID로는 중복을 막을 수 없다 — 이 저장소는 `removeOnComplete`를
오버라이드하지 않아 완료된 잡이 기본 정책대로 청소되므로, 나중에 같은
잡 ID로 다시 적재하면 조용히 새 잡이 생겨 실제 중복 발송이 된다. 그래서
잡 ID는 `alertLog.id`(진짜 UUID)로 고정하고, 중복 방지는 Postgres 유니크
인덱스에만 의존한다.

## 3. 재시도 / DLQ / 결과 갱신

큐 1개(`notifications`), `attempts:4, backoff: exponential 500ms` — 내부
잡 관례(`attempts:3`)보다 1회 많다: 재계산·부정사용탐지는 다음 실제
트리거가 무료로 재시도해 주는 자기치유 잡이지만, 알림은 1회성 부작용이라
그런 안전망이 없다.

DLQ는 BullMQ 네이티브 `failed` 목록(별도 큐 없음, 기존 관례와 동일).
`NotificationOpsService.retryFailedJobs()`가 `RecalculationOpsService`와
대칭이다.

`alert_log.result`/`retry_count`는 시도마다 갱신된다 — `punch_raw`의
"1회 INSERT" 철학과 다른 유일한 지점이다. `dedup_key` 유니크 제약이 지키는
건 "신원"이지 "결과"가 아니다(`correction_request.status`처럼 생애주기
동안 바뀌는 필드다). 컨슈머 진입 시 억제되면 `SUPPRESSED`(예외 아님),
발송 성공 시 `SUCCESS`, 발송 실패 시 `FAILED_RETRYING`+재시도, 마지막
시도까지 실패하면(`@OnWorkerEvent('failed')`) `FAILED_FINAL` — 이 행의
`id`가 곧 BullMQ failed 잡의 `id`다.

## 4. 조용시간 + 동의

발송 시점(컨슈머 안)에서 평가한다 — 적재~발송 사이 큐 지연으로 조용시간
경계를 넘을 수 있어서다. 조용시간(`policy_config.notification_quiet_hours_
start/end_minute_of_day`, 근기법 야간근로 판정용 `nightStartMinuteOfDay`와는
별개 키)은 **PUSH만** 억제한다(요구사항 문구가 "휴식 시간대 **푸시**
억제"로 명시). 동의(`Consent(NOTIFICATION)`)는 세 채널 모두 균일하게
억제한다. `urgent`(코드 레지스트리가 유형별로 고정, 호출자가 매번 정하지
않는다)는 조용시간만 예외로 만들 수 있고 동의 철회는 예외로 만들 수
없다 — 동의는 법적 성격의 판단이라 이 인프라 STEP이 STEP5~9를 대신해
내릴 수 없다.

## 5. 다국어 템플릿

`notification-types.registry.ts`가 단일 진실 소스다(`policy_config`가
아니다 — CLAUDE.md 절대 규칙 4는 법령 수치·임계값에 국한되고 템플릿
문구는 그게 아니다). `templates[locale] ?? templates['ko']`(ko 자체가
없을 때만 예외). en/vi 추가는 이 파일에 데이터를 더하는 일이지 `notify()`
호출부를 하나도 건드리지 않는다. `Employee.locale`(기본 `'ko'`, 평문
문자열 — DB enum이면 언어 하나 늘 때마다 마이그레이션이 필요해 확장성
요구와 충돌한다)이 조회 키다.

## 6. 채널

`NotificationChannelSender` 인터페이스 + `DummyPushSender`/
`DummyEmailSender`/`InAppSender`(전부 더미, 실제 FCM/APNs/SMTP 연동은
범위 밖 — STEP4가 "QR TOTP 관리 UI는 STEP5-B/6 몫"이라 문서화한 것과
같은 패턴). `payload.forceFail===true`일 때만 결정적으로 실패한다(더미
발송기 계약의 일부, 재시도/DLQ 완료조건 테스트용). in-app 배너는 별도
인박스 테이블 없이 `alert_log` 행(`channel='IN_APP'`) 자체가 그 레코드다.

## 7. device_token

STEP1이 이미 스키마에 심어 뒀지만 아무도 쓴 적이 없었다. 등록은
`@@unique([employeeId, deviceId, platform])` 기반 **upsert**(앱 재설치는
같은 기기·플랫폼에서 새 토큰을 발급하므로 새 행이 아니라 갱신이어야
한다). `POST /device-tokens`로 지금 노출한다 — STEP5(모바일 앱)가 첫날부터
필요로 한다.

## 8. 다루지 않는 것 (알려진 갭)

- 실제 FCM/APNs/SMTP 연동: 더미 발송기만 존재.
- 조용시간에 억제된 알림의 조용시간 종료 후 재발송: 지금은 `SUPPRESSED`로
  버린다(지연이 아니다).
- 알림 이력 조회·재시도 HTTP 엔드포인트: `NotificationOpsService`는 서비스
  메서드로만 존재.
- 발송 성공 후에도 실제 렌더링된 제목/본문 텍스트는 저장하지 않는다 —
  재현하려면 `notificationType`+`payload`+`locale`로 레지스트리를 다시
  렌더링해야 한다(레지스트리가 나중에 바뀌면 과거 발송분과 문구가 달라질
  수 있음).
- 대량 발송 시 채널별 스로틀링(예: FCM 분당 발송 한도).
