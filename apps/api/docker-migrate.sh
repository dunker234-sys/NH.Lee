#!/bin/sh
# STEP12: docs/DATA_MODEL.md가 문서화한 배포 순서를 그대로 스크립트로
# 옮긴다: (roles.sql은 postgres 컨테이너 init 스크립트가 이미 실행함) →
# prisma migrate deploy → roles_post_migrate.sql(retention_job 등 권한
# 부여, 테이블이 존재해야 하므로 마이그레이션 이후) → 기본 시드 →
# 9개 정책 시드. MIGRATOR_DATABASE_URL로 접속(app_rw가 아니라 스키마
# 소유자 권한).
set -eu

echo "[1/3] prisma migrate deploy"
DATABASE_URL="$MIGRATOR_DATABASE_URL" npx prisma migrate deploy

echo "[2/3] roles_post_migrate.sql 적용"
psql "$MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/roles_post_migrate.sql

echo "[3/3] 시드 실행"
DATABASE_URL="$APP_DATABASE_URL" npx prisma db seed
for script in \
  seed-recalculation-policy seed-schedule-policy seed-approval-policy \
  seed-leave-policy seed-correction-policy seed-weekly-alert-policy \
  seed-night-work-health-checkup-policy seed-hr-sync-policy seed-payroll-policy; do
  echo "  - ${script}.ts"
  DATABASE_URL="$APP_DATABASE_URL" npx ts-node --transpile-only "prisma/${script}.ts"
done

echo "마이그레이션+시드 완료"
