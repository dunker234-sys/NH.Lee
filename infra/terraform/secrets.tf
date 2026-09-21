# 애플리케이션 시크릿 — apps/api/.env.example의 인벤토리와 대응된다.
# 값은 여기서 생성하지 않는다(랜덤 생성 후 최초 1회 aws cli로 채워 넣거나
# Terraform의 random_password 리소스를 쓸 수 있으나, 회전 가능성을 위해
# 초기값만 placeholder로 두고 실제 값은 AWS 콘솔/CLI에서 별도 설정한다).

locals {
  db_url_base = "postgresql://app_rw:REPLACE_AFTER_APPLY@${aws_db_instance.main.address}:5432/${var.db_name}?schema=public&connection_limit=40"
}

resource "aws_secretsmanager_secret" "api_env" {
  name        = "${var.project_name}/${var.environment}/api-env"
  description = "apps/api 런타임 시크릿 — JWT/암호화 키/DB 커넥션 문자열 일체"

  tags = { Name = "${var.project_name}-${var.environment}-api-env" }
}

# JSON 한 덩어리로 관리 — ECS 태스크 정의가 secrets 블록에서 JSON 키별로
# 개별 참조한다(아래 ecs.tf). 최초 apply 직후 REPLACE_* 값들을 실제
# 무작위 값(JWT 시크릿 openssl rand -base64 32, 암호화 키 openssl rand
# -hex 32×2, retention_job 비밀번호 등)으로 교체해야 한다 — 이 파일에
# 평문 프로덕션 값을 커밋하지 않는다(STEP12 §A6).
resource "aws_secretsmanager_secret_version" "api_env" {
  secret_id = aws_secretsmanager_secret.api_env.id
  secret_string = jsonencode({
    DATABASE_URL               = local.db_url_base
    RETENTION_JOB_DATABASE_URL = "postgresql://retention_job:REPLACE_AFTER_APPLY@${aws_db_instance.main.address}:5432/${var.db_name}?schema=public"
    JWT_ACCESS_SECRET          = "REPLACE_AFTER_APPLY"
    JWT_REFRESH_SECRET         = "REPLACE_AFTER_APPLY"
    QR_TOTP_ENCRYPTION_KEY     = "REPLACE_AFTER_APPLY_64_HEX_CHARS"
    PII_ENCRYPTION_KEY         = "REPLACE_AFTER_APPLY_64_HEX_CHARS_DIFFERENT_FROM_ABOVE"
    CORS_ALLOWED_ORIGINS       = ""
  })

  lifecycle {
    # apply 이후 콘솔/CLI로 교체한 실제 값을 다음 plan이 REPLACE_*로 되돌리지
    # 않도록 한다 — Terraform은 최초 생성만 책임지고 값 교체는 별도 운영
    # 절차(런북)로 다룬다.
    ignore_changes = [secret_string]
  }
}
