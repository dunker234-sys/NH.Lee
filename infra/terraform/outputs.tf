output "alb_dns_name" {
  description = "도메인 연결 전까지 이 주소로 직접 접속 가능(HTTPS 리스너는 acm_certificate_arn 설정 후 유효)."
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "DATABASE_URL 구성에 사용 — 실제 비밀번호는 Secrets Manager(aws_db_instance.main.master_user_secret)에서 조회."
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "api_secrets_arn" {
  description = "GitHub Actions deploy 워크플로가 REPLACE_AFTER_APPLY 값을 교체할 때 참조."
  value       = aws_secretsmanager_secret.api_env.arn
}

output "db_master_user_secret_arn" {
  description = "RDS 마스터 계정 비밀번호(Secrets Manager 자동 생성) — app_rw/migrator/retention_job 롤 생성 시 1회성으로 사용."
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
  sensitive   = true
}
