import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { OrgScopeResolverService } from '../scope/org-scope-resolver.service';
import { ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY } from '../decorators/allow-while-password-change-required.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { EmployeePrincipal } from '../principal/principal.types';

export class MustChangePasswordError extends ForbiddenException {
  constructor() {
    super({ code: 'MUST_CHANGE_PASSWORD', message: '최초 로그인 시 비밀번호를 변경해야 합니다.' });
  }
}

/**
 * 매 요청마다 Employee(+활성 EmployeeSiteAssignment)를 DB에서 새로 읽어
 * request.principal(권위 있는 값)과 request.orgScope를 만든다. role/scope를
 * JWT 클레임에서 그대로 믿지 않는 이유는 액세스 토큰 TTL(15분)보다 리프레시
 * 토큰 수명(14일)이 훨씬 길어서, 그 사이 권한이 바뀌어도(퇴사, 인사이동)
 * 토큰이 유효한 한 계속 옛 권한으로 접근할 수 있게 되기 때문이다.
 */
@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly scopeResolver: OrgScopeResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const claims = request.tokenClaims as { sub?: string } | undefined;
    if (!claims?.sub) throw new UnauthorizedException();

    const employee = await this.prisma.employee.findUnique({
      where: { id: claims.sub },
      include: { credential: true },
    });
    if (!employee || employee.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    const allowWhilePasswordChangeRequired = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (employee.credential?.mustChangePassword && !allowWhilePasswordChangeRequired) {
      throw new MustChangePasswordError();
    }

    const principal: EmployeePrincipal = {
      kind: 'EMPLOYEE',
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      role: employee.role,
      status: employee.status,
    };
    request.principal = principal;
    request.orgScope = await this.scopeResolver.resolve(employee.id, employee.role);

    return true;
  }
}
