import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * 기본 PrismaService(app_rw)와 물리적으로 분리된, retention_job 롤 전용
 * 커넥션. 이 롤은 punch_location(SELECT/DELETE), audit_log(INSERT),
 * punch_raw(SELECT-only)만 권한이 있다(roles_post_migrate.sql) — 이
 * 클라이언트로는 구조적으로 punch_raw를 UPDATE/DELETE할 수 없다.
 * 위치정보 파기 배치(punch-location-retention.service.ts)만 주입받아 쓴다.
 */
@Injectable()
export class RetentionPrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService) {
    super({ datasources: { db: { url: config.get<string>('retentionJobDatabaseUrl') } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // PrismaService와 같은 이유 — 워커(beforeApplicationShutdown)가 닫힌 뒤에 끊는다.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
