import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private keepAliveTimer?: ReturnType<typeof setInterval>;

  async onModuleInit() {
    // Reintenta queries ante blips transitorios del pooler de Supabase (P1001/P1017/P2024),
    // para que un hipo momentáneo no tumbe la request (sugerencias, listados, etc.).
    this.$use(async (params, next) => {
      const maxReintentos = 3;
      for (let intento = 1; ; intento++) {
        try {
          return await next(params);
        } catch (error) {
          const code = (error as { code?: string })?.code;
          const transitorio = code === 'P1001' || code === 'P1017' || code === 'P2024';
          if (!transitorio || intento >= maxReintentos) throw error;
          const esperaMs = 300 * intento; // 300ms, 600ms
          this.logger.warn(
            `Query ${params.model ?? '?'}.${params.action} falló (${code}), reintento ${intento}/${maxReintentos - 1} en ${esperaMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, esperaMs));
        }
      }
    });

    // El pooler de Supabase (Supavisor) ocasionalmente flapea al arrancar:
    // P1001 ("can't reach") o P1000 transitorios. En vez de tumbar todo el
    // bootstrap por un blip pasajero, reintentamos con backoff exponencial.
    const maxIntentos = 5;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        await this.$connect();
        if (intento > 1) {
          this.logger.log(`Conexión a la DB establecida (intento ${intento}/${maxIntentos})`);
        }
        // Pre-calienta el pool y lo mantiene caliente (ver calentarPool/keepAlive abajo).
        await this.calentarPool();
        this.iniciarKeepAlive();
        return;
      } catch (error) {
        const code = (error as { errorCode?: string })?.errorCode ?? '?';
        if (intento === maxIntentos) {
          this.logger.error(
            `No se pudo conectar a la DB tras ${maxIntentos} intentos (último: ${code})`,
          );
          throw error;
        }
        const esperaMs = Math.min(1000 * 2 ** (intento - 1), 8000); // 1s,2s,4s,8s
        this.logger.warn(
          `Fallo al conectar a la DB (${code}), intento ${intento}/${maxIntentos}. Reintento en ${esperaMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, esperaMs));
      }
    }
  }

  // El primer request "real" suele disparar varias queries a la vez (p.ej. el perfil/insignias),
  // forzando al pool a abrir varias conexiones EN FRÍO (TLS + auth del pooler) → ~7s. Aquí abrimos
  // unas pocas conexiones de golpe al arrancar (hasta connection_limit) con un SELECT 1 en paralelo,
  // para que ya estén calientes cuando llegue el usuario. Fail-soft: nunca tumba el arranque.
  private async calentarPool() {
    try {
      await Promise.allSettled(
        Array.from({ length: this.warmPoolSize() }, () => this.$queryRaw`SELECT 1`),
      );
    } catch {
      /* el warmup es best-effort */
    }
  }

  // Cuántas conexiones pre-calentar y mantener vivas con el keepalive.
  // En dev, `nest start --watch` reinicia con frecuencia y en Windows mata el proceso con
  // TerminateProcess (no hay SIGTERM real) → onModuleDestroy NO corre y esas conexiones quedan
  // colgadas hasta el idle timeout del pooler. Mantener MENOS huella por instancia da mucho más
  // margen antes de topar las 15 del session pooler (EMAXCONNSESSION) al reiniciar varias veces.
  // En prod no hay watch-restart y el pool caliente completo conviene → usamos connection_limit.
  private warmPoolSize(): number {
    const limite = this.connectionLimit();
    return process.env.NODE_ENV === 'production' ? limite : Math.min(2, limite);
  }

  // Supabase (Supavisor) cierra las conexiones inactivas, así que tras un rato de idle el pool
  // vuelve a estar frío y el siguiente request paga de nuevo el arranque. Un ping periódico
  // (varias queries concurrentes) mantiene caliente el engine + unas conexiones. Intervalo < timeout
  // de idle del pooler. Best-effort: si falla un ping no pasa nada (el middleware $use ya reintenta).
  private iniciarKeepAlive() {
    const cada = 60_000; // 1 min — por debajo del idle timeout típico del pooler
    this.keepAliveTimer = setInterval(() => {
      Promise.allSettled(
        Array.from({ length: this.warmPoolSize() }, () => this.$queryRaw`SELECT 1`),
      ).catch(() => { /* best-effort */ });
    }, cada);
    // No bloquear el cierre del proceso por el timer.
    this.keepAliveTimer.unref?.();
  }

  // Lee connection_limit del DATABASE_URL (default 5 en este proyecto); acota a [1,10].
  private connectionLimit(): number {
    const m = /[?&]connection_limit=(\d+)/.exec(process.env.DATABASE_URL ?? '');
    const n = m ? parseInt(m[1], 10) : 5;
    return Math.min(Math.max(n, 1), 10);
  }

  // Cierra las conexiones al apagar/reiniciar (clave en watch mode:
  // sin esto cada hot-reload deja conexiones colgadas y satura el pooler → EMAXCONNSESSION)
  async onModuleDestroy() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    await this.$disconnect();
  }
}
