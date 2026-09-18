import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

/**
 * Boots the REAL, full AppModule (every feature module wired together) —
 * the one thing no per-module e2e spec exercises. This is intentionally a
 * thin smoke test, not a place to duplicate module-level coverage.
 *
 * The original Nest-CLI-generated version of this file asserted
 * `GET / -> 200 "Hello World!"`, which stopped being true once
 * JwtAuthGuard was wired in as a global APP_GUARD (18_SECURITY.md §18.2 —
 * every route requires authentication unless explicitly @Public()), and
 * the root route was never marked @Public() because it isn't part of the
 * product's real API surface (11_API_CONTRACTS.md has no "/" endpoint).
 * Updated to assert the guard's actual, intended behavior instead of
 * stale scaffolding. It also never called `app.close()`, which leaked the
 * TypeORM connection pool and left the process hanging after the test run.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) requires authentication, since the root route is not marked @Public()', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });
});
