import { Injectable } from '@nestjs/common';
import { DeviceToken } from '@prisma/client';
import { DeviceTokenRepository, RegisterDeviceTokenInput } from './device-token.repository';

@Injectable()
export class DeviceTokenService {
  constructor(private readonly repo: DeviceTokenRepository) {}

  async register(input: RegisterDeviceTokenInput): Promise<DeviceToken> {
    return this.repo.register(input);
  }
}
