import { INestApplication } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';

import * as request from 'supertest';

import { AppController } from '../src/app.controller';

import { AppService } from '../src/app.service';

describe('HTTP integration (health + CORS)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],

      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.enableCors({
      origin: 'https://frontend.test',

      credentials: true,
    });

    app.setGlobalPrefix('api/v1');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns backend health without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')

      .expect(200)

      .expect({ status: 'ok', service: 'backend' });
  });

  it('allows the configured frontend origin with credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')

      .set('Origin', 'https://frontend.test')

      .expect(200)

      .expect('Access-Control-Allow-Origin', 'https://frontend.test')

      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('answers the browser preflight request for the configured frontend', async () => {
    await request(app.getHttpServer())
      .options('/api/v1/health')

      .set('Origin', 'https://frontend.test')

      .set('Access-Control-Request-Method', 'GET')

      .expect(204)

      .expect('Access-Control-Allow-Origin', 'https://frontend.test')

      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('does not grant CORS access to an unrelated origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')

      .set('Origin', 'https://attacker.test')

      .expect(200);

    expect(response.headers['access-control-allow-origin']).not.toBe(
      'https://attacker.test',
    );
  });
});
