# syntax=docker/dockerfile:1
# STEP12: pnpm 워크스페이스 모노레포 빌드 — 빌드 컨텍스트는 반드시 저장소
# 루트여야 한다(packages/core-rules를 apps/api가 workspace:* 의존성으로
# 참조하므로). 예: docker build -f apps/api/Dockerfile --target runtime -t attendance-api .
#
# 두 개의 최종 타깃을 만든다:
# - runtime : 상시 구동되는 API 서버. --prod 의존성만 설치한다(prisma CLI/
#             ts-node 등 devDependencies 제외 — 빌드 도구 체인을 남기지 않는다).
# - migrate : 마이그레이션+정책 시드 전용 1회성 잡. devDependencies(prisma
#             CLI, ts-node)가 필요하므로 build 스테이지를 그대로 쓴다.
#             실제 운영에서는 Terraform ECS의 별도 1회성 태스크로 이 이미지를
#             돌린 뒤 runtime 이미지로 애플리케이션을 배포한다(같은 순서를
#             docker-compose(로컬)의 `migrate` 서비스가 재현한다).
#
# 로컬 실행은 docker-compose(로컬)를 참고 — 이 이미지 자체는 CI에서
# build 단계까지만 검증하고 실제 배포(apply)는 이 세션 범위 밖이다
# (Terraform과 동일한 이유 — 실 클라우드 계정 없음).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# --- deps: 워크스페이스 전체의 package.json만 먼저 복사해 pnpm install을
# 캐시 레이어로 분리한다(소스 변경만으로 의존성 재설치가 다시 돌지 않게). ---
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/kiosk/package.json apps/kiosk/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/core-rules/package.json packages/core-rules/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# --- build: core-rules(apps/api의 workspace 의존성)를 먼저 빌드한 뒤
# prisma generate → tsc. devDependencies를 그대로 유지한다(migrate 타깃이 재사용). ---
FROM deps AS build
COPY . .
# tsc가 src/test 전체를 컴파일하고 스펙이 shared-types를 import하므로 dist가 먼저 필요하다.
RUN pnpm --filter @attendance/shared-types build
RUN pnpm --filter @attendance/core-rules build
RUN pnpm --filter @attendance/api exec prisma generate
RUN pnpm --filter @attendance/api build

# --- migrate: roles.sql은 postgres 컨테이너의 init 스크립트가 담당하므로
# (docker-compose 참고), 여기서는 "테이블이 존재해야 하는" roles_post_migrate.sql
# 적용 → prisma migrate deploy → 시드 순서만 수행한다. ---
FROM build AS migrate
RUN apk add --no-cache postgresql-client
COPY apps/api/docker-migrate.sh apps/api/docker-migrate.sh
RUN chmod +x apps/api/docker-migrate.sh
WORKDIR /repo/apps/api
ENTRYPOINT ["/repo/apps/api/docker-migrate.sh"]

# --- runtime: 프로덕션 의존성만 재설치(devDependencies 제외)한 별도
# 스테이지 — 빌드 도구 체인을 최종 이미지에 남기지 않는다. ---
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/admin-web/package.json apps/admin-web/package.json
COPY --from=build /repo/apps/kiosk/package.json apps/kiosk/package.json
COPY --from=build /repo/apps/mobile/package.json apps/mobile/package.json
COPY --from=build /repo/packages/core-rules/package.json packages/core-rules/package.json
COPY --from=build /repo/packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile --prod --filter @attendance/api...

COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/packages/core-rules/dist packages/core-rules/dist

# root로 실행하지 않는다(OWASP 컨테이너 하드닝 기본).
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /repo
USER app

EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
