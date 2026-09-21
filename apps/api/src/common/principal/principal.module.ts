import { Global, Module } from '@nestjs/common';
import { SystemContextService } from './system-context.service';

@Global()
@Module({
  providers: [SystemContextService],
  exports: [SystemContextService],
})
export class PrincipalModule {}
