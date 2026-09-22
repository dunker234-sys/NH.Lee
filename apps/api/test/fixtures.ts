import { EmployeeRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  RECALCULATION_POLICY_DEFAULTS,
  RECALCULATION_POLICY_EFFECTIVE_FROM,
} from '../prisma/recalculation-policy-defaults';
import { PUNCH_POLICY_DEFAULTS, PUNCH_POLICY_EFFECTIVE_FROM } from '../prisma/punch-policy-defaults';
import {
  NOTIFICATION_POLICY_DEFAULTS,
  NOTIFICATION_POLICY_EFFECTIVE_FROM,
} from '../prisma/notification-policy-defaults';
import { CONSENT_POLICY_DEFAULTS, CONSENT_POLICY_EFFECTIVE_FROM } from '../prisma/consent-policy-defaults';
import { KIOSK_POLICY_DEFAULTS, KIOSK_POLICY_EFFECTIVE_FROM } from '../prisma/kiosk-policy-defaults';
import { SCHEDULE_POLICY_DEFAULTS, SCHEDULE_POLICY_EFFECTIVE_FROM } from '../prisma/schedule-policy-defaults';
import { APPROVAL_POLICY_DEFAULTS, APPROVAL_POLICY_EFFECTIVE_FROM } from '../prisma/approval-policy-defaults';
import { LEAVE_ACCRUAL_BASIS_DEFAULT, LEAVE_POLICY_DEFAULTS, LEAVE_POLICY_EFFECTIVE_FROM } from '../prisma/leave-policy-defaults';
import { CORRECTION_POLICY_DEFAULTS, CORRECTION_POLICY_EFFECTIVE_FROM } from '../prisma/correction-policy-defaults';
import { WEEKLY_ALERT_POLICY_DEFAULTS, WEEKLY_ALERT_POLICY_EFFECTIVE_FROM } from '../prisma/weekly-alert-policy-defaults';
import {
  NIGHT_WORK_HEALTH_CHECKUP_POLICY_DEFAULTS,
  NIGHT_WORK_HEALTH_CHECKUP_POLICY_EFFECTIVE_FROM,
} from '../prisma/night-work-health-checkup-policy-defaults';
import { HR_SYNC_POLICY_DEFAULTS, HR_SYNC_POLICY_EFFECTIVE_FROM } from '../prisma/hr-sync-policy-defaults';
import { PAYROLL_POLICY_DEFAULTS, PAYROLL_POLICY_EFFECTIVE_FROM } from '../prisma/payroll-policy-defaults';
import { createHash, randomBytes } from 'crypto';
import { adminPrisma } from './setup/db';

export interface FixtureEmployee {
  id: string;
  employeeNo: string;
}

export interface Fixture {
  siteA: { id: string; lat: number; lng: number };
  siteB: { id: string; lat: number; lng: number };
  employees: {
    siteManagerA: FixtureEmployee;
    siteManagerB: FixtureEmployee;
    hqHr: FixtureEmployee;
    regional: FixtureEmployee;
    admin: FixtureEmployee;
    plainEmployeeA: FixtureEmployee;
  };
  password: string;
}

/**
 * 소수 인원짜리 최소 픽스처. STEP 1의 50명 시드(prisma/seed.ts)는 개발용 데모
 * 데이터라 여기서는 재사용하지 않는다 — 가드 테스트에 필요한 최소 조합만 만든다.
 */
export async function loadFixture(): Promise<Fixture> {
  const password = 'Fixture!Pass123';
  // 테스트 전용: 라운드 수를 낮춰 속도를 확보한다(운영 코드는 AuthService에서 10 사용).
  const passwordHash = await bcrypt.hash(password, 4);

  const region = await adminPrisma.region.create({ data: { code: 'RG-TEST', name: '테스트권역' } });
  // 서울시청 인근 좌표. siteA/siteB는 지오펜스 판정 테스트가 "반경 안/밖"을
  // 만들어낼 수 있도록 실제 좌표를 가진다.
  const SITE_A_LAT = 37.5665;
  const SITE_A_LNG = 126.978;
  const siteA = await adminPrisma.site.create({
    data: { code: 'SITE-TEST-A', name: '테스트사업장A', regionId: region.id, lat: SITE_A_LAT, lng: SITE_A_LNG },
  });
  const SITE_B_LAT = 37.5;
  const SITE_B_LNG = 127.05;
  const siteB = await adminPrisma.site.create({
    data: { code: 'SITE-TEST-B', name: '테스트사업장B', regionId: region.id, lat: SITE_B_LAT, lng: SITE_B_LNG },
  });

  async function makeEmployee(no: string, role: EmployeeRole, siteId: string): Promise<FixtureEmployee> {
    const employee = await adminPrisma.employee.create({
      data: {
        employeeNo: no,
        name: `테스트-${no}`,
        employmentType: 'REGULAR',
        hireDate: new Date('2024-01-01'),
        primarySiteId: siteId,
        role,
      },
    });
    await adminPrisma.employeeCredential.create({
      data: { employeeId: employee.id, passwordHash, mustChangePassword: false },
    });
    await adminPrisma.employeeSiteAssignment.create({
      data: { employeeId: employee.id, siteId, assignmentRole: 'PRIMARY', startDate: new Date('2024-01-01') },
    });
    return { id: employee.id, employeeNo: employee.employeeNo };
  }

  const siteManagerA = await makeEmployee('T-SM-A', 'SITE_MANAGER', siteA.id);
  const siteManagerB = await makeEmployee('T-SM-B', 'SITE_MANAGER', siteB.id);
  const hqHr = await makeEmployee('T-HQHR', 'HQ_HR', siteA.id);
  const regional = await makeEmployee('T-REGIONAL', 'REGIONAL', siteA.id);
  const admin = await makeEmployee('T-ADMIN', 'ADMIN', siteA.id);
  const plainEmployeeA = await makeEmployee('T-EMP-A', 'EMPLOYEE', siteA.id);

  return {
    siteA: { id: siteA.id, lat: SITE_A_LAT, lng: SITE_A_LNG },
    siteB: { id: siteB.id, lat: SITE_B_LAT, lng: SITE_B_LNG },
    employees: { siteManagerA, siteManagerB, hqHr, regional, admin, plainEmployeeA },
    password,
  };
}

/** RecalculationService/PolicyConfigResolverService가 요구하는 policy_config 기본값. */
export async function loadPolicyConfigFixture(): Promise<void> {
  for (const v of RECALCULATION_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: RECALCULATION_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** PunchPolicyResolverService/FraudDetectionService가 요구하는 policy_config 기본값. */
export async function loadPunchPolicyConfigFixture(): Promise<void> {
  for (const v of PUNCH_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: PUNCH_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** NotificationPolicyResolverService가 요구하는 policy_config 기본값(조용시간). */
export async function loadNotificationPolicyConfigFixture(): Promise<void> {
  for (const v of NOTIFICATION_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: NOTIFICATION_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** ConsentPolicyResolverService가 요구하는 policy_config 기본값(location_consent_policy_version).
 * location_retention_days는 loadPunchPolicyConfigFixture가 이미 채우므로 여기서 다시 넣지 않는다 —
 * 두 픽스처를 함께 로드해야 ConsentService.getPolicy()가 완전한 값을 읽는다. */
export async function loadConsentPolicyConfigFixture(): Promise<void> {
  for (const v of CONSENT_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: CONSENT_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** 사업장에 NFC 태그 UID를 등록한다. QR TOTP 시크릿 프로비저닝은
 * QrSecretProvisioningService(암호화가 필요해 앱 서비스를 직접 호출)를 쓴다. */
export async function loadSiteNfcTagFixture(siteId: string, nfcTagUid: string): Promise<void> {
  await adminPrisma.siteVerificationSignal.create({
    data: { siteId, signalType: 'NFC_TAG', value: nfcTagUid },
  });
}

/** KioskPolicyResolverService가 요구하는 policy_config 기본값(PIN 잠금 임계값). */
export async function loadKioskPolicyConfigFixture(): Promise<void> {
  for (const v of KIOSK_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: KIOSK_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** SchedulePolicyResolverService가 요구하는 policy_config 기본값(STEP6). */
export async function loadSchedulePolicyConfigFixture(): Promise<void> {
  for (const v of SCHEDULE_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: SCHEDULE_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** ApprovalPolicyResolverService가 요구하는 policy_config 기본값(STEP6.5, 조기출근 반복 탐지). */
export async function loadApprovalPolicyConfigFixture(): Promise<void> {
  for (const v of APPROVAL_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: APPROVAL_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** LeavePolicyResolverService/LeaveAccrualBasisResolverService가 요구하는
 * policy_config 기본값(STEP7, 연차 발생·촉진 기한). */
export async function loadLeavePolicyConfigFixture(): Promise<void> {
  for (const v of LEAVE_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: LEAVE_POLICY_EFFECTIVE_FROM,
      },
    });
  }
  await adminPrisma.policyConfig.create({
    data: {
      key: LEAVE_ACCRUAL_BASIS_DEFAULT.key,
      value: LEAVE_ACCRUAL_BASIS_DEFAULT.value as never,
      siteId: null,
      effectiveStartDate: LEAVE_POLICY_EFFECTIVE_FROM,
    },
  });
}

/** CorrectionPolicyResolverService가 요구하는 policy_config 기본값(STEP8, 정정 신청 기한·2차 승인 요건). */
export async function loadCorrectionPolicyConfigFixture(): Promise<void> {
  for (const v of CORRECTION_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: CORRECTION_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** WeeklyAlertPolicyResolverService가 요구하는 policy_config 기본값(STEP9, 52시간 알림 임계값). */
export async function loadWeeklyAlertPolicyConfigFixture(): Promise<void> {
  for (const v of WEEKLY_ALERT_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: WEEKLY_ALERT_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** NightWorkHealthCheckupPolicyResolverService가 요구하는 policy_config 기본값(STEP9). */
export async function loadNightWorkHealthCheckupPolicyConfigFixture(): Promise<void> {
  for (const v of NIGHT_WORK_HEALTH_CHECKUP_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: NIGHT_WORK_HEALTH_CHECKUP_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** HrSyncPolicyResolverService가 요구하는 policy_config 기본값(STEP10, 자동적용 변경비율 임계값). */
export async function loadHrSyncPolicyConfigFixture(): Promise<void> {
  for (const v of HR_SYNC_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: HR_SYNC_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** PayrollPolicyResolverService/PayrollValidationPolicyResolverService가 요구하는 policy_config 기본값(STEP11). */
export async function loadPayrollPolicyConfigFixture(): Promise<void> {
  for (const v of PAYROLL_POLICY_DEFAULTS) {
    await adminPrisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: PAYROLL_POLICY_EFFECTIVE_FROM,
      },
    });
  }
}

/** 지정한 직원에게 키오스크 PIN을 설정한다(테스트 전용: 저비용 bcrypt). */
export async function setEmployeePinFixture(employeeId: string, pin: string): Promise<void> {
  const pinHash = await bcrypt.hash(pin, 4);
  await adminPrisma.employeeCredential.update({ where: { employeeId }, data: { pinHash, pinSetAt: new Date() } });
}

/** 사업장에 키오스크 기기를 등록하고 평문 페어링 토큰을 돌려준다(운영 코드의
 * KioskDevicesService.provision()과 같은 해시 규칙 — sha256, 테스트에서는
 * 직접 재현한다). */
export async function loadKioskDeviceFixture(
  siteId: string,
  label: string,
  createdBy: string,
): Promise<{ id: string; credential: string }> {
  const credential = randomBytes(32).toString('hex');
  const credentialHash = createHash('sha256').update(credential, 'utf8').digest('hex');
  const device = await adminPrisma.kioskDevice.create({
    data: { siteId, label, credentialHash, createdBy },
  });
  return { id: device.id, credential };
}

/** 사업장 PC 타각 IP 허용목록에 CIDR을 추가한다. */
export async function loadSiteIpAllowlistFixture(siteId: string, cidr: string, label?: string): Promise<void> {
  await adminPrisma.siteIpAllowlist.create({ data: { siteId, cidr, label } });
}

export interface BulkSiteFixture {
  site: { id: string };
  siteManager: FixtureEmployee;
  hqHr: FixtureEmployee;
  employees: FixtureEmployee[]; // siteManager 포함, employeeCount명 전체
  password: string;
}

/**
 * STEP7.5(개시 데이터 이관) 완료조건1 "50명 규모 사업장 샘플" 등에 쓰는
 * 대량 픽스처. prisma/seed.ts의 50명 생성 루프(고용형태 분배 등)를 재현할
 * 필요는 없다 — 이관 검증은 employeeNo 매칭·잔액 계산만 다루므로 전원
 * REGULAR로 단순화한다. labelSuffix로 같은 테스트 파일 안에서 여러 사업장을
 * 만들 때 code 충돌을 피한다.
 */
export async function loadBulkSiteFixture(employeeCount: number, labelSuffix?: string): Promise<BulkSiteFixture> {
  const password = 'Fixture!Pass123';
  const passwordHash = await bcrypt.hash(password, 4);
  const suffix = labelSuffix ?? randomBytes(3).toString('hex');

  const region = await adminPrisma.region.create({ data: { code: `RG-BULK-${suffix}`, name: '대량테스트권역' } });
  const site = await adminPrisma.site.create({ data: { code: `SITE-BULK-${suffix}`, name: '대량테스트사업장', regionId: region.id } });

  const employees: FixtureEmployee[] = [];
  for (let i = 0; i < employeeCount; i++) {
    const employeeNo = `M${suffix}${String(i + 1).padStart(4, '0')}`;
    const hireYear = 2015 + (i % 10);
    const hireDate = new Date(`${hireYear}-${String((i % 12) + 1).padStart(2, '0')}-01`);
    const employee = await adminPrisma.employee.create({
      data: {
        employeeNo,
        name: `대량-${suffix}-${i + 1}`,
        employmentType: 'REGULAR',
        hireDate,
        primarySiteId: site.id,
        role: i === 0 ? 'SITE_MANAGER' : 'EMPLOYEE',
      },
    });
    await adminPrisma.employeeCredential.create({ data: { employeeId: employee.id, passwordHash, mustChangePassword: false } });
    await adminPrisma.employeeSiteAssignment.create({ data: { employeeId: employee.id, siteId: site.id, assignmentRole: 'PRIMARY', startDate: hireDate } });
    employees.push({ id: employee.id, employeeNo });
  }

  const hqHrEmployee = await adminPrisma.employee.create({
    data: {
      employeeNo: `M${suffix}-HQHR`,
      name: `대량-${suffix}-HQHR`,
      employmentType: 'REGULAR',
      hireDate: new Date('2015-01-01'),
      primarySiteId: site.id,
      role: 'HQ_HR',
    },
  });
  await adminPrisma.employeeCredential.create({ data: { employeeId: hqHrEmployee.id, passwordHash, mustChangePassword: false } });
  await adminPrisma.employeeSiteAssignment.create({ data: { employeeId: hqHrEmployee.id, siteId: site.id, assignmentRole: 'PRIMARY', startDate: new Date('2015-01-01') } });

  return {
    site: { id: site.id },
    siteManager: employees[0],
    hqHr: { id: hqHrEmployee.id, employeeNo: hqHrEmployee.employeeNo },
    employees,
    password,
  };
}
