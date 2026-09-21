import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AccessLogService } from '../access-log/access-log.service';
import { EmployeePrincipal } from '../principal/principal.types';

/**
 * 성공한 요청만 여기서 기록한다. 가드가 던진 예외는 인터셉터를 절대 거치지
 * 않으므로(Nest 파이프라인: 가드 → 인터셉터 → 핸들러), 거부(DENIED) 기록은
 * AllExceptionsFilter가 전담한다 — 두 곳이 같은 요청을 중복 기록하지 않는다.
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(private readonly accessLog: AccessLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        const principal = request.principal as EmployeePrincipal | undefined;
        void this.accessLog.write({
          actorPrincipal: principal?.employeeNo ?? 'ANONYMOUS',
          actorRole: principal?.role ?? 'ANONYMOUS',
          orgScopeApplied: request.orgScope,
          action: `${request.method} ${request.route?.path ?? request.url}`,
          resourceType: resourceTypeFromPath(request.url),
          resourceId: request.params?.id,
          requestPath: request.originalUrl ?? request.url,
          ipAddress: request.ip,
          result: 'SUCCESS',
        });
      }),
    );
  }
}

function resourceTypeFromPath(url: string): string {
  const segments = String(url).split('?')[0].split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}
