// STEP11: PayrollPolicyResolverService/PayrollValidationPolicyResolverService가
// 요구하는 신규 정책값을 policy_config에 채운다.
// idempotent: 이미 있는 (key, siteId=NULL, effectiveStartDate) 조합은 건너뛴다.

import { PrismaClient } from '@prisma/client';
import { PAYROLL_POLICY_DEFAULTS, PAYROLL_POLICY_EFFECTIVE_FROM } from './payroll-policy-defaults';

const prisma = new PrismaClient();

async function main() {
  for (const v of PAYROLL_POLICY_DEFAULTS) {
    const existing = await prisma.policyConfig.findFirst({
      where: { key: v.key, siteId: null, effectiveStartDate: PAYROLL_POLICY_EFFECTIVE_FROM },
    });
    if (existing) continue;
    await prisma.policyConfig.create({
      data: {
        key: v.key,
        value: v.value as never,
        siteId: null,
        effectiveStartDate: PAYROLL_POLICY_EFFECTIVE_FROM,
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
