import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HrSyncPolicyResolverModule } from '../../common/policy/hr-sync-policy-resolver.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApiHrSourceAdapter } from './adapters/api-hr-source.adapter';
import { DB_QUERY_RUNNER } from './adapters/db-query-runner';
import { DbHrSourceAdapter } from './adapters/db-hr-source.adapter';
import { FileHrSourceAdapter } from './adapters/file-hr-source.adapter';
import { PgDbQueryRunner } from './adapters/pg-db-query-runner';
import { BearerTokenAuthStrategy } from './auth-strategies/bearer-token-auth.strategy';
import { HR_API_AUTH_STRATEGY } from './auth-strategies/hr-api-auth-strategy.interface';
import { OAuthClientCredentialsAuthStrategy } from './auth-strategies/oauth-client-credentials-auth.strategy';
import { HR_SOURCE_ADAPTER } from './hr-sync.types';
import { selectHrSourceAdapter } from './hr-sync-adapter.selector';
import { HrSyncApplyService } from './hr-sync-apply.service';
import { HrSyncConsumer } from './hr-sync.consumer';
import { HrSyncController } from './hr-sync.controller';
import { HrSyncScheduleService } from './hr-sync-schedule.service';
import { HrSyncService } from './hr-sync.service';
import { HrSyncTriggerService } from './hr-sync-trigger.service';
import { HR_SYNC_QUEUE_NAME } from './queue.constants';
import { PartnerCompaniesController } from './partner/partner-companies.controller';
import { PartnerCompaniesService } from './partner/partner-companies.service';
import { PartnerEmployeeExcelService } from './partner/partner-employee-excel.service';
import { MePartnerController } from './partner/me-partner.controller';

/**
 * HR_SOURCE_ADAPTER 팩토리 — HR_SYNC_ADAPTER_TYPE 설정값 한 줄로 File/Db/Api
 * 구현체 중 하나를 고른다. 세 구현체를 모두 provider로 등록해 두되(어차피
 * 각자 자기 설정값이 없으면 fetchAll() 호출 시점에만 에러를 던지므로
 * 모듈 부팅 비용은 무시할 만하다), 실제로 주입되는 건 하나뿐이다.
 */
@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: HR_SYNC_QUEUE_NAME,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 500 } },
    }),
    HrSyncPolicyResolverModule,
    NotificationsModule,
  ],
  controllers: [HrSyncController, PartnerCompaniesController, MePartnerController],
  providers: [
    HrSyncService,
    HrSyncApplyService,
    HrSyncScheduleService,
    HrSyncConsumer,
    HrSyncTriggerService,
    PartnerCompaniesService,
    PartnerEmployeeExcelService,
    FileHrSourceAdapter,
    DbHrSourceAdapter,
    ApiHrSourceAdapter,
    PgDbQueryRunner,
    BearerTokenAuthStrategy,
    OAuthClientCredentialsAuthStrategy,
    { provide: DB_QUERY_RUNNER, useExisting: PgDbQueryRunner },
    {
      provide: HR_API_AUTH_STRATEGY,
      useFactory: (config: ConfigService, bearer: BearerTokenAuthStrategy, oauth: OAuthClientCredentialsAuthStrategy) => {
        const strategy = config.get<string>('hrSync.api.authStrategy');
        return strategy === 'OAUTH_CLIENT_CREDENTIALS' ? oauth : bearer;
      },
      inject: [ConfigService, BearerTokenAuthStrategy, OAuthClientCredentialsAuthStrategy],
    },
    {
      provide: HR_SOURCE_ADAPTER,
      useFactory: (config: ConfigService, file: FileHrSourceAdapter, db: DbHrSourceAdapter, api: ApiHrSourceAdapter) =>
        selectHrSourceAdapter(config.get<string>('hrSync.adapterType'), { file, db, api }),
      inject: [ConfigService, FileHrSourceAdapter, DbHrSourceAdapter, ApiHrSourceAdapter],
    },
  ],
  exports: [HrSyncTriggerService, HrSyncService],
})
export class HrSyncModule {}
