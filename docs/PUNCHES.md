# PUNCHES — STEP 4 출퇴근 등록 API

`apps/api/src/modules/punches/`(등록 파이프라인), `modules/fraud-detection/`
(비동기 부정사용 탐지), `modules/no-show-detection/`(미등록 감지 배치) 세
모듈로 구성된다.

## 1. 처리 흐름

```
POST /punches → PunchesService.create()
  → DeviceBindingService.resolve()        (기기 바인딩 확인, STEP2 재사용)
  → GeofenceService.evaluate()             (Haversine + 외근 승인 예외)
  → QrNfcVerificationService.evaluate()    (NFC 태그 대조 / QR TOTP)
  → PunchRawRepository.createIdempotent()  (INSERT 우선 → 유니크 위반 캐치)
  → PunchLocationRepository.create()       (신규 저장 건만)
  → RecalculationTriggerService.onPunchSaved()   (병렬)
  → FraudDetectionTriggerService.onPunchSaved()  (병렬, 비동기 탐지 큐 적재)
```

어떤 검증 실패도 저장을 막지 않는다 — `verificationLevel`(NORMAL/LOW)과
`integrityFlags`로만 표현한다. `punch_raw`가 append-only라 `verificationLevel`/
`integrityFlags`/`review_note`는 반드시 INSERT 전에 확정돼야 한다 — 그래서
지오펜스·NFC/QR·기기 신뢰·Android/iOS 클라이언트 신호는 전부 동기 경로에
있고, 추가 스캔 쿼리가 필요한 부정사용 3종(이동속도/좌표반복/기기공유)만
비동기로 미룬다.

## 2. 멱등성

`idempotency_key = sha256(사번|타입|분단위절삭(recorded_at)|기기ID)` —
`punch_raw.idempotency_key`의 DB 유니크 제약이 최종 방어선이다.
`PunchRawRepository.createIdempotent()`는 "먼저 SELECT 후 INSERT"가 아니라
INSERT를 먼저 시도하고 유니크 위반(P2002)을 캐치한다 — 동시에 도착한 두
요청이 둘 다 "중복 아님"으로 오판하는 TOCTOU를 막기 위해서다.
`client_event_id`는 추적용으로만 저장하고 멱등키에 쓰지 않는다(앱 재설치로
클라이언트 UUID가 바뀌어도 같은 분에 같은 타입·기기로 다시 보내면 여전히
같은 키가 나온다).

`receive_count`는 영구히 1이다 — `punch_raw`는 `app_rw`의 UPDATE/DELETE가
DB 롤 권한으로 회수돼 있어(STEP1 `roles_post_migrate.sql`) 이 카운터를
늘릴 UPDATE 경로 자체가 존재할 수 없다. 문서화된 갭이다.

## 3. 지오펜스

`Site.geofenceRadiusM`을 단일 진실 소스로 쓴다. `policy_config.
geofence_default_radius_m`(STEP1 seed)은 이번 STEP에서 신규 소비하지
않는다 — 두 소스를 동시에 쓰지 않기 위해서다. 반경 밖이면 그 근로일을
포함하는 승인된 `DispatchRequest`(사업장 일치는 요구하지 않는다)가 있는지
확인하고, 없으면 `verificationLevel=LOW` + `OUT_OF_GEOFENCE_NO_DISPATCH`(또는
`_NO_REASON`) + `review_note`(사유가 있으면)로 저장한다.

`Site.lat`/`lng`는 이번 STEP에서 신설된 컬럼이라 기존 시드 데이터는 NULL일
수 있다 — 그 경우 `SITE_COORDINATES_MISSING` 플래그로 LOW 처리한다(임의
좌표로 취급해 오판정하지 않는다).

## 4. NFC / QR

NFC가 기본 수단: `SiteVerificationSignal(NFC_TAG)`에 사업장별 태그 UID를
등록해 둔다. QR은 예비 수단으로 TOTP(RFC 6238, Node 내장 crypto로 직접
구현 — `otplib` 등 외부 의존성 없음) + `policy_config.qr_verification_policy`
분기를 따른다: `NFC_ONLY`(기본값, QR 자체를 비활성 취급) 또는
`QR_WITH_AUX_CHECK`(TOTP 일치 AND 기기 신뢰 AND Wi-Fi BSSID/Cell ID 보조신호
일치 — 셋 중 하나라도 어긋나면 `QR_VERIFICATION_INCONCLUSIVE`). 사업장 QR
TOTP 시크릿은 `Site.qrTotpSecretEncrypted`에 AES-256-GCM으로 암호화 저장한다
(`QrSecretProvisioningService`, env `QR_TOTP_ENCRYPTION_KEY`).

## 5. 부정사용 탐지

**동기**(클라이언트가 이미 보낸 값을 그대로 옮긴다, 추가 쿼리 없음):
Android는 `mockLocationSuspected`/`developerModeEnabled`/`rootedOrJailbroken`
불리언을, iOS는 시뮬레이션 위치 탐지 공식 API가 없다는 사실을 항상
`MOCK_LOCATION_NOT_SUPPORTED` 문자열 토큰으로(불리언 `false`가 아니다) 남긴다.

**비동기**(BullMQ `punch-fraud-detection` 큐, `punch_fraud_signal` 테이블에만
기록 — `punch_raw`는 append-only라 사후 갱신이 불가능하다):
- 이동속도 이상: 직전 타각 1건만 본다(윈도우 아님).
- 좌표 반복: `repeated_coordinate_lookback_days`(7일) 내 완전 일치 좌표 횟수.
- 동일 기기 다수 사번: `shared_device_lookback_hours`(24h) 내 서로 다른
  사번 수. `punch_raw`에 `(deviceId, receivedAt)` 인덱스를 신설했다 —
  없으면 이 쿼리가 운영 규모에서 풀스캔이 된다.

## 6. 오프라인 벌크 업로드

`POST /punches/bulk`. 단일 엔드포인트와 검증 파이프라인을 공유한다
(`PunchesService.processOne()`). 배치 내 고유 `deviceId`별로 기기 바인딩
확인을 메모이즈한다. 오프라인 유래 항목은 `offline_queue_delay_threshold_
hours`를 넘는 지연이 있어도 부정 신호로 취급하지 않는다(요구사항 명시) —
반대로 온라인 단일 엔드포인트는 `online_punch_delay_threshold_minutes`(5분,
이번 STEP에서 신설한 정책값)를 넘으면 `UNEXPLAINED_TIME_GAP`을 붙인다("오프라인만
다른 임계값" 문장이 성립하려면 기준선이 있어야 한다는 판단으로 추가했다).
`lastKnownServerSyncTime`보다 이전 `recordedAt`을 주장하면
`DEVICE_CLOCK_ROLLBACK_SUSPECTED`를 붙인다.

DTO 모양 자체가 틀린 항목이 섞이면(필수 필드 누락 등) 전역 `ValidationPipe`가
요청 전체를 400으로 거부한다 — Nest가 트리 전체를 한 번에 검증하는 구조라
이 레이어의 부분 성공은 이번 STEP에서 구현하지 않는다. 건별
`CREATED`/`DUPLICATE`/`FAILED` 배열은 이미 모양이 유효한 항목들 사이의
도메인 결과만 구분한다.

## 7. 미등록 감지 배치

`modules/no-show-detection/` — BullMQ repeatable job(매일 KST 01:00, 신규
cron 라이브러리 추가 없이 BullMQ의 `repeat` 옵션만 사용). 탐지 쿼리:
`Schedule(status=CONFIRMED, workDate=?)` 중 같은 `employeeId+workDate`로
`PunchRaw(punchType=IN)`이 없고, `unit=FULL`인 승인된 `LeaveRequest`도 없는
경우 → `NoShowNotificationTarget` upsert(`@@unique([employeeId, workDate])`
로 재실행해도 안전). `PunchRaw` 매칭에 `siteId`를 걸지 않아 외근/지원으로
다른 사업장에서 IN을 찍은 경우도 자연스럽게 제외된다. 실제 발송(STEP4.5
`NotificationService`)은 이 STEP 범위 밖 — `notifiedAt`은 항상 NULL로
생성한다.

## 8. policy_config 신규 키

`apps/api/prisma/punch-policy-defaults.ts`(seed 스크립트와 e2e 픽스처가
공유): `geofence_accuracy_threshold_m`, `qr_totp_period_seconds`,
`qr_verification_policy`, `offline_queue_delay_threshold_hours`(이상 기존
STEP1 seed 값 재사용) + 신설: `impossible_travel_speed_kmh`,
`repeated_coordinate_lookback_days`, `repeated_coordinate_max_count`,
`shared_device_lookback_hours`, `device_clock_rollback_tolerance_seconds`,
`online_punch_delay_threshold_minutes`, `location_retention_days`.
`punch_dedup_window_seconds`(기존 seed 값)는 의도적으로 소비하지 않는다 —
결정적 멱등키만으로 완료조건을 만족하고, 휴리스틱 중복 억제는 정당한 빠른
재타각을 조용히 누락시킬 위험이 있다.

## 9. P95 설계

동기 경로에서는 어떤 경우에도 `AuditLogService.write()`를 직접 호출하지
않는다 — 그 서비스는 모든 쓰기를 전역 advisory lock으로 직렬화해 100개
동시 요청의 P95를 직접 위협한다. `DeviceBindingService.resolve()`만 예외로
재사용하는데, 이미 바인딩된 기기(운영에서의 일반적인 반복 사용)는 그
서비스 내부에서도 audit_log를 건드리지 않는다 — 그 직원의 그 기기가
처음 등장하는 극히 드문 1회성 경우에만 내부적으로 한 번 쓴다.

**실측 튜닝 기록**: 초기 `PunchPolicyResolverService.resolve()`는 정책 키
11개마다 site→전사 순으로 최대 2회씩(총 22회) 조회했다 — 100건 동시 부하
테스트에서 P95가 920~1000ms대로 널뛰는 걸 실측하고서야 이게 연결 풀 경합의
실제 원인임을 확인했다. 11개 키를 site+전사 값 전부 한 번에 가져와
메모리에서 우선순위(site 오버라이드 우선)를 적용하는 단일 쿼리로 바꿔
P95를 700ms대로 안정화했다. **`test/punches-p95.e2e-spec.ts`는 반드시
단독으로 실행한다**(`pnpm --filter @attendance/api test:e2e -- punches-p95`) —
100건의 타각이 재계산/부정사용탐지 큐에 최대 200개 실제 잡을 남기는데,
BullMQ(v5.81)의 `Worker.close()`가 대기열 잔량을 전부 소진할 때까지 기다리는
경우가 있어(관찰된 동작, 이 버전의 알려진 한계) 다른 STEP4 스펙과 한
프로세스에서 같이 돌리면 뒤따르는 파일의 `beforeAll`이 남은 연결/락과
경합해 타임아웃할 수 있다. 이 스펙 자체는(정책 리졸버 최적화 이후)
단독 실행 시 15~20초 안에 깨끗하게 끝난다.

## 10. 다루지 않는 것 (알려진 갭)

- QR TOTP 시크릿 관리 UI: STEP 5-B/6 몫, 지금은 서비스 메서드로만 존재.
- 반차/반반차 근무일의 결근 판정: 미등록 감지 배치 범위 밖.
- `punch_location`의 실제 파기 배치(`retention_job` 롤 활용): `purge_
  scheduled_at`은 채우지만 파기 실행 자체는 STEP1이 예정해 둔 후속 작업.
- 대량 정책 변경 시 `no-show-detection`/`fraud-detection` 큐의 백필 스로틀링.
