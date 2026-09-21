# admin-web — 관리자 웹

Next.js App Router + TypeScript + TailwindCSS + TanStack Query
(TECH_STACK.md). STEP5-B는 로그인+PC 웹 타각 위젯만 있는 최소
부트스트랩이었다 — STEP6에서 계획근태(편성) 화면을 더하며 admin-web이
처음으로 실제 규모의 앱 셸(사이드바+세션 가드+토큰 갱신)을 갖췄다.

## 실행

```bash
pnpm install   # 저장소 루트에서
cd apps/admin-web
pnpm dev
```

`NEXT_PUBLIC_API_BASE_URL` 환경변수로 `apps/api` 주소를 지정한다(기본
`http://localhost:3000`). `apps/api`의 기본 포트도 3000이므로 로컬에서
둘을 동시에 띄울 때는 `next dev -p <다른포트>`로 admin-web 포트를
바꿔야 한다(`.claude/launch.json`은 3100).

## 화면

- `/login` — 기존(STEP2) `POST /auth/login`(사번+비밀번호)을 그대로
  재사용한다. 새 인증 방식 없음.
- `/(authenticated)/*` — 로그인 후 진입하는 인증 앱 셸. 사이드바 +
  세션 가드(`layout.tsx`) 아래 다음 화면들이 있다.
  - `/punch` — PC 웹 타각 위젯(STEP5-B). `GET /sites`로 본인 사업장을
    조회하고 `POST /punches`를 `registrationMethod:'PC'`로 호출한다.
    IP 허용목록 밖에서 접근하면 서버의 `403 IP_NOT_ALLOWED` 사유
    메시지를 배너로 보여준다.
  - `/schedule` — 편성(월간 그리드, STEP6). 사업장·월 선택, 드래그로
    셀 채우기, 변경된 셀만 저장(낙관적 잠금 409 시 "내 값/상대 값"
    비교 다이얼로그), 엑셀 업/다운로드, 확정(soft-warning 시 사유
    입력 후 강제 확정 패널).
  - `/schedule/shift-templates` — 교대 패턴 템플릿 CRUD(유연근로 유형
    포함).
  - `/schedule/reports` — 계획 대비 실적(지각/조퇴/미출근/초과).

## 토큰 갱신

`lib/apiClient.ts`가 401을 받으면 `/auth/refresh`를 한 번 시도해
조용히 재시도하고, 실패하면 세션을 지우고 `/login`으로 보낸다. 동시에
여러 요청이 401을 맞아도 refresh는 한 번만 태운다(`refreshInFlight`
dedup) — 그렇지 않으면 두 번째 refresh가 이미 회전된(폐기된)
refreshToken을 다시 제출해 서버가 탈취로 오인, 세션 전체를 무효화하는
사고가 난다.

## 알려진 제약

- 그리드에서 셀을 "휴무로 지우기"는 지원하지 않는다(드래그 채우기는
  항상 어떤 템플릿을 채우는 동작).
- 드래그 채우기는 같은 행(직원) 안에서만 지원한다 — 여러 직원을
  가로지르는 사각형 선택은 범위 밖.
- 키오스크 기기 관리(`POST /admin/kiosk-devices`) 화면이 없다 — 지금은
  Swagger(`/docs`) 또는 직접 API 호출로 발급한다(`docs/
  KIOSK_AND_PC_PUNCH.md` 참고).
- 결재선(승인 워크플로우)이 없다 — 편성 확정은 즉시 저장이지 다단계
  승인이 아니다. STEP6.5의 몫으로 남겨뒀다.

상세 설계·갭 목록은 [`docs/SCHEDULE_PLANNING.md`](../../docs/SCHEDULE_PLANNING.md),
[`docs/KIOSK_AND_PC_PUNCH.md`](../../docs/KIOSK_AND_PC_PUNCH.md) 참고.
