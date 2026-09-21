variable "aws_region" {
  description = "CLAUDE.md §3 기본값 — 데이터 주권 요건 발생 시 NCP/KT Cloud 재검토 대상."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  type    = string
  default = "attendance"
}

variable "environment" {
  description = "staging 또는 production. GitHub Actions의 environment와 대응된다."
  type        = string
}

# --- 네트워크: 다중 AZ ---
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "az_count" {
  description = "다중 AZ 요구사항 — 최소 2."
  type        = number
  default     = 2
}

# --- RDS Postgres ---
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_name" {
  type    = string
  default = "attendance"
}

variable "db_multi_az" {
  description = "다중 AZ 무중단 요구사항 — production은 반드시 true."
  type        = bool
  default     = true
}

variable "db_backup_retention_days" {
  description = "RPO 15분 목표는 PITR(WAL 아카이빙)로 달성한다 — 이 값은 스냅샷+WAL 보존기간."
  type        = number
  default     = 7
}

# --- ECS Fargate ---
variable "api_image" {
  description = "ECR 레포지토리:태그. CI의 build 단계 산출물을 push한 뒤 여기에 넣는다."
  type        = string
  default     = "REPLACE_ME.dkr.ecr.ap-northeast-2.amazonaws.com/attendance-api:latest"
}

variable "api_desired_count" {
  description = "무중단 배포(rolling update)를 위해 최소 2 — 배포 중 항상 1개 이상 가용."
  type        = number
  default     = 2
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

# --- 도메인/인증서 (실 계정 연결 전까지 placeholder) ---
variable "domain_name" {
  description = "실제 도메인이 정해지면 채운다 — 그 전까지는 ALB DNS 이름을 그대로 쓴다."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "HTTPS 리스너용 ACM 인증서 ARN. domain_name 확정 후 aws_acm_certificate(DNS 검증)로 별도 발급 — 이 세션은 실계정이 없어 미발급, README.md 참고."
  type        = string
  default     = ""
}
