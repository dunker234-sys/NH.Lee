import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessLogModule } from './common/access-log/access-log.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { AuditIntegrityModule } from './modules/audit-integrity/audit-integrity.module';
import { CorrectionModule } from './modules/correction/correction.module';
import { LeaveModule } from './modules/leave/leave.module';
import { MigrationModule } from './modules/migration/migration.module';
import { NightWorkHealthCheckupModule } from './modules/night-work-health-checkup/night-work-health-checkup.module';
import { ComplianceReportsModule } from './modules/compliance-reports/compliance-reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HrSyncModule } from './modules/hr-sync/hr-sync.module';
import { PayrollCloseModule } from './modules/payroll-close/payroll-close.module';
import { AuditLogModule } from './common/audit/audit-log.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PrincipalGuard } from './common/guards/principal.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AccessLogInterceptor } from './common/interceptors/access-log.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { PrincipalModule } from './common/principal/principal.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { PunchModule } from './common/punch/punch.module';
import { ScopeModule } from './common/scope/scope.module';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { ConsentModule } from './modules/consent/consent.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { KioskDevicesModule } from './modules/kiosk-devices/kiosk-devices.module';
import { KioskPunchesModule } from './modules/kiosk-punches/kiosk-punches.module';
import { NoShowDetectionModule } from './modules/no-show-detection/no-show-detection.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PunchesModule } from './modules/punches/punches.module';
import { SitesModule } from './modules/sites/sites.module';
import { RecalculationModule } from './modules/recalculation/recalculation.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { SystemBatchModule } from './modules/system-batch/system-batch.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { host: config.get<string>('redis.host'), port: config.get<number>('redis.port') },
      }),
    }),
    PrismaModule,
    AuditLogModule,
    AccessLogModule,
    PrincipalModule,
    ScopeModule,
    PunchModule,
    AuthModule,
    EmployeesModule,
    SystemBatchModule,
    RecalculationModule,
    PunchesModule,
    NoShowDetectionModule,
    NotificationsModule,
    SitesModule,
    ConsentModule,
    KioskDevicesModule,
    KioskPunchesModule,
    ScheduleModule,
    ApprovalModule,
    LeaveModule,
    MigrationModule,
    CorrectionModule,
    AuditIntegrityModule,
    NightWorkHealthCheckupModule,
    ComplianceReportsModule,
    DashboardModule,
    HrSyncModule,
    PayrollCloseModule,
  ],
  providers: [
    // 실행 순서: JwtAuthGuard(토큰 검증) → PrincipalGuard(DB에서 principal/scope
    // 재계산 + 비밀번호 변경 강제) → RolesGuard(역할 게이트). @Public()으로
    // 셋 다 우회 가능.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
  ],
})
export class AppModule {}
