import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // STEP12: OWASP 권고 보안 헤더 일괄 적용(CSP/HSTS/X-Frame-Options 등).
  app.use(helmet());

  // STEP5-B: apps/kiosk·apps/admin-web은 apps/api와 별도 오리진(다른 포트/도메인)의
  // 브라우저 앱이다 — 이 시스템은 어디서도 쿠키 기반 인증을 쓰지 않고
  // Authorization/X-Kiosk-Device-Credential 헤더만 쓰므로(CSRF 취약점 없음),
  // 오리진을 넓게 허용해도 안전하다. STEP12: 그래도 운영에서는
  // CORS_ALLOWED_ORIGINS로 좁힐 수 있게 했다 — 비워 두면(로컬 개발 기본값)
  // 기존과 동일하게 전체 허용을 유지한다.
  const allowedOrigins = config.get<string[]>('corsAllowedOrigins', []);
  app.enableCors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined);

  // STEP12: 바디 크기 상한을 명시한다(Express 기본값에 암묵적으로 기대지 않는다).
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  // STEP12: 운영 환경에서는 전체 API 스키마 노출을 피한다(OWASP API9 관심사).
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('근태관리시스템 API')
      .setDescription('전사 근태관리 시스템 백엔드 API 문서 (STEP 4: 출퇴근 등록 API)')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('port', 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port} (docs: /docs)`);
}

bootstrap();
