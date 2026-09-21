# CLAUDE.md — 전사 근태관리 시스템

> 이 문서는 Claude Code(및 모든 기여자)가 이 저장소에서 작업할 때 항상 지켜야 하는 규칙을 담는다.
> 코드 작성/리뷰 전에 반드시 읽는다.

## 문서 출처에 관한 주의

이 CLAUDE.md는 `02_ClaudeCode_단계별_프롬프트세트_v2.md`(STEP 0~12 프롬프트 세트)를 근거로 작성되었다.
원본 요구사항서 `01_요구사항서_근태관리시스템_v2.md`는 **아직 이 저장소에 존재하지 않는다.**
아래 본문에서 "요구사항서 4.2", "요구사항서 6장" 등으로 인용되는 장·절 번호는 02 파일에 등장하는
표기를 그대로 옮긴 것이며, 01 요구사항서가 추가되면 이 문서와 대조해 불일치를 바로잡아야 한다.

---

## 1. 프로젝트 개요

- **사업 도메인**: 단체급식(위탁급식) 사업. 전국 약 400여 개 사업장(현장), 임직원 약 3,736명.
- **목표**: 전사 공통 근태관리 시스템 신규 개발. 출퇴근 등록(타각) → 근로시간 계산 →
  집계·승인 → 급여 연동까지 전 과정을 다룬다.
- **현장 특성이 설계에 미치는 영향**
  - 급식 현장은 조식/중식/석식 등 이른 새벽부터 밤까지 걸치는 교대 근무가 많다
    (예: 조식조 05:00~14:00). 근로일 귀속·야간근로 판정에 직접 영향을 준다.
  - 근로자 상당수가 개인 스마트폰 사용이 익숙하지 않거나 회사 지급 기기가 없다.
    → 모바일 앱 외에 **공용 키오스크·PC 웹** 타각 수단이 반드시 필요하다 (STEP 5-B).
  - 사전 승인 없이 조기 출근·연장이 관행적으로 발생한다. 시스템은 이를 **막지 않고
    실적으로 기록한 뒤 사후 승인/판정**하는 흐름을 기본으로 한다.
  - 사업장별로 상시근로자수가 5인 미만/이상 경계를 넘나들 수 있어, 법 적용 여부가
    사업장 단위가 아니라 **근로일 시점의 이력** 단위로 갈린다.
- **법적 성격**: 산출 결과가 곧바로 임금·형사처벌(주 52시간 초과) 판단의 근거가 되므로,
  근로기준법 등 노동관계법령 조문에 대한 정합성이 기능 정합성보다 우선한다.
- **개발 순서**: `ROADMAP.md`의 STEP 0~12를 순서대로 따른다. 특히 STEP 3(근로시간 계산
  엔진) 착수 전 "Phase 0 노무 검토"(아래 참고)가 반드시 먼저 확정되어야 한다.

### Phase 0 노무 검토 — STEP 3 착수 전 확정 필수

아래 4가지는 노무 검토로 확정되어야 하며, 확정 전에 STEP 3에 착수하지 않는다.
나중에 바꾸면 전 기간 재계산이 필요하기 때문이다.

1. 미승인 연장근로 처리 (v2 기준: **전량 산입 + 검토 플래그**)
2. 근로일 귀속 규칙 (v2 기준: **시업일 귀속 + 휴일 판정은 역일 분할**)
3. 휴게시간 처리 (v2 기준: **자동 공제 금지**)
4. 퇴근 미등록 시 계획 시각 자동 적용 여부 (v2 기준: **기본 비활성**)

---

## 2. 도메인 용어집 (한국어 ↔ 영문 식별자)

코드의 식별자(테이블명, 컬럼명, 클래스명, 변수명)는 아래 매핑을 따른다. 새로운 용어가
필요하면 이 표에 먼저 추가한 뒤 코드에 반영한다.

| 한국어 용어 | 영문 식별자 | 비고 |
|---|---|---|
| 타각 | `punch` | 출퇴근/휴게 등 시각 등록 원본 이벤트. `punch_raw` 테이블 |
| 원본 타각 | `punch_raw` | append-only. 수정/삭제 불가 |
| 타각 위치정보 | `punch_location` | `punch_raw`와 분리 저장, 파기 대상 |
| 계획근태 / 스케줄 | `schedule` | 근무 예정 시각·교대 배정 |
| 교대 패턴 | `shift_template` | 조식/중식/석식 등 반복 근무 틀 |
| 소정근로(시간) | `scheduled_work_minutes` / `contracted_work_minutes` | 근로계약상 정한 근로시간 |
| 연장근로 | `overtime` | 승인 `approved_overtime_minutes`, 미승인 `unapproved_overtime_minutes` |
| 미승인 실적 | `UNAPPROVED_ACTUAL` | 승인 없이 존재하는 실근로. 0으로 만들지 않는다 |
| 야간근로 | `night_work` | 근기법상 22:00~06:00 |
| 휴일근로 | `holiday_work` | `holiday_calendar` 기준 판정 |
| 근로일 | `work_date` | Asia/Seoul 기준 date. 집계·조회·파티셔닝·마감의 유일한 기준 |
| 시업일 | `shift_start_date` | 교대가 자정을 걸칠 때 근로일 귀속 기준 |
| 지오펜스 | `geofence` | 사업장 반경 기반 위치 검증 |
| 인증수준 | `verification_level` (`NORMAL`/`LOW`) | 타각 신뢰도. 낮아도 저장은 항상 허용 |
| 정정신청 | `correction_request` | 근로자/관리자의 근태 보정 신청 |
| 직권 정정 | `admin_correction` | HQ_HR만 수행, 사유 필수 |
| 마감 | `payroll_close` / `close` | 근태·급여 확정 및 잠금. 재개는 재마감(`re-close`) 절차로만 |
| 상시근로자수 | `site_headcount` | `site_headcount_history`에 시점 이력으로 관리, `site`의 현재값은 캐시일 뿐 |
| 5인 미만 사업장 | `is_under_five` | 연장/야간/휴일 가산·52시간 한도 미적용, 휴게·주휴는 그대로 적용 |
| 보호 상태(임신 등) | `employee_protected_status` | STEP6. `employee`와 분리 저장(민감정보 격리), 쓰기는 `HQ_HR`만 |
| 유연근로 유형(템플릿) | `flexible_work_type` | STEP6. `shift_template`의 필드. null=표준(비유연), 값 어휘는 `labor_agreement.agreement_type`과 동일 |
| 연차(유급휴가) | `annual_leave` | 근기법 제60조 |
| 반차 / 반반차 | `half_day_leave` / `quarter_day_leave` | |
| 보상휴가 | `compensatory_leave` | 제57조. 근로자대표 서면합의 필요, 가산율 반영 환산 |
| 주휴(주휴수당) | `weekly_paid_holiday` | 제55조① |
| 결근 / 지각 / 조퇴 | `absence` / `lateness` / `early_leave` | |
| 외근·출장·지원 | `dispatch_request` | 타 사업장 지원 포함, 승인 시 지오펜스 예외 |
| 유연근로제 | `flexible_work_arrangement` | 탄력적(`flexible_workweek`), 선택적(`selective_working_hours`) |
| 근로자대표 서면합의 | `labor_agreement` | 유연근로제·보상휴가 등 제도 도입 근거 |
| 취업규칙 | `work_rule` | |
| 결재선 | `approval_line` | 조직도 기반 자동 구성, 대결/위임(`delegation`) 지원 |
| SYSTEM 주체 | `SYSTEM principal` | 배치·큐 워커 전용, 스코프 우회 시 `audit_log`에 기록 |
| 조직 스코프 | `org_scope` | 역할×스코프 이중 필터. "전체"는 명시적 값, 누락과 구분 |
| 검토 큐 | `review_queue` | 저장은 허용하되 사후 확인이 필요한 항목 |
| 멱등키 | `idempotency_key` | `sha256(사번\|타입\|분단위절삭(recorded_at)\|기기ID)` |
| 오프라인 큐 | `offline_queue` | 단말 로컬 저장 후 네트워크 복구 시 자동 전송 |
| 지오펜스 이탈 사유 | `review_note` | `punch_raw`의 한 줄짜리 자유 텍스트. insert 시점에만 채운다 |
| 부정사용 신호 | `punch_fraud_signal` | 이동속도 이상/좌표 반복/기기 공유 등 비동기 탐지 결과. `punch_raw`와 분리 저장 |
| 사업장 인증 신호 | `site_verification_signal` | 사업장별 NFC 태그 UID, QR 보조신호(Wi-Fi BSSID/Cell ID) |
| 키오스크 기기 | `kiosk_device` | 사업장에 사전 등록된 공용 태블릿. 기기 자격증명으로 인증, 직원별 신뢰(`device_binding`)와는 다른 축 |
| 타각 PIN | `pin` (`employee_credential.pin_hash` 등) | 키오스크 전용. 비밀번호 잠금 카운터와 별도(위협모델이 다름) |
| IP 허용목록 | `site_ip_allowlist` | PC 웹 타각 전용. 사업장별 CIDR 목록, 비어 있으면 fail-closed |
| 미등록 감지 | `no_show_notification_target` | 계획근태는 있으나 실적이 없는 경우의 익일 자동 감지 결과. 실제 발송은 STEP4.5 `NotificationService` |
| 발송 이력 | `alert_log` | 알림 발송 이력(유형/채널/수신자/결과/재시도횟수). `audit_log`와 분리 — 해시체인·전역 락 없음 |
| 정책 설정 | `policy_config` | 법령 수치·임계값의 유일한 출처. 코드 상수화 금지 |
| 개시 데이터 이관 | `migration` / `cutover` | `source='MIGRATION'` 플래그, `punch_raw`에는 넣지 않음 |
| 접근 로그 | `access_log` | 조회·일반 요청. 해시 체인 없음 |
| 감사 로그 | `audit_log` | 상태 변경 이벤트만. 해시 체인 + 시간 단위 Merkle 루트 |
| 야간작업 특수건강진단 | `night_work_health_checkup` | 산안법 기준. 근기법 야간(22~06시)과 판정 시간대가 다름(00~05시 등) |

---

## 3. 기술 스택

세부 채택 근거는 [`TECH_STACK.md`](TECH_STACK.md) 참고.

- **백엔드**: TypeScript + NestJS + PostgreSQL + Redis + BullMQ
- **관리자 웹**: Next.js(App Router) + TypeScript + TailwindCSS + TanStack Query
- **모바일(근로자용)**: React Native (Expo, 네이티브 모듈 필요 시 dev client)
- **키오스크**: React + Vite (경량 SPA, 태블릿 브라우저 키오스크 모드)
- **인프라**: Docker / 국내 리전 클라우드(AWS ap-northeast-2 기본, 데이터 주권 요건 발생 시
  NCP/KT Cloud 재검토) / GitHub Actions / Terraform

## 4. 디렉터리 구조 규칙

pnpm workspace 모노레포를 사용한다.

```
/apps
  /api            NestJS 백엔드 (REST API, BullMQ 컨슈머, 배치)
  /admin-web      Next.js 관리자 웹 (본사/권역/사업장 관리자, PC 웹 타각 위젯 포함)
  /mobile         React Native(Expo) 근로자용 앱
  /kiosk          React+Vite 공용 키오스크 앱 (태블릿)
/packages
  /core-rules     근로시간·연차 계산 순수 함수 엔진. DB·프레임워크 의존 금지
  /shared-types   apps 간 공유 DTO·enum·타입
/infra            Dockerfile, docker-compose, Terraform, GitHub Actions 워크플로
/docs             RULES.md, 운영 문서, 파일럿 체크리스트 등
```

원칙:
- `packages/core-rules`는 DB·HTTP·프레임워크에 대한 어떤 의존성도 가질 수 없다.
  입력은 전부 인자로 주입받고, 출력은 순수 값 + `breakdown`(산출 근거) 배열이다.
- 앱 간 코드 공유는 `packages/shared-types`를 통해서만 한다. 앱 간 직접 import 금지.
- 법령 수치·임계값은 어떤 앱에서도 하드코딩하지 않고 `policy_config`를 읽는다.

---

## 5. 【절대 규칙】 — 위반 시 즉시 수정 대상

코드 리뷰·PR에서 아래 8개 중 하나라도 위반하면 다른 논의보다 우선해 즉시 수정한다.

1. **원본 타각(`punch_raw`)은 어떤 경우에도 UPDATE/DELETE 하지 않는다 (append-only).**
   보정은 `correction_request` 승인 후 별도 보정 레코드 추가로만 한다.
   DB 롤 권한(`app_rw`에서 UPDATE/DELETE 회수)으로 강제하며, 트리거는 보조 수단일 뿐
   유일한 방어선으로 삼지 않는다.

2. **근로시간은 지휘·감독 아래 실제 근로가 제공된 시간을 기준으로 산정한다(근기법 제50조③).**
   승인 여부는 근로시간의 성립 요건이 아니다. 어떤 설정·분기에서도 실근로 사실을
   0으로 기록하지 않는다. 미승인 실적은 `UNAPPROVED_ACTUAL` 상태로 전량 산입되며,
   관리자가 "근로 미제공"으로 사유와 함께 명시 판정한 경우에만 제외된다.

3. **휴게시간을 스케줄만 근거로 자동 공제하지 않는다.** 실제 타각(외출/복귀) 또는
   "휴게 미부여" 신고가 스케줄상 휴게보다 우선한다. 연장근로가 있으면 연장구간에도
   법정 휴게가 추가로 부여되어야 하며, 미부여 시 경고를 발생시킨다.

4. **법령 수치는 `policy_config`에서 읽는다. 코드에 상수로 넣지 않는다.**
   52시간 임계, 연차 일수, 가산율, TOTP 주기, 지오펜스 반경 등 모든 숫자가 대상이다.

5. **시점(instant)은 `timestamptz`로, 근로일(`work_date`)은 Asia/Seoul 기준 `date` 컬럼으로
   별도 저장한다.** 집계·조회·파티셔닝·마감 판정은 예외 없이 `work_date`를 사용하며,
   `recorded_at`에 대한 `::date` / `date_trunc` 캐스팅을 금지한다.

6. **시간 계산에 부동소수점을 쓰지 않는다.** 모든 시간 값은 분 단위 정수로 계산·저장한다.

7. **알림은 `NotificationService`를 통해서만 발송한다.** FCM/APNs를 개별 기능에서
   직접 호출하지 않는다. (STEP 4.5에서 구축, STEP 5 이후 전 기능이 이를 통해서만 발송)

8. **개인위치정보는 출퇴근 판정에 필요한 최소 범위만 저장하고, `punch_raw`가 아닌
   `punch_location` 테이블에 분리 저장한다.** `punch_raw`는 3년 보존·불변이고
   위치정보는 파기 대상이므로 같은 테이블에 두면 파기 배치가 append-only 제약과 충돌한다.

---

## 6. 테스트 정책

- **계산 엔진(`packages/core-rules`)은 TDD로 개발한다.** 테스트를 먼저 작성하고,
  실패를 확인한 뒤 구현한다.
- **`packages/core-rules`의 커버리지는 90% 이상을 유지한다.**
- 계산 엔진 테스트는 법 조문·판례를 근거로 한 시나리오 기반으로 작성하고,
  각 테스트가 어떤 조문/판례를 검증하는지 주석 또는 `RULES.md`에 명시한다.
- "미승인 실적이 0으로 계산되는 코드 경로가 없다"는 사실은 커버리지 수치와 별개로
  코드 리뷰로 별도 확인한다 (자동화된 커버리지만으로는 이 회귀를 못 잡을 수 있다).
- API/통합 레이어는 재계산 멱등성, 동시성(낙관적 잠금, 해시 체인 분기 없음),
  권한 우회 차단을 통합 테스트로 검증한다.
- 각 STEP의 완료 조건(`ROADMAP.md` 참고)에 명시된 시나리오는 테스트로 자동화하며,
  수동 확인으로 대체하지 않는다.

---

## 7. 참고 문서

- [`ROADMAP.md`](ROADMAP.md) — STEP 0~12 전체 순서와 완료 조건 요약
- [`TECH_STACK.md`](TECH_STACK.md) — 기술 스택 채택 근거
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — 데이터 모델, 파티셔닝·인덱스·DB 롤 (STEP 1)
- [`docs/AUTH_RBAC.md`](docs/AUTH_RBAC.md) — 인증·조직 스코프·SYSTEM 주체 설계 (STEP 2)
- `packages/core-rules/RULES.md` — 계산 규칙과 근거 조문 (STEP 3에서 작성)
- `02_ClaudeCode_단계별_프롬프트세트_v2.md` — STEP별 상세 프롬프트 원본
