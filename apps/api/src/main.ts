import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // STEP5-B: apps/kiosk·apps/admin-web은 apps/api와 별도 오리진(다른 포트/도메인)의
  // 브라우저 앱이다 — 이 시스템은 어디서도 쿠키 기반 인증을 쓰지 않고
  // Authorization/X-Kiosk-Device-Credential 헤더만 쓰므로(CSRF 취약점 없음),
  // 오리진을 넓게 허용해도 안전하다.
  app.enableCors();

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('근태관리시스템 API')
    .setDescription('전사 근태관리 시스템 백엔드 API 문서 (STEP 4: 출퇴근 등록 API)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('port', 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port} (docs: /docs)`);
}

bootstrap();
