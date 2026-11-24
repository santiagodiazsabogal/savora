import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isChef, isPaid } from '../common/plans';

// Tope DIARIO de llamadas de IA por usuario (anti-runaway/abuso de costos OpenAI).
// Comparte el contador `User.aiUsageDate`/`aiUsageCount` con recipes.service → un solo
// presupuesto diario por usuario para TODAS las generaciones (recetas, syllabus, feedback).
// Diferencia con recipes: aquí FREE SÍ tiene cap — los cursos son por-uso (syllabus y
// feedback gpt-4o) y sin esto un FREE podía generar sin límite. El chat (chef/lección)
// NO cuenta (regla de producto: el chat no consume), se protege con throttling.
const DAILY_AI_CAP_FREE = 25;
const DAILY_AI_CAP_PRO = 40;
const DAILY_AI_CAP_CHEF = 100;

export type AiUser = {
  id: number;
  plan: string | null;
  aiUsageDate: Date | null;
  aiUsageCount: number | null;
};

@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  private dayKey(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private capFor(plan: string | null | undefined): number {
    if (isChef(plan ?? 'FREE')) return DAILY_AI_CAP_CHEF;
    if (isPaid(plan ?? 'FREE')) return DAILY_AI_CAP_PRO;
    return DAILY_AI_CAP_FREE;
  }

  // Lanza 429 DAILY_LIMIT_REACHED si el usuario agotó su cupo de hoy.
  // Acepta el user ya cargado (evita un round-trip) o el userId; devuelve el user
  // para poder hacer bump después sin re-consultar.
  async assertDailyAiLimit(userOrId: AiUser | number): Promise<AiUser | null> {
    const user =
      typeof userOrId === 'number'
        ? await this.prisma.user.findUnique({
            where: { id: userOrId },
            select: { id: true, plan: true, aiUsageDate: true, aiUsageCount: true },
          })
        : userOrId;
    if (!user) return null; // deja que el flujo principal falle con su propio 404

    const cap = this.capFor(user.plan);
    const sameDay = !!user.aiUsageDate && this.dayKey(user.aiUsageDate) === this.dayKey(new Date());
    const used = sameDay ? (user.aiUsageCount ?? 0) : 0;
    if (used >= cap) throw new HttpException('DAILY_LIMIT_REACHED', 429);
    return user;
  }

  // Suma 1 al cupo de hoy tras una llamada exitosa (resetea el contador si cambió el día).
  async bumpDailyAiUsage(user: AiUser | null): Promise<void> {
    if (!user) return;
    const sameDay = !!user.aiUsageDate && this.dayKey(user.aiUsageDate) === this.dayKey(new Date());
    const used = sameDay ? (user.aiUsageCount ?? 0) : 0;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { aiUsageCount: used + 1, aiUsageDate: new Date() },
    });
  }
}
