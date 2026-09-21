import { Global, Module } from '@nestjs/common';
import { OrgScopeResolverService } from './org-scope-resolver.service';

@Global()
@Module({
  providers: [OrgScopeResolverService],
  exports: [OrgScopeResolverService],
})
export class ScopeModule {}
