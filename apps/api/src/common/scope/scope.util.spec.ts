import { assertScope, assertSiteInScope, OrgScopeDeniedError, OrgScopeRequiredError } from './scope.util';

describe('assertScope', () => {
  it('scope가 undefined/null이면 런타임 에러를 던진다', () => {
    expect(() => assertScope(undefined)).toThrow(OrgScopeRequiredError);
    expect(() => assertScope(null)).toThrow(OrgScopeRequiredError);
  });

  it('scope가 있으면(ALL이든 SITES든) 통과한다', () => {
    expect(() => assertScope({ kind: 'ALL' })).not.toThrow();
    expect(() => assertScope({ kind: 'SITES', siteIds: [] })).not.toThrow();
  });
});

describe('assertSiteInScope', () => {
  it('ALL 스코프는 어떤 siteId도 허용한다', () => {
    expect(() => assertSiteInScope({ kind: 'ALL' }, 'any-site')).not.toThrow();
  });

  it('SITES 스코프 밖의 siteId는 거부한다', () => {
    expect(() => assertSiteInScope({ kind: 'SITES', siteIds: ['site-a'] }, 'site-b')).toThrow(
      OrgScopeDeniedError,
    );
  });

  it('SITES 스코프 안의 siteId는 허용한다', () => {
    expect(() => assertSiteInScope({ kind: 'SITES', siteIds: ['site-a'] }, 'site-a')).not.toThrow();
  });
});
