/**
 * apps/mobile의 jest.config.js와 같은 이유 — 오프라인 큐 순수 로직만 Node
 * 환경에서 검증한다(브라우저 없이). pinCipher.ts는 Web Crypto/btoa/atob를
 * 쓰지만 Node 19+에 전부 내장돼 있어 별도 폴리필 없이 그대로 동작한다.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/offline/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
