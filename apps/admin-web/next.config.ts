import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STEP12: Docker 런타임 이미지를 위한 standalone 출력(node_modules 전체
  // 대신 실제로 쓰는 의존성만 .next/standalone에 추적·복사됨).
  output: "standalone",
};

export default nextConfig;
