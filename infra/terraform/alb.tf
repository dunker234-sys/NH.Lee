# ALB — HTTPS 종단 + api 타겟그룹. rolling/blue-green 무중단 배포는
# ecs.tf의 deployment_minimum_healthy_percent/maximum_percent와 이 타겟그룹의
# health_check가 함께 만든다(새 태스크가 healthy 판정을 받은 뒤에만 구 태스크 종료).

resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # 삭제 방지 — 실수로 인프라를 지웠을 때 서비스 전체 장애로 직결되는 리소스.
  enable_deletion_protection = var.environment == "production"

  tags = { Name = "${var.project_name}-${var.environment}-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-${var.environment}-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # Fargate는 awsvpc 네트워크 모드라 IP 타겟만 가능

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  # 무중단 배포: 기존 연결이 끝날 때까지 구 태스크를 바로 죽이지 않는다.
  deregistration_delay = 30

  tags = { Name = "${var.project_name}-${var.environment}-api-tg" }
}

# 운영 도메인/ACM 인증서는 이 세션에 실계정이 없어 발급 불가 — HTTPS 리스너는
# var.domain_name이 실값으로 채워지고 별도로 발급된 ACM 인증서 ARN이 있어야
# 완전히 동작한다(placeholder는 variables.tf 참고, README.md에 절차 기술).
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port               = 80
  protocol           = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port               = 443
  protocol           = "HTTPS"
  ssl_policy         = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn    = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
