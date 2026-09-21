// STEP5-B: seed.ts는 이미 한 번 실행된 dev/test DB에 재실행하면 유니크 제약
// 위반으로 실패한다. 이 스크립트는 kiosk-policy-defaults.ts의 값을
// idempotent하게 채운다(STEP3.5/4/4.5/5-A의 seed-*-policy.ts와 동일한 패턴).

import { PrismaClient } from '@prisma/client';
import { KIOSK_POLICY_DEFAULTS, KIOSK_POLICY_EFFECTIVE_FROM } from './kiosk-policy-defaults';

const prisma = new PrismaClient();

async function main() {
  for (const v of KIOSK_POLICY_DEFAULTS) {
    const existing = await prisma.policyConfig.findFirst({
      where: { key: v.key, siteId: null, effectiveStartDate: KIOSK_POLICY_EFFECTIVE_FROM },
    });
    if (existing) continue;
    await prisma.policyConfig.create({
      data: { key: v.key, value: v.value as never, siteId: null, effectiveStartDate: KIOSK_POLICY_EFFECTIVE_FROM },
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
