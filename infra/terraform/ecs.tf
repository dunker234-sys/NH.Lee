# ECS Fargate — api 컨테이너. 무중단 배포는 deployment_minimum_healthy_percent=100/
# maximum_percent=200(신규 태스크를 먼저 healthy로 띄운 뒤 구 태스크 종료 —
# rolling) + ALB 타겟그룹 health_check(alb.tf)가 함께 만든다.
# migrate 스테이지(Dockerfile의 migrate 타겟, docker-migrate.sh)는 배포 파이프라인의
# 별도 one-off 태스크로 실행한다(장기 실행 서비스에 baked-in하지 않음 — Dockerfile
# 주석과 동일한 원칙). 이 IaC에서는 정의만 해 두고(aws_ecs_task_definition.migrate)
# 실제 RunTask 호출은 GitHub Actions deploy 워크플로에서 `aws ecs run-task`로 수행한다.

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${var.project_name}-${var.environment}-cluster" }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-${var.environment}-api"
  retention_in_days = 30
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-${var.environment}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# 실행 롤이 Secrets Manager 값을 읽어 컨테이너 env로 주입할 수 있어야 한다
# (task definition의 secrets 블록, 아래 참고).
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.project_name}-${var.environment}-ecs-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.api_env.arn]
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

locals {
  # Secrets Manager JSON의 각 키를 컨테이너 개별 env var로 매핑 —
  # secrets.tf의 aws_secretsmanager_secret_version.api_env 키와 1:1 대응.
  api_env_secret_keys = [
    "DATABASE_URL",
    "RETENTION_JOB_DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "QR_TOTP_ENCRYPTION_KEY",
    "PII_ENCRYPTION_KEY",
    "CORS_ALLOWED_ORIGINS",
  ]

  api_secrets = [
    for k in local.api_env_secret_keys : {
      name      = k
      valueFrom = "${aws_secretsmanager_secret.api_env.arn}:${k}::"
    }
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = var.api_image
    essential = true

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = var.environment == "production" ? "production" : "staging" },
      { name = "PORT", value = "3000" },
    ]

    secrets = local.api_secrets

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])

  tags = { Name = "${var.project_name}-${var.environment}-api-task" }
}

# 마이그레이션 one-off 태스크 — 같은 이미지, 다른 커맨드(Dockerfile의 migrate 스테이지가
# 아니라 runtime 이미지에서 docker-migrate.sh를 커맨드 오버라이드로 실행하는 대신,
# 실제로는 CI가 migrate 스테이지를 별도 태그로 push해 image만 바꿔 낀다 — ci.yml 참고).
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.project_name}-${var.environment}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = replace(var.api_image, ":latest", ":migrate")
    essential = true
    command   = ["./docker-migrate.sh"]

    secrets = local.api_secrets

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])

  tags = { Name = "${var.project_name}-${var.environment}-migrate-task" }
}

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name    = "api"
    container_port    = 3000
  }

  # 무중단 배포(rolling): 배포 중 최소 100%(구 태스크 전량 유지) ~ 최대 200%
  # (신규 태스크를 추가로 띄운 뒤 healthy 확인 후 구 태스크 종료).
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent          = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener.https]

  lifecycle {
    ignore_changes = [task_definition] # CI가 새 태스크 정의로 배포 — Terraform이 되돌리지 않는다.
  }

  tags = { Name = "${var.project_name}-${var.environment}-api-service" }
}
