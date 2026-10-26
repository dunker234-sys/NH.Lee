import { adminPrisma } from './db';

// adminPrisma(setup/db.ts)는 스펙 파일마다 모듈 레지스트리가 새로 생겨 인스턴스도 새로 만들어진다.
// 파일이 끝날 때 끊지 않으면 --runInBand로 여러 파일을 한 프로세스에서 돌릴 때 연결이 파일 수만큼
// 누적된다. Prisma는 끊긴 뒤 다시 쿼리하면 자동 재연결하므로, 스펙 자신의 afterAll이 이후에
// adminPrisma를 써도 안전하다.
afterAll(async () => {
  await adminPrisma.$disconnect().catch(() => undefined);
});
