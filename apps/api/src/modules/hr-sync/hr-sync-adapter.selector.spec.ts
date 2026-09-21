import { selectHrSourceAdapter } from './hr-sync-adapter.selector';
import { HrSourceAdapter } from './hr-sync.types';

describe('selectHrSourceAdapter — 요구사항서 5장② 설정 한 줄 전환', () => {
  const file = { fetchAll: async () => [] } as HrSourceAdapter;
  const db = { fetchAll: async () => [] } as HrSourceAdapter;
  const api = { fetchAll: async () => [] } as HrSourceAdapter;

  it('FILE이면 FileAdapter를 고른다(기본값 포함)', () => {
    expect(selectHrSourceAdapter('FILE', { file, db, api })).toBe(file);
    expect(selectHrSourceAdapter(undefined, { file, db, api })).toBe(file);
  });

  it('DB면 DbAdapter를 고른다', () => {
    expect(selectHrSourceAdapter('DB', { file, db, api })).toBe(db);
  });

  it('API면 ApiAdapter를 고른다', () => {
    expect(selectHrSourceAdapter('API', { file, db, api })).toBe(api);
  });
});
