import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    bodyLimit: 15 * 1024 * 1024,
    trustProxy: true,
  }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.BACKEND_PORT || 4000), '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
