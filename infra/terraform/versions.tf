# STEP12: 국내 리전(ap-northeast-2) 기본 AWS IaC. 이 세션에는 실제 클라우드
# 계정이 없어 `terraform validate`/`plan`까지만 로컬에서 확인 가능하고
# `apply`는 하지 않는다(사용자 확정 스코프) — 실 계정을 연결한 뒤
# backend.tf(원격 상태 저장소, 예: S3+DynamoDB 락)를 추가하고 진행한다.

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # 실 계정 연결 후 아래 주석을 해제하고 값을 채운다(로컬 상태 파일을 그대로
  # 쓰면 팀 협업·CI 재현이 불가능하다).
  # backend "s3" {
  #   bucket         = "attendance-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "attendance-terraform-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
}
