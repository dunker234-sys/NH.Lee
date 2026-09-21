// STEP7: LeavePolicyResolverService/LeaveAccrualBasisResolverService가 요구하는
// 정책값을 policy_config에 채운다. idempotent: 이미 있는
// (key, siteId=NULL, effectiveStartDate) 조합은 건너뛴다.

import { PrismaClient } from '@prisma/client';
import { LEAVE_ACCRUAL_BASIS_DEFAULT, LEAVE_POLICY_DEFAULTS, LEAVE_POLICY_EFFECTIVE_FROM } from './leave-policy-defaults';

const prisma = new PrismaClient();

async function seedOne(key: string, value: number | string) {
  const existing = await prisma.policyConfig.findFirst({
    where: { key, siteId: null, effectiveStartDate: LEAVE_POLICY_EFFECTIVE_FROM },
  });
  if (existing) return;
  await prisma.policyConfig.create({
    data: {
      key,
      value: value as never,
      siteId: null,
      effectiveStartDate: LEAVE_POLICY_EFFECTIVE_FROM,
    },
  });
  console.log(`+ policy_config: ${key} = ${value}`);
}

async function main() {
  for (const v of LEAVE_POLICY_DEFAULTS) {
    await seedOne(v.key, v.value);
  }
  await seedOne(LEAVE_ACCRUAL_BASIS_DEFAULT.key, LEAVE_ACCRUAL_BASIS_DEFAULT.value);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
