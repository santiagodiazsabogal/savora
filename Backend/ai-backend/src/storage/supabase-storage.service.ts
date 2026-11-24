import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Sube/borra imágenes del feed social en Supabase Storage (bucket público `social`).
// Guardamos solo la URL pública en Postgres — las imágenes NO viven en la DB.
// Usa la service role key (server-side) para saltarse las RLS policies del bucket.
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly bucket = 'social';
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (this.client) return this.client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new InternalServerErrorException(
        'Supabase Storage no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  // Sube un base64 (con o sin prefijo data:image) bajo el prefijo dado y devuelve la URL pública.
  private async uploadImage(pathPrefix: string, base64: string): Promise<string> {
    const match = /^data:(image\/\w+);base64,/.exec(base64);
    const contentType = match ? match[1] : 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const clean = base64.replace(/^data:image\/\w+;base64,/, '').trim();

    if (clean.length < 100) {
      throw new InternalServerErrorException('Invalid image');
    }

    const buffer = Buffer.from(clean, 'base64');
    const path = `${pathPrefix}/${randomUUID()}.${ext}`;

    const { error } = await this.getClient()
      .storage.from(this.bucket)
      .upload(path, buffer, { contentType, upsert: false });

    if (error) {
      this.logger.error(`Error subiendo imagen a Storage: ${error.message}`);
      throw new InternalServerErrorException('No se pudo subir la imagen');
    }

    const { data } = this.getClient().storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // Imagen de un post del feed social.
  async uploadPostImage(userId: number, base64: string): Promise<string> {
    return this.uploadImage(`posts/${userId}`, base64);
  }

  // Imagen adjunta en el chat de un clan (la DB guarda solo la URL, no el base64).
  async uploadClanChatImage(clanId: string, userId: number, base64: string): Promise<string> {
    return this.uploadImage(`clans/${clanId}/${userId}`, base64);
  }

  // Foto del plato de un duelo (transitoria: se borra del bucket tras juzgar).
  async uploadBattlePhoto(battleId: string, userId: number, base64: string): Promise<string> {
    return this.uploadImage(`battles/${battleId}/${userId}`, base64);
  }

  // Borra una imagen del bucket a partir de su URL pública. Best-effort: si falla,
  // solo se loggea (no rompemos la operación principal).
  async deleteImage(imageUrl: string): Promise<void> {
    return this.deleteImages([imageUrl]);
  }

  // Borrado en lote (una sola llamada a Storage). Ignora URLs que no son del bucket.
  async deleteImages(imageUrls: string[]): Promise<void> {
    try {
      const marker = `/object/public/${this.bucket}/`;
      const paths = imageUrls
        .map((url) => {
          const idx = url?.indexOf(marker) ?? -1;
          return idx === -1 ? null : url.slice(idx + marker.length);
        })
        .filter((p): p is string => !!p);
      if (paths.length === 0) return;
      const { error } = await this.getClient().storage.from(this.bucket).remove(paths);
      if (error) this.logger.warn(`No se pudo borrar imagen del bucket: ${error.message}`);
    } catch (e) {
      this.logger.warn(`Error borrando imagen del bucket: ${(e as Error).message}`);
    }
  }

  // Alias legacy (social/admin/users lo llaman con este nombre).
  async deletePostImage(imageUrl: string): Promise<void> {
    return this.deleteImage(imageUrl);
  }
}
