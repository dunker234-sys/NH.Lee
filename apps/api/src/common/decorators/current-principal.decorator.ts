import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { EmployeePrincipal } from '../principal/principal.types';
import { OrgScope } from '../scope/org-scope.types';

/** PrincipalGuard가 채운 request.principal(DB 기반, 신뢰 가능)을 꺼낸다. */
export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): EmployeePrincipal => {
    return ctx.switchToHttp().getRequest().principal;
  },
);

/** PrincipalGuard가 채운 request.orgScope를 꺼낸다. */
export const CurrentOrgScope = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgScope => {
  return ctx.switchToHttp().getRequest().orgScope;
});
