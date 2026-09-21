// STEP 1 완료 조건 충족용 시드 데이터.
//   - 사업장 5개 (그중 1개는 5인 미만)
//   - 직원 50명 (일용·단시간·파견 포함)
//   - 교대 패턴 3종
//   - 2026년 공휴일 캘린더
// 그 외 정책 기본값(policy_config)·휴가 유형(leave_type)·한 주 스케줄·예시 타각 몇 건을
// 곁들여 모델이 실제로 맞물려 동작하는지 보여준다. 승인 워크플로우·급여 마감 등
// 트랜잭션성 테이블은 STEP 3.5 이후에 실제 로직과 함께 채워질 것이므로 비워 둔다.

import {
  PrismaClient,
  EmploymentType,
  EmployeeRole,
  EmployeeStatus,
  AssignmentRole,
  HolidayType,
  HolidayScopeType,
  LeaveCategory,
  LeaveDeductionUnit,
  PunchType,
  VerificationLevel,
  RegistrationMethod,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// 시드 전용 개발용 비밀번호. 절대 운영에 쓰지 않는다 — 전원 mustChangePassword=true라
// 최초 로그인 시 변경이 강제된다.
const DEV_SEED_PASSWORD = 'Seed!Passw0rd2026';

const prisma = new PrismaClient();

// Asia/Seoul(KST, UTC+9) 기준 로컬 시각을 timestamptz로 만든다.
function kst(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}

// TIME 컬럼용 시각(날짜부는 의미 없음, 1970-01-01 UTC 고정).
function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
const GIVEN_NAMES = [
  '민준', '서연', '도윤', '하윤', '시우', '지우', '주원', '서윤', '예준', '수아',
  '지호', '다은', '건우', '서준', '은우', '채원', '현우', '소율', '우진', '다인',
];
function nameFor(i: number): string {
  return SURNAMES[i % SURNAMES.length] + GIVEN_NAMES[i % GIVEN_NAMES.length];
}

async function main() {
  console.log('시드 시작');

  // ---------------------------------------------------------------------
  // 1. 조직: 권역 4개, 사업장 5개 (그중 1개는 5인 미만)
  // ---------------------------------------------------------------------
  const regionCapital = await prisma.region.create({ data: { code: 'RG-CAPITAL', name: '수도권' } });
  const regionChungcheong = await prisma.region.create({ data: { code: 'RG-CHUNGCHEONG', name: '충청권' } });
  const regionYeongnam = await prisma.region.create({ data: { code: 'RG-YEONGNAM', name: '영남권' } });
  const regionHonam = await prisma.region.create({ data: { code: 'RG-HONAM', name: '호남권' } });

  const site1 = await prisma.site.create({
    data: { code: 'SITE-001', name: '서울중앙 사업장', regionId: regionCapital.id, address: '서울특별시 중구', geofenceRadiusM: 100 },
  });
  const site2 = await prisma.site.create({
    data: { code: 'SITE-002', name: '인천공장 사업장', regionId: regionCapital.id, address: '인천광역시 남동구', geofenceRadiusM: 150 },
  });
  const site3 = await prisma.site.create({
    data: { code: 'SITE-003', name: '대전학교 사업장', regionId: regionChungcheong.id, address: '대전광역시 유성구', geofenceRadiusM: 80 },
  });
  const site4 = await prisma.site.create({
    data: { code: 'SITE-004', name: '부산병원 사업장', regionId: regionYeongnam.id, address: '부산광역시 해운대구', geofenceRadiusM: 100 },
  });
  const site5 = await prisma.site.create({
    data: { code: 'SITE-005', name: '광주복지관 사업장', regionId: regionHonam.id, address: '광주광역시 서구', geofenceRadiusM: 100 },
  });

  // site3(대전학교)는 5인 미만 사업장으로 만든다.
  const sites = [
    { site: site1, headcount: 13, isUnderFive: false },
    { site: site2, headcount: 12, isUnderFive: false },
    { site: site3, headcount: 4, isUnderFive: true },
    { site: site4, headcount: 11, isUnderFive: false },
    { site: site5, headcount: 10, isUnderFive: false },
  ];

  for (const { site, headcount, isUnderFive } of sites) {
    await prisma.site.update({
      where: { id: site.id },
      data: { headcountCache: headcount, isUnderFiveCache: isUnderFive },
    });
    await prisma.siteHeadcountHistory.create({
      data: {
        siteId: site.id,
        effectiveStartDate: new Date('2026-01-01'),
        effectiveEndDate: null,
        calcPeriodStart: new Date('2025-08-01'),
        calcPeriodEnd: new Date('2026-01-31'),
        totalPersonDays: headcount * 180,
        workingDays: 180,
        averageHeadcount: headcount,
        isUnderFive,
        // 5인 미만 사업장은 "계속하여 5인 이상"인 적이 없으므로 연차 미적용으로 둔다.
        leaveApplicable: !isUnderFive,
        basis: `2025-08-01~2026-01-31 연인원/가동일수 기준 산정 (시드 데이터, 시행령 제7조의2③)`,
      },
    });
  }

  // ---------------------------------------------------------------------
  // 2. 2026년 공휴일 캘린더
  // ---------------------------------------------------------------------
  const holidays2026: { date: string; type: HolidayType; name: string; paid: boolean }[] = [
    { date: '2026-01-01', type: 'LEGAL', name: '신정', paid: true },
    { date: '2026-02-16', type: 'LEGAL', name: '설날 연휴', paid: true },
    { date: '2026-02-17', type: 'LEGAL', name: '설날', paid: true },
    { date: '2026-02-18', type: 'LEGAL', name: '설날 연휴', paid: true },
    { date: '2026-03-01', type: 'LEGAL', name: '삼일절', paid: true },
    { date: '2026-03-02', type: 'SUBSTITUTE', name: '삼일절 대체공휴일', paid: true },
    { date: '2026-05-05', type: 'LEGAL', name: '어린이날', paid: true },
    { date: '2026-05-24', type: 'LEGAL', name: '부처님오신날', paid: true },
    { date: '2026-06-06', type: 'LEGAL', name: '현충일', paid: true },
    { date: '2026-08-15', type: 'LEGAL', name: '광복절', paid: true },
    { date: '2026-08-17', type: 'SUBSTITUTE', name: '광복절 대체공휴일', paid: true },
    { date: '2026-09-24', type: 'LEGAL', name: '추석 연휴', paid: true },
    { date: '2026-09-25', type: 'LEGAL', name: '추석', paid: true },
    { date: '2026-09-26', type: 'LEGAL', name: '추석 연휴', paid: true },
    { date: '2026-10-03', type: 'LEGAL', name: '개천절', paid: true },
    { date: '2026-10-09', type: 'LEGAL', name: '한글날', paid: true },
    { date: '2026-12-25', type: 'LEGAL', name: '성탄절', paid: true },
  ];

  for (const h of holidays2026) {
    await prisma.holidayCalendar.create({
      data: {
        year: 2026,
        holidayDate: new Date(h.date),
        holidayType: h.type,
        name: h.name,
        isPaid: h.paid,
        scopeType: 'ALL',
      },
    });
  }

  // 사업장지정 휴일 예시: SITE-001만 적용되는 창립기념일 (scope_type=SITE_LIST 예시)
  const foundersDay = await prisma.holidayCalendar.create({
    data: {
      year: 2026,
      holidayDate: new Date('2026-04-10'),
      holidayType: 'SITE_DESIGNATED',
      name: '서울중앙 사업장 창립기념일',
      isPaid: true,
      scopeType: 'SITE_LIST',
    },
  });
  await prisma.holidayCalendarSite.create({
    data: { holidayCalendarId: foundersDay.id, siteId: site1.id },
  });

  // ---------------------------------------------------------------------
  // 3. 교대 패턴 3종 (사업장별로 동일 이름의 템플릿을 생성)
  // ---------------------------------------------------------------------
  type ShiftDef = { name: string; start: string; end: string; breakStart: string; breakEnd: string };
  const shiftDefs: ShiftDef[] = [
    { name: '조식조', start: '05:00', end: '14:00', breakStart: '09:00', breakEnd: '10:00' },
    { name: '중식조', start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { name: '석식조', start: '13:00', end: '22:00', breakStart: '17:00', breakEnd: '18:00' },
  ];

  const shiftTemplatesBySite: Record<string, { id: string; name: string }[]> = {};
  for (const { site } of sites) {
    shiftTemplatesBySite[site.id] = [];
    for (const def of shiftDefs) {
      const tmpl = await prisma.shiftTemplate.create({
        data: {
          siteId: site.id,
          name: def.name,
          startTime: timeOfDay(def.start),
          endTime: timeOfDay(def.end),
          breakStartTime: timeOfDay(def.breakStart),
          breakEndTime: timeOfDay(def.breakEnd),
          crossesMidnight: false,
          applicableWeekdays: [1, 2, 3, 4, 5],
        },
      });
      shiftTemplatesBySite[site.id].push({ id: tmpl.id, name: tmpl.name });
    }
  }

  // ---------------------------------------------------------------------
  // 4. 직원 50명 — 일용/단시간/초단시간/파견 포함, 사업장별 분배
  // ---------------------------------------------------------------------
  const siteForIndex: { site: typeof site1; headcount: number }[] = [];
  for (const { site, headcount } of sites) {
    for (let n = 0; n < headcount; n++) siteForIndex.push({ site, headcount });
  }
  // siteForIndex.length === 50

  // site3(5인 미만, 4명)는 일용 1 + 단시간 1 + 정규 1 + 계약 1로 고정 배정한다 —
  // "5인 미만 + 일용/단시간" 조회 케이스를 한 사업장에서 바로 검증할 수 있게 하기 위함.
  const site3Types: EmploymentType[] = ['DAILY', 'PART_TIME', 'REGULAR', 'CONTRACT'];

  // 나머지 46명(REGULAR24, CONTRACT7, PART_TIME7, ULTRA_PART_TIME4, DAILY2, DISPATCHED2)을
  // 라운드로빈으로 분배한다.
  const remainingPool: EmploymentType[] = [
    ...Array(24).fill('REGULAR'),
    ...Array(7).fill('CONTRACT'),
    ...Array(7).fill('PART_TIME'),
    ...Array(4).fill('ULTRA_PART_TIME'),
    ...Array(2).fill('DAILY'),
    ...Array(2).fill('DISPATCHED'),
  ] as EmploymentType[];

  const contractedMinutesFor: Record<EmploymentType, number | null> = {
    REGULAR: 2400,
    CONTRACT: 2400,
    PART_TIME: 1500,
    ULTRA_PART_TIME: 600, // 주 10시간 — 4주 평균 15시간 미만 초단시간
    DAILY: null,
    DISPATCHED: 2400,
  };

  const createdEmployees: { id: string; employeeNo: string; siteId: string; employmentType: EmploymentType }[] = [];

  const devPasswordHash = await bcrypt.hash(DEV_SEED_PASSWORD, 10);

  let site3Cursor = 0;
  let remainingCursor = 0;
  for (let i = 0; i < 50; i++) {
    const { site } = siteForIndex[i];
    const isSite3 = site.id === site3.id;
    const employmentType: EmploymentType = isSite3
      ? site3Types[site3Cursor++]
      : remainingPool[remainingCursor++];

    const employeeNo = `E${String(i + 1).padStart(4, '0')}`;
    const hireYear = 2019 + (i % 7); // 2019~2025년 사이 분산
    const hireDate = new Date(`${hireYear}-${String(((i % 12) + 1)).padStart(2, '0')}-01`);

    // 처음 2명은 퇴사 처리 (status/resignationDate 필드 검증용)
    const isResigned = i === 48 || i === 49;

    const employee = await prisma.employee.create({
      data: {
        employeeNo,
        name: nameFor(i),
        employmentType,
        hireDate,
        resignationDate: isResigned ? new Date('2026-06-30') : null,
        status: isResigned ? 'RESIGNED' : 'ACTIVE',
        primarySiteId: site.id,
        contractedWorkMinutes: contractedMinutesFor[employmentType],
        role: 'EMPLOYEE',
      },
    });

    await prisma.employeeSiteAssignment.create({
      data: {
        employeeId: employee.id,
        siteId: site.id,
        assignmentRole: 'PRIMARY',
        startDate: hireDate,
      },
    });

    // STEP 2: 수동 테스트/데모용 로그인 자격 증명. 전원 동일한 개발용 비밀번호를
    // 쓰고 mustChangePassword=true로 두어 최초 로그인 시 변경 흐름도 바로 볼 수 있게 한다.
    await prisma.employeeCredential.create({
      data: {
        employeeId: employee.id,
        passwordHash: devPasswordHash,
        mustChangePassword: true,
      },
    });

    createdEmployees.push({ id: employee.id, employeeNo, siteId: site.id, employmentType });
  }

  // 사업장별 첫 직원을 SITE_MANAGER로 승격
  for (const { site } of sites) {
    const first = createdEmployees.find((e) => e.siteId === site.id);
    if (first) {
      await prisma.employee.update({ where: { id: first.id }, data: { role: 'SITE_MANAGER' } });
    }
  }
  // 전사 관리자 2명(ADMIN, HQ_HR)과 권역 관리자 1명(REGIONAL) — SITE-001 소속 인원 중 SITE_MANAGER가
  // 아닌 직원을 승격시킨다.
  const site1Employees = createdEmployees.filter((e) => e.siteId === site1.id);
  const [, adminCandidate, hqHrCandidate, regionalCandidate] = site1Employees; // 0번은 이미 SITE_MANAGER
  if (adminCandidate) await prisma.employee.update({ where: { id: adminCandidate.id }, data: { role: 'ADMIN' } });
  if (hqHrCandidate) await prisma.employee.update({ where: { id: hqHrCandidate.id }, data: { role: 'HQ_HR' } });
  if (regionalCandidate) await prisma.employee.update({ where: { id: regionalCandidate.id }, data: { role: 'REGIONAL' } });

  // 겸직 예시: site1 직원 한 명을 site2에도 부(SECONDARY) 배정
  const dualAssignee = createdEmployees.find((e) => e.siteId === site1.id && e.employmentType === 'REGULAR');
  if (dualAssignee) {
    await prisma.employeeSiteAssignment.create({
      data: {
        employeeId: dualAssignee.id,
        siteId: site2.id,
        assignmentRole: 'SECONDARY',
        startDate: new Date('2026-03-01'),
      },
    });
  }

  // ---------------------------------------------------------------------
  // 5. policy_config 기본값 (전사, site_id = NULL)
  // ---------------------------------------------------------------------
  const policyDefaults: { key: string; value: unknown }[] = [
    { key: 'weekly_work_limit_minutes', value: 2400 }, // 소정 40시간
    { key: 'weekly_overtime_limit_minutes', value: 720 }, // 연장 한도 12시간
    { key: 'night_work_start', value: '22:00' },
    { key: 'night_work_end', value: '06:00' },
    { key: 'punch_dedup_window_seconds', value: 60 },
    { key: 'geofence_default_radius_m', value: 100 },
    { key: 'geofence_accuracy_threshold_m', value: 50 },
    { key: 'qr_totp_period_seconds', value: 60 },
    { key: 'qr_verification_policy', value: 'NFC_ONLY' },
    { key: 'offline_queue_delay_threshold_hours', value: 12 },
    { key: 'annual_leave_max_days', value: 25 },
    { key: 'ultra_part_time_weekly_hours_threshold', value: 15 },
    // STEP4: 부정사용 탐지 임계값 — 전부 policy_config에서 읽는다(코드 상수화 금지).
    { key: 'impossible_travel_speed_kmh', value: 150 },
    { key: 'repeated_coordinate_lookback_days', value: 7 },
    { key: 'repeated_coordinate_max_count', value: 3 },
    { key: 'shared_device_lookback_hours', value: 24 },
    { key: 'device_clock_rollback_tolerance_seconds', value: 5 },
    { key: 'online_punch_delay_threshold_minutes', value: 5 },
    { key: 'location_retention_days', value: 30 },
    // STEP4.5: 알림 조용시간(방해금지 시간대) — night_work_start/end(근기법 야간근로
    // 판정용, STEP3.5가 nightStartMinuteOfDay로 이미 전용 소비 중)와는 별개 키다.
    { key: 'notification_quiet_hours_start_minute_of_day', value: 1320 }, // 22:00
    { key: 'notification_quiet_hours_end_minute_of_day', value: 360 }, // 06:00
  ];
  for (const p of policyDefaults) {
    await prisma.policyConfig.create({
      data: {
        key: p.key,
        value: p.value as never,
        siteId: null,
        effectiveStartDate: new Date('2026-01-01'),
      },
    });
  }
  // 사업장 오버라이드 예시: site3(5인 미만, 반경이 좁은 학교 부지)는 지오펜스 반경을 다르게 둔다.
  await prisma.policyConfig.create({
    data: {
      key: 'geofence_default_radius_m',
      value: 80 as never,
      siteId: site3.id,
      effectiveStartDate: new Date('2026-01-01'),
    },
  });

  // ---------------------------------------------------------------------
  // 6. 휴가 유형 기준정보
  // ---------------------------------------------------------------------
  const leaveTypes: {
    code: string;
    name: string;
    category: LeaveCategory;
    paid: boolean;
    unit: LeaveDeductionUnit;
    evidence: boolean;
  }[] = [
    { code: 'ANNUAL', name: '연차', category: 'ANNUAL', paid: true, unit: 'FULL_DAY', evidence: false },
    { code: 'HALF_DAY', name: '반차', category: 'HALF_DAY', paid: true, unit: 'HALF_DAY', evidence: false },
    { code: 'QUARTER_DAY', name: '반반차', category: 'QUARTER_DAY', paid: true, unit: 'HOUR', evidence: false },
    { code: 'CONGRATULATION', name: '경조휴가', category: 'CONGRATULATION', paid: true, unit: 'FULL_DAY', evidence: true },
    { code: 'PUBLIC', name: '공가', category: 'PUBLIC', paid: true, unit: 'FULL_DAY', evidence: true },
    { code: 'SICK', name: '병가', category: 'SICK', paid: false, unit: 'FULL_DAY', evidence: true },
    { code: 'UNPAID', name: '무급휴직', category: 'UNPAID', paid: false, unit: 'FULL_DAY', evidence: false },
    { code: 'SUBSTITUTE', name: '대체휴무', category: 'SUBSTITUTE', paid: true, unit: 'FULL_DAY', evidence: false },
    { code: 'COMPENSATORY', name: '보상휴가', category: 'COMPENSATORY', paid: true, unit: 'HOUR', evidence: false },
  ];
  for (const lt of leaveTypes) {
    await prisma.leaveType.create({
      data: {
        code: lt.code,
        name: lt.name,
        category: lt.category,
        paid: lt.paid,
        deductionUnit: lt.unit,
        evidenceRequired: lt.evidence,
      },
    });
  }

  // ---------------------------------------------------------------------
  // 7. 스케줄 한 주치 (2026-08-24 월 ~ 2026-08-28 금) — 직원별로 교대 순환 배정
  // ---------------------------------------------------------------------
  const weekDates = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
  const activeEmployees = createdEmployees.filter((_, i) => i < 48); // 퇴사자 2명 제외

  for (const emp of activeEmployees) {
    const templates = shiftTemplatesBySite[emp.siteId];
    for (let d = 0; d < weekDates.length; d++) {
      const shift = templates[(d + templates.length) % templates.length];
      const def = shiftDefs.find((s) => s.name === shift.name)!;
      await prisma.schedule.create({
        data: {
          employeeId: emp.id,
          siteId: emp.siteId,
          workDate: new Date(weekDates[d]),
          shiftTemplateId: shift.id,
          plannedStartAt: kst(weekDates[d], def.start),
          plannedEndAt: kst(weekDates[d], def.end),
          plannedBreakMinutes: 60,
          status: 'CONFIRMED',
        },
      });
    }
  }

  // ---------------------------------------------------------------------
  // 8. 예시 타각 — 첫 근무일(2026-08-24) 몇 명분만 시연용으로 기록
  // ---------------------------------------------------------------------
  const punchDemoEmployees = activeEmployees.slice(0, 5);
  for (const emp of punchDemoEmployees) {
    const templates = shiftTemplatesBySite[emp.siteId];
    const def = shiftDefs.find((s) => s.name === templates[0].name)!;
    const recordedAt = kst('2026-08-24', def.start);
    const idempotencyKey = `seed-${emp.employeeNo}-IN-${recordedAt.toISOString()}`;

    const punch = await prisma.punchRaw.create({
      data: {
        employeeId: emp.id,
        siteId: emp.siteId,
        punchType: 'IN' as PunchType,
        recordedAt,
        workDate: new Date('2026-08-24'),
        idempotencyKey,
        verificationLevel: 'NORMAL' as VerificationLevel,
        registrationMethod: 'NFC' as RegistrationMethod,
        deviceId: `seed-device-${emp.employeeNo}`,
        integrityFlags: [],
        clientEventId: `seed-client-${emp.employeeNo}-1`,
      },
    });

    await prisma.punchLocation.create({
      data: {
        punchId: punch.id,
        lat: 37.5665,
        lng: 126.978,
        accuracyM: 12.5,
        purgeScheduledAt: new Date('2027-08-24'),
      },
    });
  }

  console.log('시드 완료');
  console.log(`  사업장: ${sites.length}개 (5인 미만 1개: ${site3.code})`);
  console.log(`  직원: ${createdEmployees.length}명 (전원 로그인 자격 증명 생성됨)`);
  console.log(`  교대 패턴: ${shiftDefs.length}종 × ${sites.length}개 사업장`);
  console.log(`  공휴일: ${holidays2026.length + 1}건 (2026년, 사업장지정 1건 포함)`);
  console.log(`  개발용 로그인 비밀번호(전원 공통, 최초 로그인 시 변경 강제): ${DEV_SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
