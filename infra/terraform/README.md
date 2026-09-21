# Terraform — 국내 리전(`ap-northeast-2`) 배포 인프라

STEP12(운영 배포 마무리) 산출물. 이 IaC는 **완결된 상태로 작성되었으나, 이
세션에는 실제 AWS 계정이 없어 `terraform apply`를 수행하지 않았다.** 문법·구조
검증은 `terraform validate`/`terraform plan` 수준까지만 하도록 범위가
정해져 있다(사용자 확정 사항). 이 환경에는 `terraform` CLI 자체도 설치되어
있지 않아(`which terraform` 확인됨), 그 수준의 검증조차 이 세션에서는
실행하지 못했다 — 실제 적용 전 반드시 `terraform` 설치 환경에서
`terraform init && terraform validate`를 먼저 실행할 것.

## 구성 요소

| 파일 | 내용 |
|---|---|
| `versions.tf` | Terraform/AWS provider 버전 고정, S3 백엔드(주석 처리 — 실계정 연결 시 활성화) |
| `variables.tf` | 전체 입력 변수. placeholder 기본값은 아래 표 참고 |
| `vpc.tf` | VPC, 다중 AZ 퍼블릭/프라이빗 서브넷, AZ별 NAT 게이트웨이 |
| `security-groups.tf` | alb/api/rds/redis 최소권한 체이닝 |
| `rds.tf` | Postgres 17, Multi-AZ, 암호화, 자동 백업(PITR 근거) |
| `redis.tf` | ElastiCache Redis 7.1, Multi-AZ 자동 페일오버 |
| `secrets.tf` | Secrets Manager — apps/api 런타임 시크릿 JSON 1건 |
| `ecs.tf` | Fargate 클러스터, api 태스크 정의(+migrate one-off 태스크 정의), rolling 무중단 서비스 |
| `alb.tf` | ALB, HTTP→HTTPS 리다이렉트, HTTPS 리스너, api 타겟그룹(health check) |
| `outputs.tf` | ALB DNS, RDS/Redis 엔드포인트, ECS 클러스터명, 시크릿 ARN 등 |

## `apply` 전 실값으로 채워야 하는 변수

| 변수 | 위치 | 현재 값 | 실값 확보 방법 |
|---|---|---|---|
| `environment` | `variables.tf` (기본값 없음, 필수 입력) | — | `terraform apply -var="environment=staging"` 등으로 직접 지정 |
| `api_image` | `variables.tf` | `REPLACE_ME.dkr.ecr.../attendance-api:latest` | ECR 레포지토리 생성 후 CI(`ci.yml`의 build job)가 push한 이미지 URI로 교체 |
| `domain_name` | `variables.tf` | `""`(빈 값 — ALB DNS로 대체 접속) | 실제 도메인 확정 후 Route53에 등록 |
| `acm_certificate_arn` | `variables.tf` | `""` | `domain_name` 확정 후 `aws_acm_certificate`(DNS 검증)로 별도 발급, 이 IaC 범위 밖(순환 의존 방지 — 인증서 검증에 도메인이 먼저 필요) |
| Secrets Manager 내부 값 | `secrets.tf`의 `aws_secretsmanager_secret_version.api_env` | `REPLACE_AFTER_APPLY` 7개 | `apply` 직후 AWS CLI/콘솔로 1회 교체(`ignore_changes`로 이후 plan이 되돌리지 않음). 생성 방법: `openssl rand -base64 32`(JWT 2종), `openssl rand -hex 32`(암호화 키 2종, 서로 달라야 함), RDS 마스터 계정 비밀번호는 `outputs.tf`의 `db_master_user_secret_arn`에서 조회 후 `app_rw`/`migrator`/`retention_job` 롤을 `docs/DATA_MODEL.md`의 `roles.sql` 절차로 직접 생성 |
| S3 백엔드 (`versions.tf`) | 주석 처리됨 | — | 실계정에서 상태 저장용 S3 버킷+DynamoDB 락 테이블을 먼저 만든 뒤 주석 해제 |

## 적용 순서(실계정 확보 후)

1. `terraform init` (백엔드 활성화 후)
2. `terraform plan -var="environment=staging"` — 위 표의 필수 변수 확인
3. `terraform apply`
4. Secrets Manager 값 교체(위 표), `roles.sql`/`roles_post_migrate.sql`로 DB 롤 생성
5. `aws ecs run-task`로 `migrate` 태스크 정의 1회 실행(스키마 마이그레이션+시드)
6. `api` 서비스가 자동으로 `desired_count`만큼 기동 → ALB 헬스체크 통과 확인
7. `acm_certificate_arn` 발급 후 `terraform apply` 재실행으로 HTTPS 활성화

## 무중단 배포가 동작하는 방식

`ecs.tf`의 `deployment_minimum_healthy_percent=100`/`maximum_percent=200`은
배포 중 신규 태스크를 먼저 추가로 띄우고, `alb.tf`의 타겟그룹 health check(`/health`
경로, 2회 연속 성공 시 healthy)를 통과한 뒤에만 ALB가 트래픽을 라우팅하며, 그
다음에야 구 태스크를 종료한다(rolling). `deployment_circuit_breaker`로 배포
실패 시 자동 롤백된다. 이 조합이 GitHub Actions `deploy-production` 잡의
"승인 후 무중단 배포" 요구사항을 만족한다.

## 이 세션에서 실제로 검증한 것 / 안 한 것

- **검증함**: 3개 YAML(`ci.yml`/`mobile-ci.yml`/`docker-compose.yml`)은 `js-yaml`
  스크래치 설치로 파싱 문법 검증 완료. Dockerfile 3종은 로컬에 `docker` CLI가
  없어 실제 빌드는 못 했으나 멀티스테이지 문법을 수동 재검토함.
- **검증 안 함**: `terraform validate`/`plan`(CLI 없음), `terraform apply`(실계정
  없음, 사용자 확정 범위 제외), `docker build`/`docker-compose up`(CLI 없음).
- 로컬에서 실제로 실행·측정한 것은 STEP12 플랜의 C5(백업/PITR 로컬 RTO 드릴)뿐이며,
  이는 로컬 네이티브 Postgres 17 대상이지 이 Terraform 인프라 대상이 아니다 —
  `docs/DISASTER_RECOVERY.md`에 그 구분을 명시한다.
