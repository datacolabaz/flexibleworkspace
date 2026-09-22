import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
// `cookie-parser` is a plain old-style CommonJS export (`module.exports = fn`,
// no `.default`) and the project intentionally does not set the global
// `esModuleInterop` flag (flipping it repo-wide broke unrelated files —
// see PHASE4_REPORT.md). `import ... = require(...)` is TypeScript's
// CommonJS-specific import form: it compiles to a plain `require()` call
// under the `commonjs` module target regardless of `esModuleInterop`, so
// this one import is fixed without changing how any other file compiles.
import cookieParser = require('cookie-parser');

import { AppModule } from './app.module';

/**
 * 11_API_CONTRACTS.md §11.2/§11.6, 18_SECURITY.md §18.7 — global wiring that
 * every request/response goes through, regardless of which module handles
 * it: versioned base path, strict validation (reject unknown/mistyped
 * fields rather than silently accepting them), the standard security
 * headers, CORS scoped to the configured frontend origin, and a live
 * OpenAPI document generated FROM the actual routes (ADR-009 — the approved
 * 29_API_OPENAPI.yaml is the contract the code implements against; this is
 * the running system's own reflection of it, useful for drift-checking).
 */
async function bootstrap() {
  // `rawBody: true` (built into Nest's platform-express adapter since
  // v9.4) populates `req.rawBody` with the exact, unparsed request bytes
  // alongside the normal parsed `req.body` — needed by
  // PaymentsController's webhook route, since HMAC signature verification
  // (18_SECURITY.md §18.3) must run against the exact bytes the gateway
  // signed, not a JSON.parse()-then-reserialize approximation of them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // 22_INFRASTRUCTURE.md §22.7 — serves room photos (STORAGE_PROVIDER,
  // storage.module.ts) publicly under /uploads. Deliberately the ONLY
  // static-file mount in the app: provider verification documents live in a
  // separate, never-mounted directory (PRIVATE_STORAGE_PROVIDER) and are
  // only ever readable via the admin-only download route.
  app.useStaticAssets(config.get<string>('storage.localPath') ?? './uploads', {
    prefix: '/uploads',
  });

  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });
  // 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 — the referral attribution
  // cookie (an opaque token, never trusted alone) is read at booking-creation
  // time and set by GET /r/{code}. cookie-parser is the only new dependency
  // this needs; nothing else in the app reads/writes cookies.
  app.use(cookieParser());

  const apiBasePath = config.get<string>('apiBasePath') ?? '/api/v1';
  // GET /r/:code (31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4/§31.6) is
  // excluded from the versioned API prefix on purpose — a partner shares
  // this link publicly (Instagram bio, a blog post), so it needs to stay
  // short: "[MARKETPLACE_DOMAIN]/r/BLOGGER123", not
  // "[MARKETPLACE_DOMAIN]/api/v1/r/BLOGGER123".
  app.setGlobalPrefix(apiBasePath.replace(/^\//, ''), { exclude: ['r/:code'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared on the DTO
      forbidNonWhitelisted: true, // reject requests carrying unknown fields, rather than silently ignoring them
      transform: true, // enables class-transformer (@Type()) and typed route params
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // The error envelope itself (AllExceptionsFilter -> {error:{code,message,
  // details}}, 11_API_CONTRACTS.md §11.2) is already registered globally via
  // APP_FILTER in AppModule.

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlexSpace API')
    .setDescription(
      'Live-generated reflection of the running backend. The approved contract is docs/phase2/29_API_OPENAPI.yaml (ADR-009).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
}
bootstrap();
