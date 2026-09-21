// STEP4: seed.ts는 이미 한 번 실행된 dev/test DB에 재실행하면 유니크 제약
// (employeeNo 등) 위반으로 실패한다. 이 스크립트는 punch-policy-defaults.ts의
// 값을 idempotent하게 채운다(STEP3.5의 seed-recalculation-policy.ts와 동일한 패턴).
// 이미 seed.ts가 심어 둔 값과 겹치는 키는 findFirst로 건너뛴다.

import { PrismaClient } from '@prisma/client';
import { PUNCH_POLICY_DEFAULTS, PUNCH_POLICY_EFFECTIVE_FROM } from './punch-policy-defaults';

const prisma = new PrismaClient();

async function main() {
  for (const v of PUNCH_POLICY_DEFAULTS) {
    const existing = await prisma.policyConfig.findFirst({
      where: { key: v.key, siteId: null, effectiveStartDate: PUNCH_POLICY_EFFECTIVE_FROM },
    });
    if (existing) continue;
    await prisma.policyConfig.create({
      data: { key: v.key, value: v.value as never, siteId: null, effectiveStartDate: PUNCH_POLICY_EFFECTIVE_FROM },
    });
    console.log(`+ policy_config: ${v.key} = ${v.value}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
