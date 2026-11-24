import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Misiones de cursos PERSONALES (módulo missions). Antes eran DIARIAS y generadas por GPT,
// lo que producía metas absurdas ("5 cursos en un día"). Como los cursos son CHEF-only y de
// bajo uso, ahora son SEMANALES, curadas (sin GPT) y con metas realistas. Se asignan 3 por
// semana (1 fácil, 1 media, 1 difícil), distintas entre sí y sin repetir las de la semana
// pasada. El progreso se mide por lo hecho EN LA SEMANA (ver courses-ai.service).
interface CourseMissionTemplate {
  key: string;
  dificultad: 'facil' | 'media' | 'dificil';
  titulo: string;
  descripcion: string;
  xp: number;
  condicion: { tipo: string; cantidad: number; categoria?: string };
}

const COURSE_MISSION_POOL: CourseMissionTemplate[] = [
  // ── Fáciles (1-3 lecciones) ───────────────────────────────────────────────
  { key: 'primer_paso', dificultad: 'facil', titulo: 'Primer paso', descripcion: 'Completa 1 lección esta semana.', xp: 60, condicion: { tipo: 'completar_leccion', cantidad: 1 } },
  { key: 'calentando', dificultad: 'facil', titulo: 'Calentando', descripcion: 'Completa 2 lecciones esta semana.', xp: 90, condicion: { tipo: 'completar_leccion', cantidad: 2 } },
  { key: 'constancia', dificultad: 'facil', titulo: 'Constancia', descripcion: 'Completa 3 lecciones esta semana.', xp: 120, condicion: { tipo: 'completar_leccion', cantidad: 3 } },
  // ── Medias (5-7 lecciones o 1 curso) ──────────────────────────────────────
  { key: 'en_ritmo', dificultad: 'media', titulo: 'En ritmo', descripcion: 'Completa 5 lecciones esta semana.', xp: 200, condicion: { tipo: 'completar_leccion', cantidad: 5 } },
  { key: 'primer_curso', dificultad: 'media', titulo: 'Primer curso', descripcion: 'Completa 1 curso completo esta semana.', xp: 240, condicion: { tipo: 'completar_curso', cantidad: 1 } },
  { key: 'dedicacion', dificultad: 'media', titulo: 'Dedicación', descripcion: 'Completa 7 lecciones esta semana.', xp: 260, condicion: { tipo: 'completar_leccion', cantidad: 7 } },
  // ── Difíciles (retadoras pero alcanzables en 7 días) ──────────────────────
  { key: 'doble_curso', dificultad: 'dificil', titulo: 'Doble curso', descripcion: 'Completa 2 cursos completos esta semana.', xp: 400, condicion: { tipo: 'completar_curso', cantidad: 2 } },
  { key: 'maraton', dificultad: 'dificil', titulo: 'Maratón de cocina', descripcion: 'Completa 12 lecciones esta semana.', xp: 440, condicion: { tipo: 'completar_leccion', cantidad: 12 } },
  { key: 'imparable', dificultad: 'dificil', titulo: 'Imparable', descripcion: 'Completa 15 lecciones esta semana.', xp: 500, condicion: { tipo: 'completar_leccion', cantidad: 15 } },
];

@Injectable()
export class MissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Lunes 00:00 UTC de la semana actual (clave de las misiones semanales).
  private weekStartUTC(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const dow = d.getUTCDay(); // 0=domingo..6=sábado
    d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
    return d;
  }

  // Hash determinista simple (para elegir misión estable por usuario+semana).
  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  // Mantiene el nombre por compatibilidad con el controller/front, pero ahora devuelve
  // las misiones SEMANALES del usuario (las crea si faltan).
  async getTodayMissions(userId: number) {
    const weekStart = this.weekStartUTC();

    const existing = await this.prisma.userMission.findMany({
      where: { userId, expirada: false, asignadaEn: { gte: weekStart } },
      include: { mission: true },
    });
    if (existing.length >= 3) return this.formatMissions(existing);

    await this.ensureWeeklyPool(weekStart);

    // Keys de la semana pasada (de este usuario) para no repetir entre semanas.
    const prevWeek = new Date(weekStart.getTime() - 7 * 86400000);
    const lastWeek = await this.prisma.userMission.findMany({
      where: { userId, asignadaEn: { gte: prevWeek, lt: weekStart } },
      include: { mission: true },
    });
    const excludeKeys = new Set<string>();
    for (const um of lastWeek) {
      const k = (um.mission.condicion as any)?.key;
      if (typeof k === 'string') excludeKeys.add(k);
    }

    const alreadyAssigned = new Set(existing.map((e) => e.missionId));
    const weekKey = weekStart.toISOString().slice(0, 10);
    const pool = await this.prisma.missionPool.findMany({ where: { fecha: weekStart } });

    const keyOf = (m: any) => (m.condicion as any)?.key as string | undefined;
    const pickForDif = (dif: string) => {
      const all = pool.filter((m) => m.dificultad === dif && !alreadyAssigned.has(m.id));
      const fresh = all.filter((m) => !excludeKeys.has(keyOf(m) ?? ''));
      const candidates = fresh.length > 0 ? fresh : all;
      if (candidates.length === 0) return null;
      const chosen = candidates[this.hash(userId + weekKey + dif) % candidates.length];
      alreadyAssigned.add(chosen.id);
      return chosen;
    };

    const picked = ['facil', 'media', 'dificil']
      .map(pickForDif)
      .filter((m): m is NonNullable<typeof m> => m !== null);
    const missionIds = picked.map((m) => m.id);

    if (missionIds.length > 0) {
      await this.prisma.userMission.createMany({
        data: missionIds.map((missionId) => ({ userId, missionId })),
        skipDuplicates: true,
      });
    }

    const assigned = await this.prisma.userMission.findMany({
      where: { userId, missionId: { in: missionIds } },
      include: { mission: true },
    });
    return this.formatMissions(assigned);
  }

  private formatMissions(userMissions: any[]) {
    return userMissions.map((um) => ({
      id: um.id,
      dificultad: um.mission.dificultad,
      titulo: um.mission.titulo,
      descripcion: um.mission.descripcion,
      xpRecompensa: um.mission.xpRecompensa,
      condicion: um.mission.condicion,
      completada: um.completada,
      completadaEn: um.completadaEn,
    }));
  }

  // Crea (si faltan) las plantillas curadas de la semana en el pool compartido.
  // El índice único (fecha, titulo) + skipDuplicates evita duplicados por carrera.
  private async ensureWeeklyPool(weekStart: Date) {
    const existing = await this.prisma.missionPool.count({ where: { fecha: weekStart } });
    if (existing >= COURSE_MISSION_POOL.length) return;
    await this.prisma.missionPool.createMany({
      data: COURSE_MISSION_POOL.map((t) => ({
        fecha: weekStart,
        dificultad: t.dificultad,
        titulo: t.titulo,
        descripcion: t.descripcion,
        xpRecompensa: t.xp,
        condicion: { ...t.condicion, key: t.key },
        nivelMinimo: 1,
        nivelMaximo: 100,
      })),
      skipDuplicates: true,
    });
  }
}
