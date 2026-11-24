import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isPaid } from '../common/plans';

const VOICE_ID = 'Eve';
// 'auto' detecta el idioma del texto (ES/EN) y lo pronuncia bien.
// Antes estaba fijo en 'en' → leía recetas en español con acento inglés.
const TTS_LANGUAGE = 'auto';
// Un poco más pausado que 1.0 → tono amigable, ideal para enseñar a cocinar.
// No cuesta más tokens (el cobro es por caracteres de texto, no por duración).
const SPEECH_SPEED = 0.9;

// Caché EFÍMERO en memoria (2026-07-05, antes tabla TtsCache con el audio en Postgres):
// las recetas son únicas por usuario, así que el caché persistente casi nunca se
// reutilizaba entre usuarios — solo servía para repetir un paso en la MISMA sesión de
// cocina. Eso lo cubre igual un caché en memoria con TTL, y el audio ya no ocupa DB
// (cada mp3 pesa ~150-200KB; con TTS activo habría llenado los 500MB del plan free).
const TTS_MEM_TTL_MS = 6 * 60 * 60 * 1000; // 6h: cubre la sesión de cocina + re-escuchas del día
const TTS_MEM_MAX_ENTRIES = 60;            // ~60 × ~180KB ≈ 11MB de RAM máximo

@Injectable()
export class TtsService {
  private memCache = new Map<string, { audio: Buffer; at: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // Devuelve el audio cacheado en memoria si sigue vigente (y refresca su posición LRU).
  private memGet(hash: string): Buffer | null {
    const hit = this.memCache.get(hash);
    if (!hit) return null;
    if (Date.now() - hit.at > TTS_MEM_TTL_MS) {
      this.memCache.delete(hash);
      return null;
    }
    // Re-insertar al final = LRU barato (Map preserva orden de inserción).
    this.memCache.delete(hash);
    this.memCache.set(hash, hit);
    return hit.audio;
  }

  private memSet(hash: string, audio: Buffer): void {
    // Evicción LRU: si está lleno, sale el más viejo (primera clave del Map).
    if (this.memCache.size >= TTS_MEM_MAX_ENTRIES) {
      const oldest = this.memCache.keys().next().value;
      if (oldest) this.memCache.delete(oldest);
    }
    this.memCache.set(hash, { audio, at: Date.now() });
  }

  /**
   * Convierte texto a voz y devuelve el audio como Buffer (audio/mpeg).
   *
   * - Solo usuarios PRO pueden usar el servicio (lanza 403 'PRO_ONLY' si no).
   * - Caché efímero en memoria: re-escuchar un paso en la misma sesión no re-paga
   *   tokens; el audio se descarta solo (TTL/LRU) y NUNCA se guarda en la DB.
   * - Si xAI falla o no está configurado, lanza 503.
   */
  async synthesize(text: string, userId: number): Promise<Buffer> {
    // 1. Gate PRO — el TTS es una función premium.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user || !isPaid(user.plan)) {
      throw new ForbiddenException('PRO_ONLY');
    }

    const cleanText = text.trim().slice(0, 500);
    // El speed va en el hash: si lo cambiamos, no servimos audio viejo a otra velocidad.
    const hash = createHash('sha256')
      .update(`${VOICE_ID}|${TTS_LANGUAGE}|${SPEECH_SPEED}|${cleanText}`)
      .digest('hex');

    // 2. Caché en memoria — re-escuchas de la sesión salen gratis.
    const cached = this.memGet(hash);
    if (cached) return cached;

    // 3. No está en caché → sintetizamos en xAI.
    const apiKey = this.configService.get<string>('XAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('The voice service is not configured');
    }

    let response: Response;
    try {
      response = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          voice_id: VOICE_ID,
          output_format: { codec: 'mp3', sample_rate: 44100, bit_rate: 128000 },
          language: TTS_LANGUAGE,
          speed: SPEECH_SPEED,
          text_normalization: true, // lee bien "180°C", "2 cdas", etc.
        }),
      });
    } catch (err) {
      console.error('xAI TTS network error:', err);
      throw new ServiceUnavailableException('Could not connect to the voice service');
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('xAI TTS error:', response.status, errorBody);
      throw new ServiceUnavailableException('The voice service is currently unavailable');
    }

    const audio = Buffer.from(await response.arrayBuffer());
    this.memSet(hash, audio);
    return audio;
  }
}
