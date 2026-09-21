import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { AccessLogModule } from './common/access-log/access-log.module';
import { EmployeeProtectedStatusModule } from './common/employee-protected-status/employee-protected-status.module';
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
import { RetentionModule } from './modules/retention/retention.module';
import { OpsMonitoringModule } from './modules/ops-monitoring/ops-monitoring.module';
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
    // STEP12: 전역 기본 rate limit(분당 300req/IP). 더 엄격/관대한 값이
    // 필요한 엔드포인트(로그인, 타각)는 각 컨트롤러에서 @Throttle로 재정의한다.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 300 }]),
    PrismaModule,
    AuditLogModule,
    AccessLogModule,
    EmployeeProtectedStatusModule,
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
    RetentionModule,
    OpsMonitoringModule,
  ],
  providers: [
    // 실행 순서: ThrottlerGuard(rate limit, 인증 전에 넘치는 요청부터 걸러
    // 낸다) → JwtAuthGuard(토큰 검증) → PrincipalGuard(DB에서 principal/scope
    // 재계산 + 비밀번호 변경 강제) → RolesGuard(역할 게이트). @Public()으로
    // 나머지 셋은 우회 가능하지만 ThrottlerGuard는 @Public() 엔드포인트
    // (로그인 등)에도 그대로 적용된다 — 오히려 그게 목적이다.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
  ],
})
export class AppModule {}
