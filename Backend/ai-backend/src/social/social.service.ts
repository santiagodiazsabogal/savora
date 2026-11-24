import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { OpenaiService } from '../ai/openai.service';

const FEED_PAGE_SIZE = 20;
// Retención del feed (días): los posts son efímeros — pasado el plazo, un cron diario
// borra la fila (likes caen por cascade) y su imagen del bucket. Así el Storage no
// crece sin límite y el feed se mantiene "de ahora". Las insignias de likes NO se
// ven afectadas: leen User.likesReceivedTotal (contador de por vida).
const RETENTION_DAYS = Math.max(1, parseInt(process.env.SOCIAL_RETENTION_DAYS ?? '15', 10) || 15);
const PURGE_BATCH = 500;

// Post con autor + receta enlazada, tal como lo incluimos en las queries.
type PostWithRelations = {
  id: string;
  userId: number;
  type: string;
  imageUrl: string;
  caption: string | null;
  recipeId: number | null;
  likeCount: number;
  createdAt: Date;
  user: { id: number; name: string | null; username: string | null };
  recipe: { id: number; title: string; cookTime: number | null; difficulty: string | null; mealTime: string | null } | null;
};

export interface CreatePostInput {
  type: string;
  imageBase64: string;
  caption?: string | null;
  recipeId?: number | null;
}

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private openai: OpenaiService,
  ) {}

  // ids de usuarios que NO debo ver: los que yo bloqueé o los que me bloquearon.
  private async getBlockedUserIds(userId: number): Promise<number[]> {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<number>();
    for (const b of blocks) ids.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    return [...ids];
  }

  private readonly postInclude = {
    user: { select: { id: true, name: true, username: true } },
    recipe: { select: { id: true, title: true, cookTime: true, difficulty: true, mealTime: true } },
  };

  // Forma de respuesta que consume el frontend (incluye si YO le di like).
  private toDto(post: PostWithRelations, likedByMe: boolean) {
    return {
      id: post.id,
      type: post.type,
      imageUrl: post.imageUrl,
      caption: post.caption,
      recipeId: post.recipeId,
      recipeTitle: post.recipe?.title ?? null,
      recipeCookTime: post.recipe?.cookTime ?? null,
      recipeDifficulty: post.recipe?.difficulty ?? null,
      recipeMealTime: post.recipe?.mealTime ?? null,
      likeCount: post.likeCount,
      likedByMe,
      createdAt: post.createdAt,
      author: { id: post.user.id, name: post.user.name, username: post.user.username },
    };
  }

  // Marca likedByMe para un lote de posts sin N+1: una sola query de SocialLike.
  private async withLikedFlags(userId: number, posts: PostWithRelations[]) {
    if (posts.length === 0) return [];
    const likes = await this.prisma.socialLike.findMany({
      where: { userId, postId: { in: posts.map((p) => p.id) } },
      select: { postId: true },
    });
    const likedSet = new Set(likes.map((l) => l.postId));
    return posts.map((p) => this.toDto(p, likedSet.has(p.id)));
  }

  // ➕ Crear publicación (foto libre o receta propia compartida).
  async createPost(userId: number, input: CreatePostInput) {
    // Un usuario baneado o eliminado no puede publicar (aunque tenga un JWT vivo).
    const me = await this.prisma.user.findUnique({
      where: { id: userId }, select: { bannedAt: true, deletedAt: true },
    });
    if (me?.bannedAt || me?.deletedAt) throw new ForbiddenException('ACCOUNT_SUSPENDED');

    const type = input.type === 'RECIPE' ? 'RECIPE' : 'PHOTO';

    if (!input.imageBase64 || input.imageBase64.length < 100) {
      throw new BadRequestException('Image is required');
    }

    let recipeId: number | null = null;
    if (type === 'RECIPE') {
      if (!input.recipeId) {
        throw new BadRequestException('recipeId is required for RECIPE posts');
      }
      // Ownership: la receta debe ser del usuario.
      const recipe = await this.prisma.recipe.findFirst({
        where: { id: input.recipeId, userId },
        select: { id: true },
      });
      if (!recipe) throw new NotFoundException('Recipe not found');
      recipeId = recipe.id;
    }

    const caption =
      typeof input.caption === 'string'
        ? input.caption.trim().slice(0, 300) || null
        : null;

    const imageUrl = await this.storage.uploadPostImage(userId, input.imageBase64);

    // Moderación de seguridad (NSFW/sexual, violencia gráfica, autolesión). NO exige
    // que la foto sea culinaria; solo corta lo grave. Fail-open ante error de la API.
    // Si se marca, borramos la imagen ya subida y rechazamos con 'INAPPROPRIATE_IMAGE'.
    const mod = await this.openai.moderateImage(imageUrl);
    if (mod.flagged) {
      await this.storage.deletePostImage(imageUrl);
      throw new BadRequestException('INAPPROPRIATE_IMAGE');
    }

    const post = await this.prisma.socialPost.create({
      data: { userId, type, imageUrl, caption, recipeId },
      include: this.postInclude,
    });

    return this.toDto(post as PostWithRelations, false);
  }

  // 📰 Feed paginado por cursor (newest-first). cursor = id del último post visto.
  async getFeed(userId: number, cursor?: string, type?: string) {
    const blockedIds = await this.getBlockedUserIds(userId);
    const where = {
      ...(type === 'PHOTO' || type === 'RECIPE' ? { type } : {}),
      ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
    };

    const posts = await this.prisma.socialPost.findMany({
      where,
      include: this.postInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FEED_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > FEED_PAGE_SIZE;
    const page = hasMore ? posts.slice(0, FEED_PAGE_SIZE) : posts;
    const items = await this.withLikedFlags(userId, page as PostWithRelations[]);

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  // 🏆 Top 3 del día: fotos más likeadas y recetas más likeadas (creadas hoy).
  async getTop(userId: number) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const blockedIds = await this.getBlockedUserIds(userId);

    const baseQuery = (type: string) =>
      this.prisma.socialPost.findMany({
        where: {
          type, createdAt: { gte: startOfDay }, likeCount: { gt: 0 },
          ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
        },
        include: this.postInclude,
        orderBy: [{ likeCount: 'desc' }, { createdAt: 'asc' }],
        take: 3,
      });

    const [photos, recipes] = await Promise.all([
      baseQuery('PHOTO'),
      baseQuery('RECIPE'),
    ]);

    return {
      photos: await this.withLikedFlags(userId, photos as PostWithRelations[]),
      recipes: await this.withLikedFlags(userId, recipes as PostWithRelations[]),
    };
  }

  // ❤️ Toggle like (idempotente vía unique). Ajusta el contador en la misma TX.
  // Además mantiene User.likesReceivedTotal del AUTOR (contador de por vida para las
  // insignias de likes): sube al dar like y baja al quitarlo, pero NO baja cuando el
  // post se purga por retención — eso es lo que preserva el progreso.
  async toggleLike(userId: number, postId: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.socialLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true },
    });

    if (existing) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.socialLike.delete({ where: { id: existing.id } }),
        this.prisma.socialPost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        }),
        this.prisma.user.update({
          where: { id: post.userId },
          data: { likesReceivedTotal: { decrement: 1 } },
        }),
      ]);
      return { liked: false, likeCount: Math.max(0, updated.likeCount) };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.socialLike.create({ data: { postId, userId } }),
      this.prisma.socialPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      }),
      this.prisma.user.update({
        where: { id: post.userId },
        data: { likesReceivedTotal: { increment: 1 } },
      }),
    ]);
    return { liked: true, likeCount: updated.likeCount };
  }

  // 🧹 Retención del feed: purga diaria de posts más viejos que RETENTION_DAYS.
  // Borra primero las imágenes del bucket (best-effort) y luego las filas en lote
  // (SocialLike cae por cascade). Corre a las 4:15 para no chocar con el cron de billing.
  @Cron('15 4 * * *')
  async purgeOldPosts() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
    let total = 0;
    // En lotes acotados: nunca cargar miles de filas/URLs en una sola pasada.
    for (let round = 0; round < 10; round++) {
      const old = await this.prisma.socialPost.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true, imageUrl: true },
        take: PURGE_BATCH,
      });
      if (old.length === 0) break;
      await this.storage.deleteImages(old.map((p) => p.imageUrl));
      await this.prisma.socialPost.deleteMany({ where: { id: { in: old.map((p) => p.id) } } });
      total += old.length;
      if (old.length < PURGE_BATCH) break;
    }
    if (total > 0) this.logger.log(`Retención social: ${total} post(s) de más de ${RETENTION_DAYS} días purgado(s)`);
  }

  // 🗑️ Borrar post propio (ownership) + su imagen del bucket.
  async deletePost(userId: number, postId: string) {
    const post = await this.prisma.socialPost.findFirst({
      where: { id: postId, userId },
      select: { id: true, imageUrl: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.socialPost.delete({ where: { id: postId } });
    await this.storage.deletePostImage(post.imageUrl);

    return { success: true };
  }

  // =========================
  // 🚩 MODERACIÓN: reportes + bloqueos
  // =========================
  private cleanReason(reason: string): string {
    return (reason ?? '').trim().slice(0, 300) || 'unspecified';
  }

  // Reportar una publicación (queda 'pending' para revisión posterior).
  async reportPost(userId: number, postId: string, reason: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: postId }, select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId === userId) throw new BadRequestException('No puedes reportar tu propio contenido');

    await this.prisma.report.create({
      data: {
        reporterId: userId, targetType: 'POST', postId,
        reportedUserId: post.userId, reason: this.cleanReason(reason),
      },
    });
    return { success: true };
  }

  // Reportar un usuario.
  async reportUser(userId: number, targetUserId: number, reason: string) {
    if (targetUserId === userId) throw new BadRequestException('No puedes reportarte a ti mismo');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.report.create({
      data: {
        reporterId: userId, targetType: 'USER',
        reportedUserId: targetUserId, reason: this.cleanReason(reason),
      },
    });
    return { success: true };
  }

  // Bloquear: oculta su contenido en ambos sentidos y rompe cualquier amistad/solicitud.
  async blockUser(userId: number, targetUserId: number) {
    if (targetUserId === userId) throw new BadRequestException('No puedes bloquearte a ti mismo');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
        create: { blockerId: userId, blockedId: targetUserId },
        update: {},
      }),
      this.prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: userId, addresseeId: targetUserId },
            { requesterId: targetUserId, addresseeId: userId },
          ],
        },
      }),
    ]);
    return { success: true, blocked: true };
  }

  async unblockUser(userId: number, targetUserId: number) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetUserId } });
    return { success: true, blocked: false };
  }

  // 🔖 Guardar la receta de un post compartido como COPIA propia (en "Mis recetas").
  // Es la única forma de quedarse con una receta ajena del feed (getRecipeById exige
  // ownership, así que el post no se puede "abrir" directamente). Idempotente:
  // si ya es mía o ya la guardé antes (mismo título), devuelve esa sin duplicar.
  async saveRecipeFromPost(userId: number, postId: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: postId },
      select: { type: true, recipeId: true },
    });
    if (!post || post.type !== 'RECIPE' || !post.recipeId) {
      throw new NotFoundException('Post not found');
    }

    const source = await this.prisma.recipe.findUnique({ where: { id: post.recipeId } });
    if (!source) throw new NotFoundException('Recipe not found');

    if (source.userId === userId) {
      return { saved: false, alreadySaved: true, recipeId: source.id };
    }

    const existing = await this.prisma.recipe.findFirst({
      where: { userId, title: source.title },
      select: { id: true },
    });
    if (existing) {
      return { saved: false, alreadySaved: true, recipeId: existing.id };
    }

    const copy = await this.prisma.recipe.create({
      data: {
        userId,
        title: source.title,
        description: source.description,
        tip: source.tip,
        ingredients: source.ingredients as Prisma.InputJsonValue,
        tools: source.tools as Prisma.InputJsonValue,
        steps: source.steps as Prisma.InputJsonValue,
        ...(source.stepTips != null ? { stepTips: source.stepTips as Prisma.InputJsonValue } : {}),
        ...(source.nutrition != null ? { nutrition: source.nutrition as Prisma.InputJsonValue } : {}),
        difficulty: source.difficulty,
        cookTime: source.cookTime,
        mealTime: source.mealTime,
      },
      select: { id: true },
    });
    return { saved: true, alreadySaved: false, recipeId: copy.id };
  }

  // Lista de usuarios que YO bloqueé (para gestionarlos).
  async getBlocked(userId: number) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { blocked: { select: { id: true, name: true, username: true } } },
    });
    return blocks.map((b) => b.blocked);
  }
}
