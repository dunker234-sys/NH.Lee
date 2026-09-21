import { UnauthorizedException } from '@nestjs/common';

export class PinNotSetError extends UnauthorizedException {
  constructor() {
    super({ code: 'PIN_NOT_SET', message: 'PIN이 설정되지 않았습니다. 사업장 관리자에게 문의하세요.' });
  }
}

export class InvalidPinError extends UnauthorizedException {
  constructor() {
    super({ code: 'INVALID_PIN', message: '사번 또는 PIN이 올바르지 않습니다.' });
  }
}

export class PinLockedError extends UnauthorizedException {
  constructor(lockedUntil: Date) {
    super({
      code: 'PIN_LOCKED',
      message: `PIN 입력 실패 횟수를 초과해 잠겼습니다. ${lockedUntil.toISOString()} 이후 다시 시도하세요.`,
    });
  }
}
