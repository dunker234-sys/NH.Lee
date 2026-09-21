import { PrismaService } from '../prisma/prisma.service';
import { PunchRawRepository } from './punch-raw.repository';

describe('PunchRawRepository — 완료조건: ADMIN도 원본을 코드로 수정할 수 없다', () => {
  it('update/delete 메서드가 아예 존재하지 않는다', () => {
    const repo = new PunchRawRepository({} as PrismaService) as unknown as Record<string, unknown>;

    expect(repo.update).toBeUndefined();
    expect(repo.delete).toBeUndefined();
    expect(repo.deleteMany).toBeUndefined();
    expect(repo.updateMany).toBeUndefined();
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.findMany).toBe('function');
  });
});
