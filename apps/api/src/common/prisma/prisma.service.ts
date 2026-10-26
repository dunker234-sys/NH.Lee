import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * 종료 순서: onModuleDestroy → beforeApplicationShutdown → onApplicationShutdown.
   * BullMQ 워커는 WorkerShutdownService가 beforeApplicationShutdown에서 닫는다(처리 중인 잡이
   * 끝날 때까지 대기). DB 연결은 그 뒤인 여기서 끊어야 한다 — onModuleDestroy에서 끊으면
   * 처리 중이던 잡이 끊긴 DB를 붙잡고 app.close()가 끝나지 않는다.
   */
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
