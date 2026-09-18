import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Standalone TypeORM DataSource used by the `typeorm` migration CLI
 * (see package.json scripts: migration:run, migration:revert, migration:generate).
 *
 * This is intentionally separate from the NestJS-managed connection in
 * app.module.ts (which uses the same connection parameters via ConfigService)
 * because the migration CLI runs outside the Nest dependency-injection
 * context. Keeping both configs reading from the same environment variables
 * is what keeps them from drifting apart.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'flexspace',
  password: process.env.DB_PASSWORD || 'flexspace_dev_password',
  database: process.env.DB_DATABASE || 'flexspace',
  ssl: process.env.DB_SSL === 'true',
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false, // NEVER true — see 27_ADRS.md ADR-009: schema is migration-driven, not ORM-synchronized
  logging:
    process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
