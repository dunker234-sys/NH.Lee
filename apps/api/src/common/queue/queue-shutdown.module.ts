import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { WorkerShutdownService } from './worker-shutdown.service';

@Module({
  imports: [DiscoveryModule],
  providers: [WorkerShutdownService],
})
export class QueueShutdownModule {}
