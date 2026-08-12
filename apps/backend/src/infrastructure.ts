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

  private async ensureRedis() {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  async markActive(userId: string, role?: string) {
    if (!userId) return;
    try {
      await this.ensureRedis();
      const sampled = await this.redis.set(`clinic:presence:sample:${userId}`, '1', 'EX', 60, 'NX');
      if (!sampled) return;
      let slot = await this.redis.hget('clinic:user:bitmap-slots', userId);
      if (!slot) {
        slot = String(await this.redis.incr('clinic:user:bitmap-slot-sequence'));
        await this.redis.hset('clinic:user:bitmap-slots', userId, slot);
      }
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      const keys = [`clinic:active:${day}:all`];
      if (role) keys.push(`clinic:active:${day}:role:${role}`);
      const pipeline = this.redis.pipeline();
      for (const key of keys) pipeline.setbit(key, Number(slot), 1).expire(key, 60 * 60 * 24 * 35);
      await pipeline.exec();
    } catch (error) {
      console.warn('[Redis presence] mark failed:', error instanceof Error ? error.message : error);
    }
  }

  async markDataChanged(scopes: string[], userId?: string, role?: string) {
    try {
      await this.ensureRedis();
      const normalized = [...new Set(['all', ...scopes.map((scope) => String(scope || '').trim()).filter(Boolean)])];
      const pipeline = this.redis.pipeline();
      for (const scope of normalized) pipeline.hincrby('clinic:data:revisions', scope, 1);
      pipeline.hset('clinic:data:revision-meta', 'changed_at', new Date().toISOString(), 'scopes', JSON.stringify(normalized));
      await pipeline.exec();
      if (userId) await this.markActive(userId, role);
    } catch (error) {
      // Redis accelerates propagation but must never make a committed business
      // transaction fail. The next successful write will advance the revision.
      console.warn('[Redis revision] mark failed:', error instanceof Error ? error.message : error);
    }
  }

  async dataRevision(userId?: string, role?: string) {
    await this.ensureRedis();
    const [values, meta] = await Promise.all([
      this.redis.hgetall('clinic:data:revisions'),
      this.redis.hgetall('clinic:data:revision-meta'),
    ]);
    if (userId) void this.markActive(userId, role);
    let entityTypes: string[] = [];
    try { entityTypes = JSON.parse(meta.scopes || '[]'); } catch { entityTypes = []; }
    return {
      version: values.all || '0',
      revisions: values,
      changed_at: meta.changed_at || new Date().toISOString(),
      entity_types: entityTypes,
    };
  }

  async status() {
    const startedAt = Date.now();
    const database = await this.postgres.query<{ now: Date }>('select now()');
    await this.ensureRedis();
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
