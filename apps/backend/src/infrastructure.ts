import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class InfrastructureService implements OnModuleDestroy {
  readonly pg: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    this.pg = new Pool(connectionString ? {
      connectionString,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.POSTGRES_POOL_MAX || 10),
    } : {
      host: process.env.POSTGRES_HOST || 'postgres',
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      max: Number(process.env.POSTGRES_POOL_MAX || 10),
    });
  }

  async status() {
    const startedAt = Date.now();
    try {
      await this.pg.query('SELECT 1');
      return { status: 'ok', database: 'connected', latencyMs: Date.now() - startedAt, timestamp: new Date().toISOString() };
    } catch {
      return { status: 'degraded', database: 'disconnected', latencyMs: Date.now() - startedAt, timestamp: new Date().toISOString() };
    }
  }

  async onModuleDestroy() { await this.pg.end(); }
}
