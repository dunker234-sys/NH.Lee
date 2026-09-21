# syntax=docker/dockerfile:1
# 빌드 컨텍스트는 저장소 루트: docker build -f apps/admin-web/Dockerfile -t attendance-admin-web .

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
# NEXT_PUBLIC_* 값은 빌드 시점에 번들에 인라인되므로 build-arg로 받는다.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm --filter @attendance/admin-web build

# standalone 산출물(.next/standalone)만 담아 node_modules 전체를 옮기지 않는다.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/admin-web/.next/standalone ./
COPY --from=build /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build /repo/apps/admin-web/public ./apps/admin-web/public

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3100
CMD ["node", "apps/admin-web/server.js"]
