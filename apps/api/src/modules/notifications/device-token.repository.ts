import { Injectable } from '@nestjs/common';
import { DeviceToken, DeviceTokenPlatform } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RegisterDeviceTokenInput {
  employeeId: string;
  deviceId: string;
  platform: DeviceTokenPlatform;
  token: string;
}

/**
 * device_token에 대한 유일한 접근 지점. 등록은 항상 upsert다 — 앱 재설치는
 * 같은 (직원, 기기, 플랫폼)에서 새 토큰을 발급하므로 새 행이 아니라
 * 기존 행의 token/lastRefreshedAt/isValid 갱신이어야 한다.
 */
@Injectable()
export class DeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterDeviceTokenInput): Promise<DeviceToken> {
    return this.prisma.deviceToken.upsert({
      where: {
        employeeId_deviceId_platform: {
          employeeId: input.employeeId,
          deviceId: input.deviceId,
          platform: input.platform,
        },
      },
      create: {
        employeeId: input.employeeId,
        deviceId: input.deviceId,
        platform: input.platform,
        token: input.token,
        isValid: true,
      },
      update: {
        token: input.token,
        isValid: true,
        lastRefreshedAt: new Date(),
      },
    });
  }

  async findValidByEmployee(employeeId: string): Promise<DeviceToken[]> {
    return this.prisma.deviceToken.findMany({ where: { employeeId, isValid: true } });
  }
}
