import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Catálogo único de insignias (fuente de verdad en código → se upsert-ea a la tabla Badge
// para satisfacer la FK de UserBadge; añadir una insignia = añadir una entrada aquí).
//
// categoria: agrupa en el perfil ('curso'|'duelo'|'receta'|'clan'|'social'|'general').
// requiredPlan: plan mínimo para poder ganarla (solo informativo en el frontend; null = todos).
//   - recetas/social: todos · duelos/clan: PRO/CHEF · cursos: CHEF.
// tipo: cómo se calcula el progreso (ver verificarInsignias).
export type BadgeTipo =
  | 'coursesCompleted'
  | 'cocinas'
  | 'tecnicas'
  | 'streak'
  | 'pastaCourses'
  | 'seafoodCourses'
  | 'nivel'
  | 'recipeCount'
  | 'cookedCount'      // recetas terminadas en Modo Cocina (Recipe.cookedAt)
  | 'favoriteCount'    // recetas marcadas favoritas
  | 'duelsWon'
  | 'duelsPlayed'      // duelos jugados (participación)
  | 'likesReceived'    // suma de likeCount de los posts del usuario
  | 'postsCount'       // posts publicados en el muro social
  | 'clanLider'
  | 'clanTopRank'; // progresoTotal = umbral de ranking (≤N); se cumple si el clan está en el Top N

interface BadgeDef {
  id: string;
  nombre: string;
  descripcion: string;
  progresoTotal: number;
  categoria: 'curso' | 'duelo' | 'receta' | 'clan' | 'social' | 'general';
  requiredPlan: 'PRO' | 'CHEF' | null;
  tipo: BadgeTipo;
}

const BADGE_CATALOG: BadgeDef[] = [
  // 🍳 Recipes — available on ALL plans
  { id: 'recetas_10',  nombre: 'Home Cook',        descripcion: 'Generate 10 recipes',  progresoTotal: 10,  categoria: 'receta', requiredPlan: null, tipo: 'recipeCount' },
  { id: 'recetas_50',  nombre: 'Recipe Keeper',    descripcion: 'Generate 50 recipes',  progresoTotal: 50,  categoria: 'receta', requiredPlan: null, tipo: 'recipeCount' },
  { id: 'recetas_100', nombre: 'Iron Chef',        descripcion: 'Generate 100 recipes', progresoTotal: 100, categoria: 'receta', requiredPlan: null, tipo: 'recipeCount' },
  { id: 'cocina_10',   nombre: 'Hands On',         descripcion: 'Finish Cooking Mode 10 times', progresoTotal: 10, categoria: 'receta', requiredPlan: null, tipo: 'cookedCount' },
  { id: 'cocina_25',   nombre: 'Real Cook',        descripcion: 'Finish Cooking Mode 25 times', progresoTotal: 25, categoria: 'receta', requiredPlan: null, tipo: 'cookedCount' },
  { id: 'cocina_50',   nombre: 'Stove Master',     descripcion: 'Finish Cooking Mode 50 times', progresoTotal: 50, categoria: 'receta', requiredPlan: null, tipo: 'cookedCount' },
  { id: 'favoritos_10', nombre: 'Collector',       descripcion: 'Save 10 favorite recipes', progresoTotal: 10, categoria: 'receta', requiredPlan: null, tipo: 'favoriteCount' },
  { id: 'favoritos_25', nombre: 'Curator',         descripcion: 'Save 25 favorite recipes', progresoTotal: 25, categoria: 'receta', requiredPlan: null, tipo: 'favoriteCount' },

  // ⚔️ Duels — PRO/CHEF
  { id: 'duelos_jugados_10', nombre: 'Participant',    descripcion: 'Play 10 duels', progresoTotal: 10, categoria: 'duelo', requiredPlan: 'PRO', tipo: 'duelsPlayed' },
  { id: 'duelos_jugados_25', nombre: 'Arena Veteran',  descripcion: 'Play 25 duels', progresoTotal: 25, categoria: 'duelo', requiredPlan: 'PRO', tipo: 'duelsPlayed' },
  { id: 'duelos_10', nombre: 'Challenger',  descripcion: 'Win 10 duels', progresoTotal: 10, categoria: 'duelo', requiredPlan: 'PRO', tipo: 'duelsWon' },
  { id: 'duelos_25', nombre: 'Gladiator',   descripcion: 'Win 25 duels', progresoTotal: 25, categoria: 'duelo', requiredPlan: 'PRO', tipo: 'duelsWon' },
  { id: 'duelos_50', nombre: 'Unbeatable',  descripcion: 'Win 50 duels', progresoTotal: 50, categoria: 'duelo', requiredPlan: 'PRO', tipo: 'duelsWon' },

  // 📷 Social — available on ALL plans
  { id: 'post_primero', nombre: 'First Dish on the Wall', descripcion: 'Post your first photo or recipe', progresoTotal: 1,   categoria: 'social', requiredPlan: null, tipo: 'postsCount' },
  { id: 'likes_50',     nombre: 'Applause',               descripcion: 'Receive 50 likes total',          progresoTotal: 50,  categoria: 'social', requiredPlan: null, tipo: 'likesReceived' },
  { id: 'likes_100',    nombre: 'Influencer',              descripcion: 'Receive 100 likes total',         progresoTotal: 100, categoria: 'social', requiredPlan: null, tipo: 'likesReceived' },

  // 👥 Clan — PRO/CHEF
  { id: 'clan_lider',  nombre: 'Clan Leader',      descripcion: 'Found and lead a clan',              progresoTotal: 1,  categoria: 'clan', requiredPlan: 'PRO', tipo: 'clanLider' },
  { id: 'clan_top10',  nombre: 'Elite Clan',       descripcion: 'Your clan reaches the global Top 10',  progresoTotal: 10, categoria: 'clan', requiredPlan: 'PRO', tipo: 'clanTopRank' },
  { id: 'clan_top3',   nombre: 'Legendary Clan',   descripcion: 'Your clan reaches the global Top 3',   progresoTotal: 3,  categoria: 'clan', requiredPlan: 'PRO', tipo: 'clanTopRank' },
  { id: 'clan_top1',   nombre: 'Clan #1',          descripcion: 'Your clan reaches the global #1 spot', progresoTotal: 1, categoria: 'clan', requiredPlan: 'PRO', tipo: 'clanTopRank' },

  // 🎓 Courses — CHEF
  { id: 'primer_fuego', nombre: 'First Flame',           descripcion: 'Complete your first course',            progresoTotal: 1,  categoria: 'curso', requiredPlan: 'CHEF', tipo: 'coursesCompleted' },
  { id: 'viajero',      nombre: 'Culinary Traveler',     descripcion: 'Explore cuisines from 3 different countries', progresoTotal: 3, categoria: 'curso', requiredPlan: 'CHEF', tipo: 'cocinas' },
  { id: 'tecnico',      nombre: 'The Technician',        descripcion: 'Master 10 different techniques',        progresoTotal: 10, categoria: 'curso', requiredPlan: 'CHEF', tipo: 'tecnicas' },
  { id: 'constante',    nombre: 'Consistency',           descripcion: 'Keep a 7-day streak',                   progresoTotal: 7,  categoria: 'general', requiredPlan: null, tipo: 'streak' },
  { id: 'racha_30',     nombre: 'Unstoppable',           descripcion: 'Keep a 30-day streak',                  progresoTotal: 30, categoria: 'general', requiredPlan: null, tipo: 'streak' },
  { id: 'racha_100',    nombre: 'Daily Legend',          descripcion: 'Keep a 100-day streak',                 progresoTotal: 100, categoria: 'general', requiredPlan: null, tipo: 'streak' },
  { id: 'nivel_5',      nombre: 'Apprentice',            descripcion: 'Reach level 5',                         progresoTotal: 5,  categoria: 'general', requiredPlan: null, tipo: 'nivel' },
  { id: 'nivel_10',     nombre: 'Cook',                  descripcion: 'Reach level 10',                        progresoTotal: 10, categoria: 'general', requiredPlan: null, tipo: 'nivel' },
  { id: 'nivel_15',     nombre: 'Master',                descripcion: 'Reach level 15',                        progresoTotal: 15, categoria: 'general', requiredPlan: null, tipo: 'nivel' },
  { id: 'pastero',      nombre: 'Pasta Master',          descripcion: 'Complete 3 Pasta courses',              progresoTotal: 3,  categoria: 'curso', requiredPlan: 'CHEF', tipo: 'pastaCourses' },
  { id: 'marino',       nombre: 'King of the Sea',       descripcion: 'Complete 3 Seafood courses',            progresoTotal: 3,  categoria: 'curso', requiredPlan: 'CHEF', tipo: 'seafoodCourses' },
  { id: 'explorador',   nombre: 'Great Explorer',        descripcion: 'Explore 6 different cuisines',          progresoTotal: 6,  categoria: 'curso', requiredPlan: 'CHEF', tipo: 'cocinas' },
  { id: 'veterano',     nombre: 'Veteran',               descripcion: 'Reach level 20',                        progresoTotal: 20, categoria: 'general', requiredPlan: null, tipo: 'nivel' },
];

@Injectable()
export class BadgesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  private readonly logger = new Logger(BadgesService.name);

  // Se hace una sola vez por proceso: sincroniza el catálogo de código → tabla Badge.
  private catalogSynced = false;

  // Sincroniza el catálogo AL ARRANCAR (no en la primera petición del usuario). Antes esto
  // corría lazy en el 1er GET /badges con 33 upserts SECUENCIALES (~7s) → la primera carga de
  // insignias tras cada reinicio era lentísima. Ahora se paga al boot y en paralelo. No-fatal.
  async onModuleInit() {
    try {
      await this.ensureBadgeCatalog();
    } catch (e) {
      this.logger.warn(`No se pudo sincronizar el catálogo de insignias al arrancar: ${(e as Error).message}`);
    }
  }

  private async ensureBadgeCatalog() {
    if (this.catalogSynced) return;
    // Upserts en PARALELO (el pooler limita la concurrencia, pero evita los 33 round-trips en serie).
    await Promise.all(
      BADGE_CATALOG.map((def) =>
        this.prisma.badge.upsert({
          where: { id: def.id },
          update: {
            nombre: def.nombre,
            descripcion: def.descripcion,
            progresoTotal: def.progresoTotal,
            categoria: def.categoria,
          },
          create: {
            id: def.id,
            nombre: def.nombre,
            descripcion: def.descripcion,
            progresoTotal: def.progresoTotal,
            categoria: def.categoria,
          },
        }),
      ),
    );
    this.catalogSynced = true;
  }

  async initUserBadges(userId: number) {
    await this.ensureBadgeCatalog();
    const existing = await this.prisma.userBadge.findMany({ where: { userId } });
    const existingIds = new Set(existing.map((b) => b.badgeId));
    const toCreate = BADGE_CATALOG
      .filter((b) => !existingIds.has(b.id))
      .map((b) => ({ userId, badgeId: b.id }));
    if (toCreate.length > 0) {
      await this.prisma.userBadge.createMany({ data: toCreate, skipDuplicates: true });
    }
  }

  // Ranking global del clan del usuario (por XP colectivo total). rank 0 = sin clan
  // o clan sin XP (un clan a 0 no "rankea", evita que el empate a 0 cuente como Top 1).
  private async getClanRank(userId: number): Promise<{ rank: number; esLider: boolean }> {
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId },
      include: { clan: { select: { xpColectivoTotal: true } } },
      orderBy: { fechaIngreso: 'asc' },
    });
    if (!membership) return { rank: 0, esLider: false };
    const esLider = membership.rol === 'lider';
    if (membership.clan.xpColectivoTotal <= 0) return { rank: 0, esLider };
    const porEncima = await this.prisma.clan.count({
      where: { xpColectivoTotal: { gt: membership.clan.xpColectivoTotal } },
    });
    return { rank: porEncima + 1, esLider };
  }

  // Núcleo compartido: lee todo en UN lote paralelo, calcula el progreso en memoria y
  // escribe SOLO las insignias que cambiaron (al reabrir sin cambios → 0 escrituras).
  // Devuelve la lista completa (para el perfil/logros) + las recién completadas (para la
  // celebración de cursos). Antes esto hacía un UPDATE secuencial por insignia (hasta 33
  // round-trips a Supabase) en cada apertura → 2-3s; ahora es 1 lote de lecturas + writes raros.
  private async recompute(userId: number) {
    await this.ensureBadgeCatalog();

    // El pooler de Supabase está limitado (connection_limit=5), así que cada query extra cuesta
    // una "ola" de round-trip. Agrupamos: las 3 cuentas de recetas → 1 query raw, y posts+likes
    // → 1 aggregate. Pasa de 10 a 7 unidades de query (menos olas = menos latencia en caliente).
    const [user, stats, existingBadges, allUserCourses, recipeStats, socialAgg, clan] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userStats.findUnique({ where: { userId } }),
      this.prisma.userBadge.findMany({ where: { userId } }),
      this.prisma.userMealDbCourse.findMany({
        where: { userId },
        include: { course: { select: { strCategory: true } } },
      }),
      this.prisma.$queryRaw<{ total: number; cooked: number; fav: number }[]>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE "cookedAt" IS NOT NULL)::int AS cooked,
               COUNT(*) FILTER (WHERE "isFavorite" = true)::int AS fav
        FROM "Recipe" WHERE "userId" = ${userId}`,
      this.prisma.socialPost.aggregate({ where: { userId }, _count: { _all: true }, _sum: { likeCount: true } }),
      this.getClanRank(userId),
    ]);

    const recipeCount = recipeStats[0]?.total ?? 0;
    const cookedCount = recipeStats[0]?.cooked ?? 0;
    const favoriteCount = recipeStats[0]?.fav ?? 0;
    const postsCount = socialAgg._count._all;

    // Crear las filas que falten (usuario nuevo o insignias añadidas al catálogo). Las recién
    // creadas arrancan en 0/false (defaults del schema); abajo solo se escriben si ya hay progreso.
    const byId = new Map(existingBadges.map((b) => [b.badgeId, b]));
    const missing = BADGE_CATALOG.filter((def) => !byId.has(def.id));
    if (missing.length > 0) {
      await this.prisma.userBadge.createMany({
        data: missing.map((def) => ({ userId, badgeId: def.id })),
        skipDuplicates: true,
      });
    }

    // Likes de por vida (User.likesReceivedTotal, mantenido en toggleLike): los posts
    // se purgan a los 15 días (retención social), así que sumar solo los posts vivos
    // haría perder progreso. El max() con el aggregate cubre filas sin backfill.
    const likesReceived = Math.max(user?.likesReceivedTotal ?? 0, socialAgg._sum.likeCount ?? 0);
    const cocinasExploradas = (stats?.cocinasExploradas as string[]) ?? [];
    const tecnicasDominadas = (stats?.tecnicasDominadas as string[]) ?? [];
    const pastaCourses = allUserCourses.filter((c) => c.course.strCategory === 'Pasta').length;
    const seafoodCourses = allUserCourses.filter((c) => c.course.strCategory === 'Seafood').length;

    // Resuelve el progreso actual de una insignia según su tipo.
    const progresoDe = (def: BadgeDef): number => {
      switch (def.tipo) {
        case 'coursesCompleted': return user?.coursesCompleted ?? 0;
        case 'cocinas':          return cocinasExploradas.length;
        case 'tecnicas':         return tecnicasDominadas.length;
        case 'streak':           return user?.cookingStreak ?? 0;
        case 'pastaCourses':     return pastaCourses;
        case 'seafoodCourses':   return seafoodCourses;
        case 'nivel':            return user?.nivel ?? 1;
        case 'recipeCount':      return recipeCount;
        case 'cookedCount':      return cookedCount;
        case 'favoriteCount':    return favoriteCount;
        case 'duelsWon':         return user?.duelsWon ?? 0;
        case 'duelsPlayed':      return user?.duelsPlayed ?? 0;
        case 'likesReceived':    return likesReceived;
        case 'postsCount':       return postsCount;
        case 'clanLider':        return clan.esLider ? 1 : 0;
        // Top N: progreso 1 (cumplida) si el clan existe y está dentro del umbral.
        case 'clanTopRank':      return clan.rank > 0 && clan.rank <= def.progresoTotal ? def.progresoTotal : 0;
        default:                 return 0;
      }
    };

    const recienCompletadas: string[] = [];
    const writes: Promise<unknown>[] = [];

    const badges = BADGE_CATALOG.map((def) => {
      const ub = byId.get(def.id);
      const yaCompletada = ub?.completada ?? false;
      const prevProgreso = ub?.progresoActual ?? 0;

      // Una insignia completada nunca se revierte.
      const progresoActual = yaCompletada
        ? def.progresoTotal
        : Math.min(progresoDe(def), def.progresoTotal);
      const completada = yaCompletada || progresoActual >= def.progresoTotal;
      const nuevaCompletada = completada && !yaCompletada;
      const fechaCompletada = completada ? (ub?.fechaCompletada ?? new Date()) : null;

      // Solo escribir si algo cambió (prevProgreso=0 para las recién creadas).
      if (!yaCompletada && (progresoActual !== prevProgreso || nuevaCompletada)) {
        writes.push(
          this.prisma.userBadge.update({
            where: { userId_badgeId: { userId, badgeId: def.id } },
            data: {
              progresoActual,
              completada,
              ...(nuevaCompletada ? { fechaCompletada } : {}),
            },
          }),
        );
      }
      if (nuevaCompletada) recienCompletadas.push(def.id);

      return {
        id: def.id,
        nombre: def.nombre,
        descripcion: def.descripcion,
        categoria: def.categoria,
        requiredPlan: def.requiredPlan,
        progresoActual,
        progresoTotal: def.progresoTotal,
        completada,
        fechaCompletada,
      };
    });

    if (writes.length > 0) await Promise.all(writes);
    return { badges, recienCompletadas };
  }

  async verificarInsignias(userId: number): Promise<string[]> {
    const { recienCompletadas } = await this.recompute(userId);
    return recienCompletadas;
  }

  async getUserBadges(userId: number) {
    await this.initUserBadges(userId);
    const badges = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    });
    const byId = new Map(badges.map((b) => [b.badgeId, b]));
    // Devolver en el orden del catálogo (categorías agrupadas), con metadata de plan.
    return BADGE_CATALOG.map((def) => {
      const ub = byId.get(def.id);
      return {
        id: def.id,
        nombre: def.nombre,
        descripcion: def.descripcion,
        categoria: def.categoria,
        requiredPlan: def.requiredPlan,
        progresoActual: ub?.progresoActual ?? 0,
        progresoTotal: def.progresoTotal,
        completada: ub?.completada ?? false,
        fechaCompletada: ub?.fechaCompletada ?? null,
      };
    });
  }

  // Recalcula y devuelve todas las insignias (para el perfil / página de logros). Reusa el
  // mismo lote que verificarInsignias → una sola pasada a la DB (antes hacía recompute + 2
  // findMany extra de getUserBadges).
  async getAllForUser(userId: number) {
    const { badges } = await this.recompute(userId);
    return badges;
  }
}
