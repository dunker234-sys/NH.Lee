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
RUN pnpm --filter @attendance/kiosk build

FROM nginx:1.27-alpine AS runtime
COPY apps/kiosk/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/kiosk/dist /usr/share/nginx/html
EXPOSE 80
