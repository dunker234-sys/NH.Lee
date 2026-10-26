#!/usr/bin/env bash
# NCP VM에서 실행된다(CI가 SSH로 호출). 필수 환경변수: GHCR_USER, IMAGE_REPO, IMAGE_TAG.
# GHCR 토큰은 stdin으로 들어온다(서버에 저장하지 않는다).
set -euo pipefail

cd /opt/attendance

[ -f .env ] || { echo "ERROR: /opt/attendance/.env 가 없습니다(infra/ncp/.env.example 참고)."; exit 1; }

# 이번 배포의 이미지 태그만 .env에서 갱신한다(시크릿은 건드리지 않는다).
upsert() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
upsert IMAGE_REPO "$IMAGE_REPO"
upsert IMAGE_TAG "$IMAGE_TAG"

docker login ghcr.io -u "$GHCR_USER" --password-stdin
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

COMPOSE="docker compose -f docker-compose.prod.yml"
$COMPOSE pull
# migrate가 service_completed_successfully여야 api가 뜬다. 실패하면 여기서 중단되고
# 기존 api 컨테이너는 그대로 유지된다(새 이미지로 교체되지 않음).
$COMPOSE up -d --remove-orphans

echo "== 상태 =="
$COMPOSE ps

# api 헬스 확인(최대 ~2분). 실패 시 로그를 남기고 비정상 종료한다.
for i in $(seq 1 24); do
  status=$($COMPOSE ps --format '{{.Health}}' api 2>/dev/null || true)
  if [ "$status" = "healthy" ]; then echo "api healthy"; exit 0; fi
  sleep 5
done
echo "ERROR: api 가 healthy 상태가 되지 않았습니다."
$COMPOSE logs --tail 80 api migrate
exit 1
