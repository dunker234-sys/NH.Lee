import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AccessLogService } from '../access-log/access-log.service';
import { EmployeePrincipal } from '../principal/principal.types';

// express 패키지를 직접 import하지 않고 필요한 최소 인터페이스만 정의한다
// (pnpm 워크스페이스에서 express는 apps/api의 직접 의존성이 아니라 phantom
// dependency가 될 수 있다).
interface MinimalResponse {
  status(code: number): { json(body: unknown): void };
}

interface NormalizedError {
  statusCode: number;
  code: string;
  message: unknown;
  details?: unknown;
}

/**
 * 표준 에러 응답 {statusCode, code, message, details?, timestamp, path}을 만든다.
 * 401/403/스코프 미지정(500) 같은 인가 실패는 여기서 access_log에 DENIED로 남긴다
 * (가드가 던진 예외는 인터셉터를 거치지 않으므로 이곳이 유일한 기록 지점이다).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly accessLog: AccessLogService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<MinimalResponse>();
    const request = ctx.getRequest();

    const normalized = this.normalize(exception);

    if (this.isAuthorizationFailure(normalized)) {
      const principal = request.principal as EmployeePrincipal | undefined;
      void this.accessLog.write({
        actorPrincipal: principal?.employeeNo ?? 'ANONYMOUS',
        actorRole: principal?.role ?? 'ANONYMOUS',
        orgScopeApplied: request.orgScope,
        action: `${request.method} ${request.url}`,
        resourceType: String(request.url).split('?')[0].split('/').filter(Boolean)[0] ?? 'unknown',
        requestPath: request.originalUrl ?? request.url,
        ipAddress: request.ip,
        result: 'DENIED',
      });
    }

    if (normalized.code === 'ORG_SCOPE_REQUIRED') {
      this.logger.error(`ORG_SCOPE_REQUIRED_VIOLATION at ${request.method} ${request.url}`);
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private isAuthorizationFailure(normalized: NormalizedError): boolean {
    return normalized.statusCode === 401 || normalized.statusCode === 403 || normalized.code === 'ORG_SCOPE_REQUIRED';
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        return {
          statusCode: status,
          code: (b.code as string) ?? defaultCodeForStatus(status),
          message: b.message ?? exception.message,
          details: b.details,
        };
      }
      return { statusCode: status, code: defaultCodeForStatus(status), message: body };
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: '서버 오류가 발생했습니다.',
    };
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'ERROR';
  }
}
