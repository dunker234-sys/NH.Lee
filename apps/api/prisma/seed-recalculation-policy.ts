// STEP 3.5: PolicyConfigResolverService가 요구하는 정책값을 policy_config에 채운다.
// STEP1 seed.ts는 이미 (다른 목적의) 몇몇 정책 키를 다른 단위/이름으로 심어 뒀으므로
// 섞어 쓰지 않고, core-rules PolicyConfig 필드명과 1:1로 일치하는 새 키만 추가한다.
// idempotent: 이미 있는 (key, siteId=NULL, effectiveStartDate) 조합은 건너뛴다.

import { PrismaClient } from '@prisma/client';
import { RECALCULATION_POLICY_DEFAULTS, RECALCULATION_POLICY_EFFECTIVE_FROM } from './recalculation-policy-defaults';

const prisma = new PrismaClient();

async function main() {
  for (const v of RECALCULATION_POLICY_DEFAULTS) {
    const existing = await prisma.policyConfig.findFirst({
      where: { key: v.key, siteId: null, effectiveStartDate: RECALCULATION_POLICY_EFFECTIVE_FROM },
    });
    if (existing) continue;
    await prisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: RECALCULATION_POLICY_EFFECTIVE_FROM,
      },
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
