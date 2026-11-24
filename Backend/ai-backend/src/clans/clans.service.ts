import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ClansGateway } from './clans.gateway';
import { OpenaiService } from '../ai/openai.service';
import { StatsService } from '../stats/stats.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

// Includes estándar para formatear un mensaje del chat con autor, reacciones y cita.
const MESSAGE_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  reacciones: { select: { emoji: true, userId: true } },
  replyTo: {
    select: {
      id: true,
      contenido: true,
      imagenUrl: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

const USER_SELECT = { select: { id: true, name: true, email: true, nivel: true, username: true } };

// Tope de integrantes por clan.
const MAX_CLAN_MEMBERS = 20;

// Plantillas de misiones de clan SEMANALES (progreso colectivo de todo el clan en la
// semana). Metas realistas para 7 días: lecciones hasta ~70, cursos hasta 4 (un curso son
// 5 lecciones + foto, así que pocos cursos por semana). Cada plantilla tiene una `key`
// estable que se usa para no repetir misiones entre semanas.
type MissionTipo = 'completar_leccion' | 'completar_curso';
type MissionDificultad = 'facil' | 'media' | 'dificil';
interface MissionTemplate {
  key: string;
  tipo: MissionTipo;
  dificultad: MissionDificultad;
  meta: number;
  xp: number;
  titulo: string;
  descripcion: string;
}
const CLAN_MISSION_POOL: MissionTemplate[] = [
  // ── Easy ─────────────────────────────────────────────────────────────────
  { key: 'calentando', tipo: 'completar_leccion', dificultad: 'facil', meta: 8, xp: 100, titulo: 'Warming up', descripcion: 'Complete 8 lessons together this week.' },
  { key: 'manos_masa', tipo: 'completar_leccion', dificultad: 'facil', meta: 12, xp: 140, titulo: 'Hands on', descripcion: 'The clan must complete 12 lessons this week.' },
  { key: 'primer_plato', tipo: 'completar_curso', dificultad: 'facil', meta: 1, xp: 160, titulo: 'First dish', descripcion: 'Complete 1 course together this week.' },
  { key: 'en_marcha', tipo: 'completar_leccion', dificultad: 'facil', meta: 6, xp: 90, titulo: 'Getting started', descripcion: 'Complete 6 collective lessons this week.' },
  // ── Medium ───────────────────────────────────────────────────────────────
  { key: 'coordinada', tipo: 'completar_leccion', dificultad: 'media', meta: 20, xp: 240, titulo: 'Coordinated kitchen', descripcion: 'The clan must complete 20 lessons this week.' },
  { key: 'en_equipo', tipo: 'completar_curso', dificultad: 'media', meta: 2, xp: 300, titulo: 'Teamwork', descripcion: 'Complete 2 courses together this week.' },
  { key: 'ritmo_brigada', tipo: 'completar_leccion', dificultad: 'media', meta: 28, xp: 320, titulo: 'Brigade rhythm', descripcion: 'Complete 28 collective lessons this week.' },
  { key: 'doble_jornada', tipo: 'completar_curso', dificultad: 'media', meta: 3, xp: 420, titulo: 'Double shift', descripcion: 'The clan must complete 3 courses this week.' },
  // ── Hard (challenging but reachable in 7 days) ────────────────────────────
  { key: 'maraton', tipo: 'completar_leccion', dificultad: 'dificil', meta: 40, xp: 520, titulo: 'Culinary marathon', descripcion: 'Complete 40 lessons together this week.' },
  { key: 'brigada_completa', tipo: 'completar_curso', dificultad: 'dificil', meta: 4, xp: 620, titulo: 'Full brigade', descripcion: 'The clan must complete 4 courses this week.' },
  { key: 'semana_imparable', tipo: 'completar_leccion', dificultad: 'dificil', meta: 55, xp: 700, titulo: 'Unstoppable week', descripcion: 'Complete 55 collective lessons this week.' },
  { key: 'gran_festin', tipo: 'completar_leccion', dificultad: 'dificil', meta: 70, xp: 820, titulo: 'Grand feast', descripcion: 'Complete 70 lessons together this week.' },
];

// Cuántas misiones por dificultad se eligen cada semana (total 5).
const WEEKLY_MISSION_MIX: Array<[MissionDificultad, number]> = [
  ['facil', 2], ['media', 2], ['dificil', 1],
];

interface CreateClanDto {
  nombre: string;
  descripcion?: string;
  tipoAcceso?: string;
  especializacion?: string | null;
  avatarUrl?: string | null;
}
type UpdateClanDto = Partial<CreateClanDto>;

@Injectable()
export class ClansService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ClansGateway)) private readonly gateway: ClansGateway,
    private readonly openai: OpenaiService,
    private readonly statsService: StatsService,
    private readonly storage: SupabaseStorageService,
  ) {}

  // ── Moderación de nombre/descripción de clan ──────────────────────────────
  // Insultos/slurs claramente ofensivos (ES/EN). Se comparan por token normalizado
  // (sin acentos, leet básico) para evitar falsos positivos con palabras normales.
  private static readonly BANNED_WORDS = new Set([
    // ES
    'puta', 'puto', 'putas', 'putos', 'mierda', 'mierdas', 'cabron', 'cabrones', 'cabrona',
    'pendejo', 'pendeja', 'pendejos', 'gilipollas', 'joder', 'polla', 'verga', 'vergas',
    'chinga', 'chingada', 'chingar', 'pinche', 'marica', 'maricon', 'maricones', 'zorra', 'zorras',
    'perra', 'culero', 'huevon', 'malparido', 'gonorrea', 'careverga', 'hijueputa', 'hijoeputa',
    'malnacido', 'conchatumadre', 'mamahuevo', 'mamaguevo', 'culiao', 'culiado',
    // EN
    'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'dickhead',
    'cunt', 'slut', 'whore', 'motherfucker', 'nigger', 'nigga', 'faggot', 'fag', 'retard',
    'pussy', 'cock', 'wanker', 'twat',
  ]);

  // Slurs largos e inequívocos: se detectan aunque vayan pegados sin separador.
  private static readonly BANNED_SUBSTRINGS = [
    'hijueputa', 'hijoeputa', 'conchatumadre', 'malparido', 'gilipollas', 'motherfucker',
    'mamahuevo', 'mamaguevo', 'careverga', 'gonorrea', 'pendejo', 'maricon',
  ];

  private normalizeForModeration(text: string): string {
    return (text ?? '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e')
      .replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
  }

  // true si el texto tiene lenguaje claramente ofensivo (wordlist) o la IA lo marca.
  private async isOffensiveText(text: string): Promise<boolean> {
    const norm = this.normalizeForModeration(text);
    const tokens = norm.split(/[^a-z]+/).filter(Boolean);
    if (tokens.some((tk) => ClansService.BANNED_WORDS.has(tk))) return true;
    const compact = tokens.join('');
    if (ClansService.BANNED_SUBSTRINGS.some((w) => compact.includes(w))) return true;
    // Capa IA (odio/acoso/sexual). moderateText es fail-open ante error de la API.
    const mod = await this.openai.moderateText(text);
    return mod.flagged;
  }

  // ── Consultas ────────────────────────────────────────────────────────────
  async browse(userId: number, search?: string) {
    const where = search?.trim()
      ? { nombre: { contains: search.trim(), mode: 'insensitive' as const } }
      : {};
    // Ranking: solo el Top 15. Al buscar por nombre devolvemos más coincidencias.
    const clans = await this.prisma.clan.findMany({
      where,
      orderBy: [{ xpColectivoSemanal: 'desc' }, { xpColectivoTotal: 'desc' }],
      include: { _count: { select: { miembros: true } } },
      take: search?.trim() ? 50 : 15,
    });
    const miClanId = await this.getMyClanId(userId);
    return clans.map((c, i) => ({
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      tipoAcceso: c.tipoAcceso,
      especializacion: c.especializacion,
      avatarUrl: c.avatarUrl,
      xpColectivoSemanal: c.xpColectivoSemanal,
      xpColectivoTotal: c.xpColectivoTotal,
      miembros: c._count.miembros,
      ranking: i + 1,
      esMiembro: miClanId === c.id,
    }));
  }

  async getMine(userId: number) {
    const id = await this.getMyClanId(userId);
    if (!id) return null;
    const clan = await this.prisma.clan.findUnique({
      where: { id },
      include: { _count: { select: { miembros: true } } },
    });
    if (!clan) return null;
    const porEncima = await this.prisma.clan.count({
      where: { xpColectivoSemanal: { gt: clan.xpColectivoSemanal } },
    });
    return {
      id: clan.id,
      nombre: clan.nombre,
      descripcion: clan.descripcion,
      tipoAcceso: clan.tipoAcceso,
      especializacion: clan.especializacion,
      avatarUrl: clan.avatarUrl,
      xpColectivoSemanal: clan.xpColectivoSemanal,
      xpColectivoTotal: clan.xpColectivoTotal,
      miembros: clan._count.miembros,
      ranking: porEncima + 1,
      esMiembro: true,
    };
  }

  async getDetail(userId: number, clanId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: {
        miembros: {
          orderBy: { xpAportadoSemana: 'desc' },
          select: {
            userId: true,
            rol: true,
            xpAportadoSemana: true,
            fechaIngreso: true,
            user: USER_SELECT,
          },
        },
      },
    });
    if (!clan) throw new NotFoundException('Clan not found');

    const me = clan.miembros.find((m) => m.userId === userId) ?? null;
    const esGestor = me?.rol === 'lider' || me?.rol === 'co_lider';

    // Ranking semanal (cuántos clanes tienen más XP esta semana).
    const porEncima = await this.prisma.clan.count({
      where: { xpColectivoSemanal: { gt: clan.xpColectivoSemanal } },
    });

    // Solicitudes pendientes (solo para gestores).
    let solicitudes: any[] = [];
    if (esGestor) {
      const reqs = await this.prisma.clanRequest.findMany({
        where: { clanId, estado: 'pendiente' },
        include: { user: USER_SELECT },
        orderBy: { creadoEn: 'asc' },
      });
      solicitudes = reqs.map((r) => ({
        id: r.id,
        userId: r.userId,
        nombre: r.user.name,
        email: r.user.email,
        nivel: r.user.nivel,
        creadoEn: r.creadoEn,
      }));
    }

    return {
      id: clan.id,
      nombre: clan.nombre,
      descripcion: clan.descripcion,
      tipoAcceso: clan.tipoAcceso,
      especializacion: clan.especializacion,
      avatarUrl: clan.avatarUrl,
      xpColectivoSemanal: clan.xpColectivoSemanal,
      xpColectivoTotal: clan.xpColectivoTotal,
      ranking: porEncima + 1,
      miRol: me?.rol ?? null,
      esMiembro: !!me,
      miembros: clan.miembros.map((m) => ({
        userId: m.userId,
        rol: m.rol,
        xpAportadoSemana: m.xpAportadoSemana,
        nombre: m.user.name,
        email: m.user.email,
        nivel: m.user.nivel,
        username: m.user.username,
      })),
      solicitudes,
    };
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  async create(userId: number, dto: CreateClanDto) {
    const existing = await this.getMyClanId(userId);
    if (existing) throw new ConflictException('You already belong to a clan');
    const nombre = dto.nombre?.trim();
    if (!nombre || nombre.length < 3) throw new BadRequestException('The name must be at least 3 characters long');
    if (await this.isOffensiveText(nombre)) throw new BadRequestException('CLAN_NAME_OFFENSIVE');

    const descripcion = dto.descripcion?.trim() ?? '';
    if (descripcion && await this.isOffensiveText(descripcion)) throw new BadRequestException('CLAN_DESC_OFFENSIVE');

    const tipoAcceso = dto.tipoAcceso === 'cerrado' ? 'cerrado' : 'abierto';
    try {
      const clan = await this.prisma.clan.create({
        data: {
          nombre,
          descripcion,
          tipoAcceso,
          especializacion: dto.especializacion || null,
          avatarUrl: dto.avatarUrl || null,
          creadoPor: userId,
          miembros: { create: { userId, rol: 'lider' } },
        },
      });
      return this.getDetail(userId, clan.id);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('A clan with that name already exists');
      throw e;
    }
  }

  async update(userId: number, clanId: string, dto: UpdateClanDto) {
    await this.requireManager(userId, clanId);
    const data: any = {};
    if (dto.descripcion !== undefined) {
      const d = dto.descripcion.trim();
      if (d && await this.isOffensiveText(d)) throw new BadRequestException('CLAN_DESC_OFFENSIVE');
      data.descripcion = d;
    }
    if (dto.tipoAcceso !== undefined) data.tipoAcceso = dto.tipoAcceso === 'cerrado' ? 'cerrado' : 'abierto';
    if (dto.especializacion !== undefined) data.especializacion = dto.especializacion || null;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;
    await this.prisma.clan.update({ where: { id: clanId }, data });
    return this.getDetail(userId, clanId);
  }

  async join(userId: number, clanId: string) {
    const existing = await this.getMyClanId(userId);
    if (existing) throw new ConflictException('You already belong to a clan');
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException('Clan not found');

    if (clan.tipoAcceso === 'abierto') {
      await this.assertNotFull(clanId);
      await this.prisma.clanMember.create({ data: { clanId, userId, rol: 'miembro' } });
      await this.postSystem(clanId, `👋 ${await this.getUserName(userId)} joined the clan`);
      return { joined: true };
    }
    await this.prisma.clanRequest.upsert({
      where: { clanId_userId: { clanId, userId } },
      create: { clanId, userId, estado: 'pendiente' },
      update: { estado: 'pendiente', creadoEn: new Date() },
    });
    return { requested: true };
  }

  async leave(userId: number, clanId: string) {
    const me = await this.getMember(clanId, userId);
    if (!me) throw new NotFoundException('You are not a member of this clan');

    const nombre = await this.getUserName(userId);
    await this.prisma.clanMember.delete({ where: { clanId_userId: { clanId, userId } } });

    if (me.rol === 'lider') {
      // Sucesión: primero un co-líder, si no el miembro más antiguo; si no queda nadie, disolver.
      const colider = await this.prisma.clanMember.findFirst({
        where: { clanId, rol: 'co_lider' },
        orderBy: { fechaIngreso: 'asc' },
      });
      const heredero = colider ?? (await this.prisma.clanMember.findFirst({
        where: { clanId },
        orderBy: { fechaIngreso: 'asc' },
      }));
      if (heredero) {
        await this.prisma.clanMember.update({
          where: { clanId_userId: { clanId, userId: heredero.userId } },
          data: { rol: 'lider' },
        });
        const nuevoLider = await this.getUserName(heredero.userId);
        await this.postSystem(clanId, `👋 ${nombre} left the clan. ${nuevoLider} is the new leader 👑`);
      } else {
        await this.prisma.clan.delete({ where: { id: clanId } });
        return { left: true, disuelto: true };
      }
    } else {
      await this.postSystem(clanId, `👋 ${nombre} left the clan`);
    }
    return { left: true };
  }

  async acceptRequest(userId: number, requestId: string) {
    const req = await this.prisma.clanRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    await this.requireManager(userId, req.clanId);

    const yaEnClan = await this.getMyClanId(req.userId);
    if (yaEnClan) {
      await this.prisma.clanRequest.update({ where: { id: requestId }, data: { estado: 'rechazada' } });
      throw new ConflictException('The user already belongs to a clan');
    }
    // La solicitud queda pendiente si el clan está lleno (se puede aceptar si se libera un lugar).
    await this.assertNotFull(req.clanId);
    await this.prisma.$transaction([
      this.prisma.clanMember.create({ data: { clanId: req.clanId, userId: req.userId, rol: 'miembro' } }),
      this.prisma.clanRequest.update({ where: { id: requestId }, data: { estado: 'aceptada' } }),
    ]);
    await this.postSystem(req.clanId, `👋 ${await this.getUserName(req.userId)} joined the clan`);
    return { accepted: true };
  }

  async rejectRequest(userId: number, requestId: string) {
    const req = await this.prisma.clanRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    await this.requireManager(userId, req.clanId);
    await this.prisma.clanRequest.update({ where: { id: requestId }, data: { estado: 'rechazada' } });
    return { rejected: true };
  }

  async setRole(actorId: number, clanId: string, targetUserId: number, rol: string) {
    const actor = await this.getMember(clanId, actorId);
    if (!actor || actor.rol !== 'lider') throw new ForbiddenException('Only the leader can change roles');
    if (targetUserId === actorId) throw new BadRequestException('You cannot change your own role');
    if (!['co_lider', 'miembro'].includes(rol)) throw new BadRequestException('Invalid role');
    const target = await this.getMember(clanId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    await this.prisma.clanMember.update({
      where: { clanId_userId: { clanId, userId: targetUserId } },
      data: { rol },
    });
    return { ok: true };
  }

  async kick(actorId: number, clanId: string, targetUserId: number) {
    const actor = await this.getMember(clanId, actorId);
    if (!actor || (actor.rol !== 'lider' && actor.rol !== 'co_lider')) {
      throw new ForbiddenException('No permission');
    }
    if (targetUserId === actorId) throw new BadRequestException('Use "leave clan" instead');
    const target = await this.getMember(clanId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.rol === 'lider') throw new ForbiddenException('You cannot kick the leader');
    if (actor.rol === 'co_lider' && target.rol === 'co_lider') {
      throw new ForbiddenException('A co-leader cannot kick another co-leader');
    }
    await this.prisma.clanMember.delete({ where: { clanId_userId: { clanId, userId: targetUserId } } });
    return { ok: true };
  }

  // ── Chat del clan ───────────────────────────────────────────────────────
  async getMessages(userId: number, clanId: string) {
    await this.requireMember(userId, clanId);
    const msgs = await this.prisma.clanMessage.findMany({
      where: { clanId },
      orderBy: { enviadoEn: 'desc' },
      take: 50,
      include: MESSAGE_INCLUDE,
    });
    // Devolvemos en orden ascendente (los más antiguos primero) para pintar el chat.
    return msgs.reverse().map((m) => this.formatMessage(m));
  }

  async sendMessage(
    userId: number,
    clanId: string,
    contenido: string,
    opts?: { imagenUrl?: string | null; replyToId?: string | null; clientId?: string | null; nombre?: string | null },
  ) {
    await this.requireMember(userId, clanId);
    const texto = (contenido ?? '').trim();
    const rawImagen = opts?.imagenUrl?.trim() || null;
    if (!texto && !rawImagen) throw new BadRequestException('The message cannot be empty');
    if (texto.length > 500) throw new BadRequestException('Message too long');
    if (rawImagen && rawImagen.length > 5_000_000) throw new BadRequestException('Image too large');
    // Solo data-URLs del cliente (nada de hotlinks externos arbitrarios).
    if (rawImagen && !rawImagen.startsWith('data:image/')) throw new BadRequestException('Invalid image');

    // Moderación de texto, subida+moderación de imagen y validación de la cita son
    // independientes entre sí → se lanzan en PARALELO en vez de esperarlas una por una.
    // La imagen va a Supabase Storage (la DB guarda SOLO la URL): antes el data-URL
    // (hasta 5MB) vivía en la fila y cada getMessages arrastraba megas por el pooler.
    const [textMod, imageResult, replyParent] = await Promise.all([
      texto ? this.openai.moderateText(texto) : Promise.resolve(null),
      rawImagen ? this.uploadAndModerateImage(clanId, userId, rawImagen) : Promise.resolve(null),
      opts?.replyToId
        ? this.prisma.clanMessage.findUnique({ where: { id: opts.replyToId }, select: { clanId: true } })
        : Promise.resolve(null),
    ]);

    if (textMod?.flagged) throw new BadRequestException('INAPPROPRIATE_MESSAGE');
    if (imageResult?.flagged) throw new BadRequestException('INAPPROPRIATE_IMAGE'); // ya borrada del bucket
    const imagenUrl = imageResult?.url ?? null;
    // La cita (si hay) debe pertenecer al mismo clan.
    const replyToId = replyParent && replyParent.clanId === clanId ? opts!.replyToId! : null;

    // Marca de actividad: fire-and-forget para no bloquear el envío del mensaje.
    void this.prisma.clanMember
      .update({ where: { clanId_userId: { clanId, userId } }, data: { ultimaActividad: new Date() } })
      .catch(() => {});

    // Si ya sabemos el nombre del autor (llega cacheado desde socket.data del gateway,
    // fijado una sola vez al conectar), no hace falta el join a User para el mensaje que
    // acabamos de crear; tampoco el de reacciones, que en un mensaje nuevo siempre es [].
    // El fallback REST (sin socket) no manda `nombre` → sigue trayendo todo por include.
    const knowAuthorName = opts?.nombre !== undefined;
    const m = await this.prisma.clanMessage.create({
      data: { clanId, userId, contenido: texto, imagenUrl, replyToId },
      include: knowAuthorName ? { replyTo: MESSAGE_INCLUDE.replyTo } : MESSAGE_INCLUDE,
    });
    const payload = this.formatMessage(m, knowAuthorName ? (opts!.nombre ?? null) : undefined);
    // El clientId viaja en el broadcast para que el autor reemplace su mensaje optimista.
    this.gateway.emitToClan(clanId, 'message:new', { ...payload, clientId: opts?.clientId ?? null });
    return payload;
  }

  // Alterna (toggle) una reacción de emoji sobre un mensaje del chat.
  async toggleReaction(userId: number, clanId: string, messageId: string, emoji: string) {
    await this.requireMember(userId, clanId);
    const msg = await this.prisma.clanMessage.findUnique({
      where: { id: messageId },
      select: { clanId: true },
    });
    if (!msg || msg.clanId !== clanId) throw new NotFoundException('Message not found');
    const clean = emoji.trim().slice(0, 8);
    if (!clean) throw new BadRequestException('Invalid emoji');

    const existing = await this.prisma.clanMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji: clean } },
    });
    if (existing) {
      await this.prisma.clanMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.clanMessageReaction.create({ data: { messageId, userId, emoji: clean } });
    }
    const rows = await this.prisma.clanMessageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    });
    const reacciones = this.buildReactions(rows);
    this.gateway.emitToClan(clanId, 'message:reaction', { messageId, reacciones });
    return { messageId, reacciones };
  }

  // Agrupa filas de reacciones en { emoji, count, userIds[] }.
  private buildReactions(rows: { emoji: string; userId: number }[]) {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const arr = map.get(r.emoji) ?? [];
      arr.push(r.userId);
      map.set(r.emoji, arr);
    }
    return [...map.entries()].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
  }

  // Sube una imagen del chat a Storage y la modera. Si se marca, la borra del bucket y
  // devuelve { flagged:true }; si pasa, devuelve { url, flagged:false }. Se llama dentro
  // del Promise.all de sendMessage para paralelizar con la moderación de texto.
  private async uploadAndModerateImage(
    clanId: string, userId: number, rawImagen: string,
  ): Promise<{ url: string; flagged: boolean }> {
    const url = await this.storage.uploadClanChatImage(clanId, userId, rawImagen);
    const imgMod = await this.openai.moderateImage(url);
    if (imgMod.flagged) {
      await this.storage.deleteImage(url);
      return { url, flagged: true };
    }
    return { url, flagged: false };
  }

  // Da forma uniforme a un mensaje (autor, cita y reacciones) para el cliente.
  // `knownAuthorName`: cuando ya sabemos el nombre del autor (el gateway lo cachea en
  // socket.data al conectar) nos ahorramos el join a User para traerlo de nuevo.
  private formatMessage(m: any, knownAuthorName?: string | null) {
    const nombreDe = (u: any) => (u ? u.name || u.email?.split('@')[0] || 'Someone' : null);
    return {
      id: m.id,
      userId: m.userId,
      nombre: knownAuthorName !== undefined ? knownAuthorName : nombreDe(m.user),
      contenido: m.contenido,
      imagenUrl: m.imagenUrl ?? null,
      esAutomatico: m.esAutomatico,
      enviadoEn: m.enviadoEn,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            nombre: nombreDe(m.replyTo.user),
            contenido: m.replyTo.contenido,
            tieneImagen: !!m.replyTo.imagenUrl,
          }
        : null,
      reacciones: this.buildReactions(m.reacciones ?? []),
    };
  }

  // ── Misiones de clan (progreso colectivo) ──────────────────────────────────
  async getMissions(userId: number, clanId: string) {
    await this.requireMember(userId, clanId);
    await this.ensureClanMissions(clanId);
    const weekStart = this.weekStartUTC();
    const missions = await this.prisma.clanMission.findMany({
      where: { clanId, fecha: weekStart },
      orderBy: { xpRecompensaPorMiembro: 'asc' },
    });
    return missions.map((m) => {
      const cond = m.condicion as any;
      return {
        id: m.id,
        dificultad: m.dificultad,
        titulo: m.titulo,
        descripcion: m.descripcion,
        key: cond?.key ?? null, // para traducir título/descr. en el frontend (app inglés-only)
        tipo: cond?.tipo ?? 'completar_leccion',
        meta: cond?.meta ?? 1,
        progresoActual: m.progresoActual,
        completada: m.completada,
        xpRecompensaPorMiembro: m.xpRecompensaPorMiembro,
      };
    });
  }

  // Genera (si faltan) las 5 misiones SEMANALES del clan para la semana actual.
  // No se repiten dentro de la semana (5 plantillas distintas) ni con la semana
  // anterior (se excluyen sus `key`). El índice único (clanId, fecha, titulo) +
  // skipDuplicates evita duplicados aunque dos miembros abran a la vez.
  private async ensureClanMissions(clanId: string) {
    const weekStart = this.weekStartUTC();
    const existing = await this.prisma.clanMission.count({ where: { clanId, fecha: weekStart } });
    if (existing >= 5) return;

    // Misiones de la semana pasada → excluir sus keys para no repetir entre semanas.
    const prevWeek = new Date(weekStart.getTime() - 7 * 86400000);
    const lastWeek = await this.prisma.clanMission.findMany({
      where: { clanId, fecha: prevWeek }, select: { condicion: true },
    });
    const excludeKeys = new Set<string>();
    for (const lw of lastWeek) {
      const k = (lw.condicion as any)?.key;
      if (typeof k === 'string') excludeKeys.add(k);
    }

    const weekKey = weekStart.toISOString().slice(0, 10);
    const chosen = this.pickWeeklyMissions(clanId, weekKey, excludeKeys);
    const data = chosen.map((tpl) => ({
      clanId,
      fecha: weekStart,
      dificultad: tpl.dificultad,
      titulo: tpl.titulo,
      descripcion: tpl.descripcion,
      xpRecompensaPorMiembro: tpl.xp,
      condicion: { tipo: tpl.tipo, meta: tpl.meta, key: tpl.key },
      progresoActual: 0,
      completada: false,
      expirada: false,
    }));
    await this.prisma.clanMission.createMany({ data, skipDuplicates: true });
  }

  // Elige 5 misiones (2 fáciles, 2 medias, 1 difícil), distintas entre sí y evitando
  // las `key` de la semana anterior. Determinista por (clan, semana) para ser estable.
  private pickWeeklyMissions(clanId: string, weekKey: string, excludeKeys: Set<string>): MissionTemplate[] {
    const chosen: MissionTemplate[] = [];
    for (const [dif, n] of WEEKLY_MISSION_MIX) {
      const all = CLAN_MISSION_POOL.filter((m) => m.dificultad === dif);
      const fresh = all.filter((m) => !excludeKeys.has(m.key));
      // Si excluir la semana pasada deja menos de las necesarias, usamos todo el bucket.
      const pool = fresh.length >= n ? fresh : all;
      const shuffled = this.seededShuffle(pool, this.hash(clanId + weekKey + dif));
      chosen.push(...shuffled.slice(0, n));
    }
    return chosen;
  }

  // Barajado determinista (Fisher–Yates con LCG sembrado) → mismo orden para el mismo seed.
  private seededShuffle<T>(arr: T[], seed: number): T[] {
    const a = [...arr];
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Avanza el progreso colectivo de las misiones del clan del usuario.
  // ⚠️ ATÓMICO a propósito: antes era read-modify-write (leer progresoActual, sumar en
  // JS, escribir) → dos miembros completando a la vez perdían progreso y, si ambos
  // cruzaban la meta, rewardMission corría DOS veces (XP doble a todo el clan).
  async trackMissionProgress(userId: number, tipo: MissionTipo) {
    const m = await this.prisma.clanMember.findFirst({ where: { userId }, select: { clanId: true } });
    if (!m) return;
    const weekStart = this.weekStartUTC();
    const missions = await this.prisma.clanMission.findMany({
      where: { clanId: m.clanId, fecha: weekStart, completada: false, expirada: false },
    });
    for (const mis of missions) {
      const cond = mis.condicion as any;
      if (cond?.tipo !== tipo) continue;
      const meta = cond?.meta ?? 1;
      // Incremento atómico en la DB (solo si sigue abierta; el filtro de arriba puede estar viejo).
      await this.prisma.clanMission.updateMany({
        where: { id: mis.id, completada: false },
        data: { progresoActual: { increment: 1 } },
      });
      // Cierre atómico: de N llamadas concurrentes que alcanzan la meta, SOLO UNA
      // logra el update (completada pasa false→true una vez) y esa reparte el premio.
      const closed = await this.prisma.clanMission.updateMany({
        where: { id: mis.id, completada: false, progresoActual: { gte: meta } },
        data: { completada: true, progresoActual: meta },
      });
      if (closed.count === 1) {
        await this.rewardMission(m.clanId, mis);
      }
    }
  }

  private async rewardMission(clanId: string, mis: any) {
    const members = await this.prisma.clanMember.findMany({ where: { clanId }, select: { userId: true } });
    if (members.length === 0) return;
    const totalClan = mis.xpRecompensaPorMiembro * members.length;
    // XP a cada miembro por la función central (recalcula nivel + cookingLevel).
    // En PARALELO: antes era secuencial → hasta 20 miembros × varias queries = varios
    // segundos bloqueando la respuesta de completar lección/curso. Son usuarios distintos
    // (sin contención de fila); el clan.update de abajo usa increment atómico.
    await Promise.all(
      members.map((mem) => this.statsService.awardXp(mem.userId, mis.xpRecompensaPorMiembro)),
    );
    await this.prisma.clan.update({
      where: { id: clanId },
      data: {
        xpColectivoSemanal: { increment: totalClan },
        xpColectivoTotal: { increment: totalClan },
      },
    });
    await this.postSystem(
      clanId,
      `🏆 Mission completed: ${mis.titulo}! +${mis.xpRecompensaPorMiembro} XP for each member`,
    );
  }

  // Reseteo semanal del ranking: cada lunes a las 00:00 UTC.
  @Cron(CronExpression.EVERY_WEEK)
  async resetWeeklyXp() {
    await this.prisma.$transaction([
      this.prisma.clan.updateMany({ data: { xpColectivoSemanal: 0 } }),
      this.prisma.clanMember.updateMany({ data: { xpAportadoSemana: 0 } }),
    ]);
  }

  // Suma XP del usuario a su clan (se llama al completar un curso).
  async addXp(userId: number, xp: number) {
    if (!xp || xp <= 0) return;
    const m = await this.prisma.clanMember.findFirst({ where: { userId } });
    if (!m) return;
    await this.prisma.$transaction([
      this.prisma.clanMember.update({
        where: { clanId_userId: { clanId: m.clanId, userId } },
        data: { xpAportadoSemana: { increment: xp }, ultimaActividad: new Date() },
      }),
      this.prisma.clan.update({
        where: { id: m.clanId },
        data: { xpColectivoSemanal: { increment: xp }, xpColectivoTotal: { increment: xp } },
      }),
    ]);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async getMyClanId(userId: number): Promise<string | null> {
    const m = await this.prisma.clanMember.findFirst({ where: { userId }, select: { clanId: true } });
    return m?.clanId ?? null;
  }

  private async getMember(clanId: string, userId: number) {
    return this.prisma.clanMember.findUnique({ where: { clanId_userId: { clanId, userId } } });
  }

  // Lanza 'CLAN_FULL' si el clan ya alcanzó el tope de integrantes (MAX_CLAN_MEMBERS).
  private async assertNotFull(clanId: string) {
    const count = await this.prisma.clanMember.count({ where: { clanId } });
    if (count >= MAX_CLAN_MEMBERS) throw new ForbiddenException('CLAN_FULL');
  }

  private async requireManager(userId: number, clanId: string) {
    const m = await this.getMember(clanId, userId);
    if (!m || (m.rol !== 'lider' && m.rol !== 'co_lider')) {
      throw new ForbiddenException('No permission');
    }
    return m;
  }

  private async requireMember(userId: number, clanId: string) {
    const m = await this.getMember(clanId, userId);
    if (!m) throw new ForbiddenException('You are not a member of this clan');
    return m;
  }

  private todayUTC(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  // Lunes 00:00 UTC de la semana actual (clave de las misiones semanales).
  private weekStartUTC(): Date {
    const d = this.todayUTC();
    const dow = d.getUTCDay(); // 0=domingo..6=sábado
    const diff = (dow + 6) % 7; // días desde el lunes
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
  }

  // Hash determinista simple (para elegir misión estable por clan+día).
  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  private async getUserName(userId: number): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return u?.name || u?.email?.split('@')[0] || 'Alguien';
  }

  // Nombre visible del usuario (usado por el gateway al autenticar la conexión).
  async getDisplayName(userId: number): Promise<string> {
    return this.getUserName(userId);
  }

  // ¿El usuario pertenece a este clan? (usado por el gateway para unir a la sala).
  async isMember(userId: number, clanId: string): Promise<boolean> {
    const m = await this.getMember(clanId, userId);
    return !!m;
  }

  // Publica un mensaje automático del sistema en el chat del clan y lo emite.
  private async postSystem(clanId: string, contenido: string) {
    const m = await this.prisma.clanMessage.create({
      data: { clanId, contenido, esAutomatico: true },
      include: MESSAGE_INCLUDE,
    });
    this.gateway.emitToClan(clanId, 'message:new', this.formatMessage(m));
  }
}
