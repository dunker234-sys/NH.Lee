import { WorkerHost } from '@nestjs/bullmq';
import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

/**
 * 모든 BullMQ 워커를 DB 연결보다 먼저 닫는다.
 *
 * Nest 종료 순서는 onModuleDestroy → beforeApplicationShutdown → onApplicationShutdown이다.
 * @nestjs/bullmq는 워커를 맨 마지막(onApplicationShutdown)에 닫는데, PrismaService가 앞 단계
 * (onModuleDestroy)에서 $disconnect()하면 처리 중이던 잡이 끊긴 DB를 붙잡은 채 Worker.close()가
 * 끝나지 않는다(e2e에서 app.close()가 30초 넘게 멈추고 이후 스위트까지 연쇄 실패한 원인).
 * Worker.close()는 진행 중인 잡이 끝나길 기다리고, 두 번 불러도 안전하다(이후 단계의 정상 종료와 겹쳐도 무해).
 * DB 연결은 모두 onApplicationShutdown에서 끊는다(PrismaService 등).
 */
@Injectable()
export class WorkerShutdownService implements BeforeApplicationShutdown {
  constructor(private readonly discovery: DiscoveryService) {}

  async beforeApplicationShutdown(): Promise<void> {
    const hosts = this.discovery
      .getProviders()
      .map((wrapper) => wrapper.instance)
      .filter((instance): instance is WorkerHost => instance instanceof WorkerHost);

    await Promise.all(
      hosts.map(async (host) => {
        try {
          await host.worker.close();
        } catch {
          // 워커가 아직 초기화되지 않았거나 이미 닫힌 경우 — 종료를 막지 않는다.
        }
      }),
    );
  }
}
