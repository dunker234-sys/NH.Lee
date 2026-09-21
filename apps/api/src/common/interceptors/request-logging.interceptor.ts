import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/**
 * 콘솔용 요청 로깅. DB에 남는 access_log(AccessLogInterceptor)와는 별개의
 * 관측성 채널이다 — 운영 중 tail -f 로 즉시 볼 수 있는 용도.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, 200, start),
        error: (err: { status?: number }) => this.log(request, err?.status ?? 500, start),
      }),
    );
  }

  private log(request: { method: string; originalUrl?: string; url: string }, status: number, start: number): void {
    const path = request.originalUrl ?? request.url;
    this.logger.log(`${request.method} ${path} -> ${status} (${Date.now() - start}ms)`);
  }
}
