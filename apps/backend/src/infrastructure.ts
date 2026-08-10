import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';

@Injectable()
export class InfrastructureService implements OnApplicationShutdown {
  readonly postgres = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.POSTGRES_POOL_SIZE || 10),
    connectionTimeoutMillis: 5_000,
  });

  readonly redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  async status() {
    const startedAt = Date.now();
    const database = await this.postgres.query<{ now: Date }>('select now()');
    if (this.redis.status === 'wait') await this.redis.connect();
    const redis = await this.redis.ping();
    return {
      ok: true,
      service: 'clinic-hub-backend',
      database: Boolean(database.rows[0]?.now),
      redis: redis === 'PONG',
      latencyMs: Date.now() - startedAt,
      version: process.env.APP_VERSION || 'development',
    };
  }

  async onApplicationShutdown() {
    await Promise.allSettled([this.postgres.end(), this.redis.quit()]);
  }
}
