import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COOKING_LEVEL_THRESHOLDS, COOKING_LEVELS_ORDER } from '../common/xp';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  calcularNivel(xp: number): number {
    if (xp <= 0) return 1;
    for (let n = 100; n >= 2; n--) {
      if (xp >= Math.round(100 * Math.pow(n - 1, 1.8))) return n;
    }
    return 1;
  }

  xpParaSiguienteNivel(nivel: number): number {
    return Math.round(100 * Math.pow(nivel, 1.8));
  }

  // XP del nivel actual (umbral de entrada) → para la barra de progreso del perfil.
  xpDelNivelActual(nivel: number): number {
    return nivel <= 1 ? 0 : Math.round(100 * Math.pow(nivel - 1, 1.8));
  }

  // cookingLevel derivado del nivel (solo sube). 'advanced' es el tope.
  private cookingLevelParaNivel(nivel: number): string {
    if (nivel >= COOKING_LEVEL_THRESHOLDS.advanced) return 'advanced';
    if (nivel >= COOKING_LEVEL_THRESHOLDS.intermediate) return 'intermediate';
    return 'beginner';
  }

  // =========================
  // ⭐ OTORGAR XP (función central de progresión)
  // Suma XP, recalcula el nivel y auto-promueve el cookingLevel (solo hacia arriba,
  // nunca baja; respeta un 'advanced' ya elegido). La usan TODAS las fuentes de XP
  // (cursos, lecciones, misiones, misiones de clan, recetas cocinadas, duelos).
  // =========================
  async awardXp(
    userId: number,
    amount: number,
  ): Promise<{ xpTotal: number; nivel: number; leveledUp: boolean; cookingLevel: string }> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { xpTotal: true, nivel: true, cookingLevel: true },
    });
    if (!current) return { xpTotal: 0, nivel: 1, leveledUp: false, cookingLevel: 'beginner' };
    if (!amount || amount <= 0) {
      return {
        xpTotal: current.xpTotal,
        nivel: current.nivel,
        leveledUp: false,
        cookingLevel: current.cookingLevel ?? 'beginner',
      };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { xpTotal: { increment: amount } },
      select: { xpTotal: true, nivel: true, cookingLevel: true },
    });

    const nuevoNivel = this.calcularNivel(updated.xpTotal);
    const leveledUp = nuevoNivel > updated.nivel;

    // cookingLevel: max(actual, derivado del nivel) → nunca baja.
    const actual = updated.cookingLevel ?? 'beginner';
    const derivado = this.cookingLevelParaNivel(nuevoNivel);
    const actualRank = COOKING_LEVELS_ORDER.indexOf(actual as any);
    const derivadoRank = COOKING_LEVELS_ORDER.indexOf(derivado as any);
    const nuevoCookingLevel = COOKING_LEVELS_ORDER[Math.max(actualRank, derivadoRank)] ?? actual;

    const data: { nivel?: number; cookingLevel?: string } = {};
    if (leveledUp) data.nivel = nuevoNivel;
    if (nuevoCookingLevel !== actual) data.cookingLevel = nuevoCookingLevel;
    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
    }

    return { xpTotal: updated.xpTotal, nivel: nuevoNivel, leveledUp, cookingLevel: nuevoCookingLevel };
  }

  async actualizarStatsPostCurso(
    userId: number,
    course: { strArea: string; strCategory: string; lecciones: any[] },
    xpGanado: number,
  ) {
    const stats = await this.prisma.userStats.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const tecnicasDominadas = (stats.tecnicasDominadas as string[]) ?? [];
    const cocinasExploradas = (stats.cocinasExploradas as string[]) ?? [];
    const categoriasDominadas = (stats.categoriasDominadas as string[]) ?? [];
    const xpPorArea = (stats.xpPorArea as Record<string, number>) ?? {};

    const nuevasTecnicas: string[] = course.lecciones.map((l: any) => l.tecnica).filter(Boolean);
    xpPorArea[course.strArea] = (xpPorArea[course.strArea] ?? 0) + xpGanado;

    await this.prisma.$transaction([
      this.prisma.userStats.update({
        where: { userId },
        data: {
          tecnicasDominadas: [...new Set([...tecnicasDominadas, ...nuevasTecnicas])],
          cocinasExploradas: [...new Set([...cocinasExploradas, course.strArea])],
          categoriasDominadas: [...new Set([...categoriasDominadas, course.strCategory])],
          xpPorArea,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          coursesCompleted: { increment: 1 },
          lessonsCompleted: { increment: 5 },
        },
      }),
    ]);

    // XP + nivel + cookingLevel por la función central.
    const { xpTotal, nivel, leveledUp } = await this.awardXp(userId, xpGanado);
    return { xpGanado, nuevoNivel: nivel, subioDeNivel: leveledUp, xpTotal };
  }

  async getStats(userId: number) {
    const [user, stats] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userStats.findUnique({ where: { userId } }),
    ]);

    const xpTotal = user?.xpTotal ?? 0;
    const nivel = user?.nivel ?? 1;

    return {
      nivel,
      xpTotal,
      xpParaSiguienteNivel: this.xpParaSiguienteNivel(nivel),
      cursosCompletados: user?.coursesCompleted ?? 0,
      leccionesCompletadas: user?.lessonsCompleted ?? 0,
      rachaActual: user?.cookingStreak ?? 0,
      tecnicasDominadas: (stats?.tecnicasDominadas as string[]) ?? [],
      categoriasDominadas: (stats?.categoriasDominadas as string[]) ?? [],
      ingredientesUsados: (stats?.ingredientesUsados as string[]) ?? [],
    };
  }
}
