import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QrSecretProvisioningService } from '../src/modules/punches/qr-secret-provisioning.service';
import { generateTotp } from '../src/common/crypto/totp.util';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture, loadPolicyConfigFixture, loadPunchPolicyConfigFixture, loadSiteNfcTagFixture } from './fixtures';
import { adminPrisma } from './setup/db';

/**
 * STEP4 완료조건 1~4 + 지오펜스/기기/NFC/QR/부정사용 시나리오를 실제 HTTP
 * 엔드포인트로 검증한다. 어떤 검증 실패도 저장 자체를 막지 않는다는 게 이
 * 파일의 핵심 명제다 — 모든 "실패" 시나리오는 200/201 저장 + LOW로 끝난다.
 */
describe('POST /punches — 타각 등록', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: Fixture;
  let qrSecretProvisioning: QrSecretProvisioningService;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    await loadPolicyConfigFixture();
    await loadPunchPolicyConfigFixture();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    qrSecretProvisioning = app.get(QrSecretProvisioningService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // ---------------------------------------------------------------------
  // 완료조건 1/2: 멱등성
  // ---------------------------------------------------------------------
  describe('멱등성', () => {
    it('동일 타각을 5회 동시 전송해도 punch_raw에 1건만 남는다', async () => {
      const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-dedup');
      const body = {
        punchType: 'IN',
        recordedAt: '2026-04-01T09:00:00+09:00',
        siteId: fixture.siteA.id,
        registrationMethod: 'GPS',
        deviceId: 'dev-dedup',
        clientEventId: 'client-evt-original',
      };

      const responses = await Promise.all(
        Array.from({ length: 5 }).map(() =>
          request(app.getHttpServer()).post('/punches').set(authHeader(accessToken)).send(body),
        ),
      );
      responses.forEach((res) => expect([200, 201]).toContain(res.status));

      const rows = await prisma.punchRaw.findMany({
        where: { employeeId: fixture.employees.plainEmployeeA.id, deviceId: 'dev-dedup', punchType: 'IN' },
      });
      expect(rows).toHaveLength(1);

      const duplicateCount = responses.filter((r) => r.body.duplicate === true).length;
      expect(duplicateCount).toBe(4); // 5개 중 1개만 실제 저장, 나머지 4개는 중복 판정
    });

    it('앱 재설치를 가정해 client_event_id를 바꿔 재전송해도 중복 저장되지 않는다', async () => {
      const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-dedup');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-01T09:00:00+09:00', // 위 테스트와 동일한 분단위 시각
          siteId: fixture.siteA.id,
          registrationMethod: 'GPS',
          deviceId: 'dev-dedup',
          clientEventId: 'client-evt-reinstalled-different-uuid',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.duplicate).toBe(true);

      const rows = await prisma.punchRaw.findMany({
        where: { employeeId: fixture.employees.plainEmployeeA.id, deviceId: 'dev-dedup', punchType: 'IN' },
      });
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // 완료조건 3: 지오펜스/기기/QR 검증 실패에도 저장된다
  // ---------------------------------------------------------------------
  describe('지오펜스', () => {
    it('반경 밖 + 승인된 외근 없음 → 여전히 저장되고 LOW + 사유가 기록된다', async () => {
      const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-geo-1');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-01T09:05:00+09:00',
          siteId: fixture.siteA.id,
          location: { lat: fixture.siteA.lat + 0.005, lng: fixture.siteA.lng, accuracyM: 10 }, // 약 500m 밖
          registrationMethod: 'GPS',
          deviceId: 'dev-geo-1',
          clientEventId: 'client-geo-1',
          outOfGeofenceReason: '고객사 현장 방문 중 급히 타각',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.duplicate).toBe(false);
      expect(res.body.verificationLevel).toBe('LOW');
      expect(res.body.integrityFlags).toContain('OUT_OF_GEOFENCE_NO_DISPATCH');

      const row = await prisma.punchRaw.findUniqueOrThrow({ where: { id: res.body.punchId } });
      expect(row.reviewNote).toBe('고객사 현장 방문 중 급히 타각');
    });

    it('반경 밖 + 승인된 외근/출장 있음 → 정상(NORMAL) 처리된다', async () => {
      await adminPrisma.dispatchRequest.create({
        data: {
          employeeId: fixture.employees.plainEmployeeA.id,
          originSiteId: fixture.siteA.id,
          dispatchType: 'BUSINESS_TRIP',
          startDate: new Date('2026-04-02T00:00:00.000Z'),
          endDate: new Date('2026-04-02T00:00:00.000Z'),
          reason: '거래처 출장',
          status: 'APPROVED',
        },
      });

      // dev-dedup: plainEmployeeA가 이 파일 맨 처음 사용한, 이미 신뢰된 기기.
      // 새 deviceId를 쓰면 DeviceBindingService가 "두 번째 기기"로 보고
      // DEVICE_NOT_TRUSTED를 붙여 이 테스트의 NORMAL 기대와 무관한 LOW를 만든다.
      const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-dedup');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-02T09:00:00+09:00',
          siteId: fixture.siteA.id,
          location: { lat: fixture.siteA.lat + 0.005, lng: fixture.siteA.lng, accuracyM: 10 },
          registrationMethod: 'GPS',
          deviceId: 'dev-dedup',
          clientEventId: 'client-geo-2',
        });

      expect(res.body.verificationLevel).toBe('NORMAL');
      expect(res.body.integrityFlags).not.toContain('OUT_OF_GEOFENCE_NO_DISPATCH');
    });

    it('정확도가 임계값보다 나쁘면 반경 안이어도 LOW_ACCURACY 플래그가 붙지만 저장은 허용된다', async () => {
      const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-geo-3');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-03T09:00:00+09:00',
          siteId: fixture.siteA.id,
          location: { lat: fixture.siteA.lat, lng: fixture.siteA.lng, accuracyM: 999 }, // 정확도 임계(50m) 초과
          registrationMethod: 'GPS',
          deviceId: 'dev-geo-3',
          clientEventId: 'client-geo-3',
        });

      expect(res.body.integrityFlags).toContain('LOCATION_ACCURACY_LOW');
    });
  });

  describe('기기 신뢰', () => {
    it('미등록(미신뢰) 기기로 타각을 찍어도 저장되고 LOW로 기록된다', async () => {
      const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-trust-login');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-04T09:00:00+09:00',
          siteId: fixture.siteA.id,
          // STEP5-B: PC는 더 이상 DeviceBindingService를 거치지 않는다(IP
          // 허용목록이 그 자리를 대신 지킨다) — 이 테스트는 직원별 기기신뢰
          // 판정 자체를 검증하는 것이라 그 판정을 여전히 거치는 GPS로 찍는다.
          registrationMethod: 'GPS',
          deviceId: 'dev-trust-never-seen-before', // 로그인 기기와 다른, 처음 보는 기기
          clientEventId: 'client-trust-1',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.verificationLevel).toBe('LOW');
      expect(res.body.integrityFlags).toContain('DEVICE_NOT_TRUSTED');

      const row = await prisma.punchRaw.findUniqueOrThrow({ where: { id: res.body.punchId } });
      expect(row.id).toBeTruthy(); // 저장 자체는 성공했다
    });
  });

  describe('NFC', () => {
    it('등록된 태그 UID로 찍으면 정상 처리된다', async () => {
      await loadSiteNfcTagFixture(fixture.siteA.id, 'NFC-TAG-VALID');
      const { accessToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-nfc-ok');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-05T09:00:00+09:00',
          siteId: fixture.siteA.id,
          registrationMethod: 'NFC',
          qrOrNfcToken: 'NFC-TAG-VALID',
          deviceId: 'dev-nfc-ok',
          clientEventId: 'client-nfc-1',
        });

      expect(res.body.integrityFlags).not.toContain('NFC_TAG_MISMATCH');
    });

    it('등록되지 않은 태그 UID로 찍어도 저장되고 LOW로 기록된다', async () => {
      const { accessToken } = await login(app, fixture.employees.regional.employeeNo, fixture.password, 'dev-nfc-bad');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-05T09:05:00+09:00',
          siteId: fixture.siteA.id,
          registrationMethod: 'NFC',
          qrOrNfcToken: 'NFC-TAG-UNKNOWN',
          deviceId: 'dev-nfc-bad',
          clientEventId: 'client-nfc-2',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.verificationLevel).toBe('LOW');
      expect(res.body.integrityFlags).toContain('NFC_TAG_MISMATCH');
    });
  });

  describe('QR', () => {
    it('qr_verification_policy=NFC_ONLY(기본값)에서 QR로 찍으면 저장되지만 정책상 비활성 처리된다', async () => {
      const { accessToken } = await login(app, fixture.employees.siteManagerA.employeeNo, fixture.password, 'dev-qr-disabled');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-06T09:00:00+09:00',
          siteId: fixture.siteA.id,
          registrationMethod: 'QR',
          qrOrNfcToken: '000000',
          deviceId: 'dev-qr-disabled',
          clientEventId: 'client-qr-1',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.verificationLevel).toBe('LOW');
      expect(res.body.integrityFlags).toContain('QR_DISABLED_BY_POLICY');
    });

    it('QR_WITH_AUX_CHECK 정책에서 TOTP가 틀리면 저장되지만 검증 불명확으로 LOW 처리된다', async () => {
      await adminPrisma.policyConfig.create({
        data: {
          key: 'qr_verification_policy',
          value: 'QR_WITH_AUX_CHECK' as never,
          siteId: fixture.siteB.id,
          effectiveStartDate: new Date('2026-01-01'),
        },
      });
      await qrSecretProvisioning.provision(fixture.siteB.id);

      const { accessToken } = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-qr-wrong');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-07T09:00:00+09:00',
          siteId: fixture.siteB.id,
          registrationMethod: 'QR',
          qrOrNfcToken: '999999',
          deviceId: 'dev-qr-wrong',
          clientEventId: 'client-qr-2',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.verificationLevel).toBe('LOW');
      expect(res.body.integrityFlags).toContain('QR_VERIFICATION_INCONCLUSIVE');
    });

    it('QR_WITH_AUX_CHECK 정책에서 TOTP+기기신뢰+보조신호가 전부 일치하면 정상 처리된다', async () => {
      // provision()이 반환한 평문 시크릿은 앞선 테스트에서 이미 다른 값으로 덮였으므로
      // 이 테스트 전용으로 새로 프로비저닝해 그 반환값을 그대로 쓴다.
      const secret = await qrSecretProvisioning.provision(fixture.siteB.id);
      await adminPrisma.siteVerificationSignal.create({
        data: { siteId: fixture.siteB.id, signalType: 'WIFI_BSSID', value: 'AA:BB:CC:DD:EE:FF' },
      });

      // dev-qr-wrong: siteManagerB가 앞선 테스트에서 이미 신뢰를 획득한 기기를 재사용한다
      // (새 deviceId를 쓰면 DEVICE_NOT_TRUSTED가 붙어 이 테스트의 NORMAL 기대와 무관한 LOW가 생긴다).
      const { accessToken } = await login(app, fixture.employees.siteManagerB.employeeNo, fixture.password, 'dev-qr-wrong');
      // 서버(QrNfcVerificationService)는 verifyTotp를 실제 현재 시각 기준으로 호출한다
      // (recordedAt은 과거 시각이어도 QR 코드 자체는 "지금" 스캔한 것이므로) — 테스트도
      // 코드를 실제 현재 시각 기준으로 생성해야 스텝이 일치한다.
      const code = generateTotp(secret, 60, new Date());

      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-08T09:00:00+09:00',
          siteId: fixture.siteB.id,
          registrationMethod: 'QR',
          qrOrNfcToken: code,
          wifiBssid: 'AA:BB:CC:DD:EE:FF',
          deviceId: 'dev-qr-wrong',
          clientEventId: 'client-qr-3',
        });

      expect(res.body.integrityFlags).not.toContain('QR_VERIFICATION_INCONCLUSIVE');
      expect(res.body.verificationLevel).toBe('NORMAL');
    });
  });

  // ---------------------------------------------------------------------
  // 완료조건 4: iOS 경로에서 mock location 탐지가 NOT_SUPPORTED로 기록된다
  // ---------------------------------------------------------------------
  describe('부정사용 탐지(동기, 클라이언트 신호)', () => {
    it('iOS는 항상 MOCK_LOCATION_NOT_SUPPORTED로 기록된다(불리언 false가 아니다)', async () => {
      const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-ios');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-09T09:00:00+09:00',
          siteId: fixture.siteA.id,
          registrationMethod: 'GPS',
          deviceId: 'dev-ios',
          clientEventId: 'client-ios-1',
          platform: 'IOS',
        });

      expect(res.body.integrityFlags).toContain('MOCK_LOCATION_NOT_SUPPORTED');
      // 문자열 배열 안에 boolean이 섞여 들어가지 않는다는 것도 함께 확인한다.
      res.body.integrityFlags.forEach((flag: unknown) => expect(typeof flag).toBe('string'));
    });

    it('Android는 기기가 보낸 무결성 신호를 그대로 플래그로 옮긴다', async () => {
      const { accessToken } = await login(app, fixture.employees.hqHr.employeeNo, fixture.password, 'dev-android');
      const res = await request(app.getHttpServer())
        .post('/punches')
        .set(authHeader(accessToken))
        .send({
          punchType: 'IN',
          recordedAt: '2026-04-09T09:05:00+09:00',
          siteId: fixture.siteA.id,
          registrationMethod: 'GPS',
          deviceId: 'dev-android',
          clientEventId: 'client-android-1',
          platform: 'ANDROID',
          androidIntegrityFlags: { mockLocationSuspected: true, developerModeEnabled: false, rootedOrJailbroken: false },
        });

      expect(res.body.integrityFlags).toContain('MOCK_LOCATION_SUSPECTED');
      expect(res.body.integrityFlags).not.toContain('DEVELOPER_MODE_ENABLED');
      expect(res.body.integrityFlags).not.toContain('MOCK_LOCATION_NOT_SUPPORTED');
    });
  });
});
