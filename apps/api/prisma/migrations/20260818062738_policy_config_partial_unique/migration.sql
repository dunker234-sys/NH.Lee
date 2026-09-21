-- policy_config는 site_id가 NULL(전사 기본값)인 행과 NOT NULL(사업장 오버라이드)인
-- 행이 섞여 있다. 표준 UNIQUE 제약은 NULL을 서로 다른 값으로 취급해 "전사 기본값
-- 중복 저장"을 막지 못하므로, 두 개의 부분 유니크 인덱스로 나눠 정확히 표현한다.
-- Prisma schema DSL은 부분(WHERE) 유니크 인덱스를 표현하지 못해 손으로 추가한다.

CREATE UNIQUE INDEX "policy_config_global_key_uk"
  ON "policy_config" ("key", "effective_start_date")
  WHERE "site_id" IS NULL;

CREATE UNIQUE INDEX "policy_config_site_key_uk"
  ON "policy_config" ("key", "site_id", "effective_start_date")
  WHERE "site_id" IS NOT NULL;
