import { Module } from '@nestjs/common';
import { NotificationPolicyResolverService } from './notification-policy-resolver.service';

@Module({
  providers: [NotificationPolicyResolverService],
  exports: [NotificationPolicyResolverService],
})
export class NotificationPolicyModule {}
