# ElastiCache Redis — BullMQ(10개 큐)의 브로커. Multi-AZ 자동 페일오버로
# 무중단 요구사항을 만족한다.

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-redis-subnet"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description           = "BullMQ 브로커 — attendance ${var.environment}"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.small"
  port           = 6379

  num_cache_clusters         = var.db_multi_az ? 2 : 1
  automatic_failover_enabled = var.db_multi_az
  multi_az_enabled           = var.db_multi_az

  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = { Name = "${var.project_name}-${var.environment}-redis" }
}
