# syntax=docker/dockerfile:1
# 빌드 컨텍스트는 저장소 루트: docker build -f apps/kiosk/Dockerfile -t attendance-kiosk .
# 키오스크는 정적 SPA(Vite 빌드)라 nginx로 서빙한다.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/kiosk/package.json apps/kiosk/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/core-rules/package.json packages/core-rules/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# VITE_* 값은 빌드 시점에 번들에 인라인되므로 build-arg로 받는다(admin-web과 동일).
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# workspace 의존성(shared-types)은 dist/를 만들어야 import할 수 있다 — 앱보다 먼저 빌드한다.
RUN pnpm --filter @attendance/shared-types build
RUN pnpm --filter @attendance/kiosk build

FROM nginx:1.27-alpine AS runtime
COPY apps/kiosk/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/kiosk/dist /usr/share/nginx/html
EXPOSE 80
