# RDS Postgres — 다중 AZ + PITR(자동 백업+WAL 아카이빙, RDS는 이를
# backup_retention_period(≥1)로 자동 관리한다 — RPO 15분은 RDS의 기본
# 트랜잭션 로그 백업 주기(수 분 단위)로 달성된다, C5(로컬 드릴)의 실측
# 절차와는 별개로 관리형 서비스가 자동 수행).

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project_name}-${var.environment}-db-subnet" }
}

# 마스터 계정 비밀번호는 Secrets Manager가 자동 생성·관리한다 — tfvars/
# 코드에 평문으로 남기지 않는다(STEP12 §A6 시크릿 관리 원칙).
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}"
  engine         = "postgres"
  engine_version = "17"

  instance_class        = var.db_instance_class
  allocated_storage     = 100
  max_allocated_storage = 500 # 스토리지 자동 확장(400여 사업장 규모 성장 대비)
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = "postgres"
  manage_master_user_password = true

  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period   = var.db_backup_retention_days
  backup_window              = "17:00-17:30" # UTC 17:00 = KST 02:00(야간 배치 시간대와 겹치지 않게)
  maintenance_window         = "sun:18:00-sun:19:00"
  copy_tags_to_snapshot      = true
  deletion_protection        = var.environment == "production"
  skip_final_snapshot        = var.environment != "production"
  final_snapshot_identifier  = var.environment == "production" ? "${var.project_name}-${var.environment}-final" : null

  # 무중단 배포 요구사항의 일부 — 마이너 버전 자동 패치는 유지보수 창에만.
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-${var.environment}-postgres"
  }
}
