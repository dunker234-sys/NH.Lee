/**
 * expo-sqlite/React Native 컴포넌트 테스트용 jest-expo 설정이 아니다 — 이
 * 설정은 오프라인 큐의 순수 로직(src/offline/punchQueueLogic.ts)만
 * Node 환경에서 실제 SQLite(node:sqlite)로 검증한다(계획서 §10.2,
 * "시뮬레이터 없이 검증"). 화면/네이티브 모듈 테스트는 이 설정 범위 밖이다.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/offline/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
