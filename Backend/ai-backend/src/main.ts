import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as express from 'express';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  dotenv.config();

  // Observabilidad opcional: solo se activa si hay SENTRY_DSN (no-op en dev sin DSN).
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0, // solo errores, sin performance tracing (gratis/barato)
    });
  }

  // bodyParser: false → el parser interno de Nest (límite de 100kb por defecto) NO se
  // registra, así el express.json({limit:'20mb'}) de abajo es el único que corre y su
  // límite real aplica. Con bodyParser:true, el de Nest corría primero (100kb) y
  // rechazaba (413) cualquier foto en base64 antes de llegar a este app.use().
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Permite que Nest dispare onModuleDestroy (PrismaService.$disconnect)
  // en SIGINT/SIGTERM y en cada reinicio del watch mode.
  app.enableShutdownHooks();

  // Filtro global: logging consistente + reporte de 5xx a Sentry, sin romper el shape de errores.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Detrás de proxy (deploy), confía en X-Forwarded-* para que el rate limiting vea la IP real.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);

  // Cabeceras de seguridad (HSTS, nosniff, no-frame, oculta X-Powered-By...). Es una API JSON,
  // así que desactivamos la CSP (pensada para HTML) para no añadir cabeceras inútiles/confusas.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ limit: '20mb', extended: true }));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();