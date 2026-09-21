import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmployeeRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { EmployeePrincipal } from '../principal/principal.types';

/** "역할 × 조직 스코프" 중 역할 축. 스코프 축은 PrincipalGuard + 서비스 레벨의 assertSiteInScope가 맡는다. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<EmployeeRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const principal = request.principal as EmployeePrincipal | undefined;
    if (!principal || !requiredRoles.includes(principal.role)) {
      throw new ForbiddenException({ code: 'ROLE_DENIED', message: '이 작업을 수행할 권한이 없습니다.' });
    }
    return true;
  }
}
