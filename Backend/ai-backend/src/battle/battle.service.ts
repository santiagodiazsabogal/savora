import {
  Injectable, Logger, OnModuleInit,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OpenaiService } from '../ai/openai.service';
import { StatsService } from '../stats/stats.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import {
  BattleMode, BattleCourse, BattleStatus, RecipeData, PlayerPublic, SocketUser,
  BATTLE_MAX_PLAYERS, BATTLE_MIN_PLAYERS, LOBBY_DURATION_MS, COOKING_GRACE_MS,
  FREE_LIMIT, INGREDIENT_MATCH_THRESHOLD, QUICK_START_MS,
  PRIVATE_LOBBY_TTL_MS, JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH,
  BATTLE_COURSES, COURSE_PROMPT, TEAMS_REQUIRED_PLAYERS, DEFAULT_COURSE_SET,
} from './battle.types';
import { isPaid } from '../common/plans';
import { XP } from '../common/xp';

// El gateway implementa esto y se registra para que el service pueda emitir
// eventos de tiempo real (también los disparados por timers, sin contexto de socket).
export interface BattleEmitter {
  emitToBattle(battleId: string, event: string, payload: unknown): void;
}

// Modos disponibles en pública (matchmaking) y en privada (sala con código)
const VALID_MODES: BattleMode[] = ['my_ingredients', 'chef_choice'];
const VALID_PRIVATE_MODES: BattleMode[] = ['my_ingredients', 'chef_choice', 'buffet', 'teams'];
// Modos donde cada jugador cocina su propio plato (receta por jugador, no compartida)
const PER_PLAYER_MODES: BattleMode[] = ['buffet', 'teams'];

@Injectable()
export class BattleService implements OnModuleInit {
  private readonly logger = new Logger(BattleService.name);
  private emitter?: BattleEmitter;

  // Timers en memoria (MVP single-instance). Se pierden al reiniciar el proceso.
  private lobbyTimers = new Map<string, NodeJS.Timeout>();
  private cookingTimers = new Map<string, NodeJS.Timeout>();
  // Pública: cuenta de 15s cuando todos los presentes están listos sin llenar la sala
  private quickStartTimers = new Map<string, NodeJS.Timeout>();
  private quickStartAt = new Map<string, number>();

  // Evita generar el catálogo de recetas dos veces en paralelo (por idioma)
  private optionsLock = new Map<string, Promise<any>>();

  constructor(
    private prisma: PrismaService,
    private openai: OpenaiService,
    private statsService: StatsService,
    private storage: SupabaseStorageService,
  ) {}

  // XP global por jugar un duelo: participación a todos + bonus a los ganadores.
  // Se llama una sola vez al finalizar (la transición a 'finished' ocurre una vez).
  // Devuelve el XP/nivel resultante por jugador (userId → resultado de awardXp) para
  // poder mostrar la animación de +XP / subida de nivel en el cliente. En PARALELO:
  // son usuarios distintos (sin contención de fila), igual que rewardMission en clans.
  private async awardBattleXp(
    ranking: { userId: number }[],
    winnerUserIds: number[],
  ): Promise<Record<number, { xpGained: number; xpTotal: number; nivel: number; leveledUp: boolean }>> {
    const winners = new Set(winnerUserIds);
    const entries = await Promise.all(
      ranking.map(async (r) => {
        const gano = winners.has(r.userId);
        const amount = XP.DUEL_PLAY + (gano ? XP.DUEL_WIN : 0);
        const res = await this.statsService.awardXp(r.userId, amount);
        // Contadores para las insignias de duelo (se recalculan al abrir /badges).
        await this.prisma.user.update({
          where: { id: r.userId },
          data: {
            duelsPlayed: { increment: 1 },
            ...(gano ? { duelsWon: { increment: 1 } } : {}),
          },
        });
        return [r.userId, { xpGained: amount, xpTotal: res.xpTotal, nivel: res.nivel, leveledUp: res.leveledUp }] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  // Al arrancar, rehidratar los timers de las batallas activas desde la DB.
  // Los timers viven en memoria, así que un reinicio los pierde; los reconstruimos
  // a partir de lobbyExpiresAt/cookingEndsAt. Si la fecha ya venció, la transición
  // se dispara de inmediato (setTimeout con delay 0).
  async onModuleInit() {
    try {
      const active = await this.prisma.cookBattle.findMany({
        where: { status: { in: ['waiting', 'cooking', 'judging'] } },
        select: { id: true, status: true, lobbyExpiresAt: true, cookingEndsAt: true },
      });
      for (const b of active) {
        if (b.status === 'waiting') {
          this.scheduleLobbyTimeout(b.id, b.lobbyExpiresAt ?? new Date());
          // Reanudar la cuenta corta si la sala pública ya tenía a todos listos
          this.refreshPublicAutoStart(b.id).catch((e) =>
            this.logger.warn(`Recovery quick-start ${b.id}: ${(e as Error).message}`),
          );
        } else if (b.status === 'cooking') {
          this.scheduleCookingTimeout(b.id, b.cookingEndsAt ?? new Date());
        } else if (b.status === 'judging') {
          // Estaba juzgando cuando se cayó el proceso → reintentar el veredicto.
          // recovery=true permite re-entrar aunque el status ya sea 'judging'.
          this.judgeBattle(b.id, { recovery: true }).catch((e) =>
            this.logger.error(`Recovery judging error ${b.id}: ${(e as Error).message}`),
          );
        }
      }
      if (active.length > 0) this.logger.log(`Rehidratadas ${active.length} batalla(s) activa(s)`);
    } catch (e) {
      this.logger.warn('No se pudieron rehidratar batallas: ' + (e as Error).message);
    }

    // Pre-genera el catálogo de "Receta del chef" de hoy (sin bloquear el arranque) para que el
    // PRIMER usuario del día no pague la generación con OpenAI (~varios s). Es global por día/idioma.
    void this.warmRecipeOptions();
  }

  // Catálogo de duelos del día: pre-generación proactiva. App en inglés → solo 'en'.
  // El cron cubre el cambio de día a medianoche; onModuleInit cubre los reinicios.
  // getRecipeOptions ya es idempotente (lock + chequeo de existentes) → seguro llamarlo de más.
  @Cron('5 0 * * *')
  async warmRecipeOptions() {
    try {
      await this.getRecipeOptions('en');
      this.logger.log('Catálogo de recetas de duelo (en) listo en caché.');
    } catch (e) {
      this.logger.warn('No se pudo pre-generar el catálogo de duelos: ' + (e as Error).message);
    }
  }

  registerEmitter(emitter: BattleEmitter) {
    this.emitter = emitter;
  }

  private emit(battleId: string, event: string, payload: unknown) {
    this.emitter?.emitToBattle(battleId, event, payload);
  }

  // =========================
  // 🔌 UNIRSE / MATCHMAKING
  // =========================
  async joinBattle(
    user: SocketUser,
    opts: { mode: string; mealTime?: string; language?: string; ingredients?: string[]; recipeOptionId?: string },
  ): Promise<{ battleId: string; state: any }> {
    const mode = opts.mode as BattleMode;
    if (!VALID_MODES.includes(mode)) throw new BadRequestException('Invalid battle mode');

    const language = opts.language === 'en' ? 'en' : 'es';
    let mealTime = this.normalizeMeal(opts.mealTime);

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new NotFoundException('User not found');

    // Duelo de cocina = solo PRO y CHEF. FREE no puede entrar a ninguna batalla.
    if (!isPaid(dbUser.plan)) throw new ForbiddenException('PRO_ONLY');

    // ¿Ya está en una batalla activa? Lo reconectamos a esa.
    const existing = await this.prisma.cookBattlePlayer.findFirst({
      where: { userId: user.id, battle: { status: { in: ['waiting', 'cooking', 'judging'] } } },
      include: { battle: true },
    });
    if (existing) {
      return { battleId: existing.battleId, state: await this.buildState(existing.battleId) };
    }

    // Ingredientes (obligatorios en modo my_ingredients)
    let ingredients: string[] = [];
    if (mode === 'my_ingredients') {
      ingredients = this.normalizeIngredients(opts.ingredients ?? []);
      if (ingredients.length < 2) {
        throw new BadRequestException('At least 2 ingredients are required for my_ingredients mode');
      }
      // Modo my_ingredients SÍ consume el límite FREE → verificar antes de nada
      if (dbUser.plan === 'FREE' && (dbUser.requestsUsed ?? 0) >= FREE_LIMIT) {
        throw new ForbiddenException('LIMIT_REACHED');
      }
    }

    // Receta del catálogo (obligatoria en modo chef_choice): el usuario elige cuál
    let chosenOption: { id: string; mealTime: string; recipeData: any } | null = null;
    if (mode === 'chef_choice') {
      if (!opts.recipeOptionId) throw new BadRequestException('recipeOptionId is required');
      const opt = await this.prisma.battleRecipeOption.findUnique({ where: { id: opts.recipeOptionId } });
      if (!opt) throw new BadRequestException('RECIPE_OPTION_NOT_FOUND');
      chosenOption = { id: opt.id, mealTime: opt.mealTime, recipeData: opt.recipeData };
      mealTime = opt.mealTime; // la sala hereda el tipo de comida de la receta elegida
    }

    // Buscar una sala abierta compatible
    const candidates = await this.prisma.cookBattle.findMany({
      where: { mode, status: 'waiting', language },
      include: { players: true },
      orderBy: { createdAt: 'asc' },
    });

    const now = Date.now();
    let target = candidates.find((b) => {
      if (b.players.length >= BATTLE_MAX_PLAYERS) return false;
      if (b.lobbyExpiresAt && b.lobbyExpiresAt.getTime() <= now) return false;
      if (mode === 'my_ingredients') {
        // Solo emparejar si comparten suficientes ingredientes
        const existingIngredients = this.collectIngredients(b.players);
        return this.jaccard(ingredients, existingIngredients) >= INGREDIENT_MATCH_THRESHOLD;
      }
      if (mode === 'chef_choice') {
        // Solo emparejar a quienes eligieron la MISMA receta del catálogo
        return b.recipeOptionId === opts.recipeOptionId;
      }
      return true;
    });

    let battleId: string;
    let isNewBattle = false;

    if (target) {
      // Unirse a sala existente
      battleId = target.id;
      await this.prisma.cookBattlePlayer.create({
        data: {
          battleId,
          userId: user.id,
          isHost: false,
          ingredients: mode === 'my_ingredients' ? ingredients : undefined,
        },
      });
    } else {
      // Crear nueva sala
      isNewBattle = true;
      let recipeData: RecipeData | null = null;
      let recipeTitle: string | null = null;
      let timeLimitSec: number | null = null;

      // En chef_choice la receta ya viene del catálogo elegido por el usuario,
      // así los ingredientes se muestran en el lobby (el usuario debe conseguirlos).
      if (mode === 'chef_choice' && chosenOption) {
        recipeData = chosenOption.recipeData as RecipeData;
        recipeTitle = recipeData.title;
        timeLimitSec = this.cookTimeToLimitSec(recipeData.cookTime);
      }

      const battle = await this.prisma.cookBattle.create({
        data: {
          mode, status: 'waiting', mealTime, language,
          lobbyExpiresAt: new Date(now + LOBBY_DURATION_MS),
          recipeData: recipeData as any, recipeTitle, timeLimitSec,
          recipeOptionId: chosenOption?.id ?? null,
          players: {
            create: {
              userId: user.id,
              isHost: true,
              ingredients: mode === 'my_ingredients' ? ingredients : undefined,
            },
          },
        },
      });
      battleId = battle.id;
      this.scheduleLobbyTimeout(battleId, battle.lobbyExpiresAt ?? new Date(now + LOBBY_DURATION_MS));
    }

    const state = await this.buildState(battleId);
    // Avisar a los que ya estaban en la sala (el que entra recibe el estado por el return)
    if (!isNewBattle) {
      this.emit(battleId, 'battle:playerJoined', { battleId, userId: user.id, state });
      // Entró alguien sin marcar listo → recalcular (cancela una cuenta de 15s si la había)
      await this.refreshPublicAutoStart(battleId);
    }
    return { battleId, state };
  }

  // =========================
  // 🔒 PARTIDA PRIVADA — crear sala con código
  // =========================
  async createPrivateBattle(
    user: SocketUser,
    opts: { mode: string; mealTime?: string; language?: string; ingredients?: string[]; recipeOptionId?: string },
  ): Promise<{ battleId: string; state: any }> {
    const mode = opts.mode as BattleMode;
    // Privada admite los 4 modos (Buffet y Equipos son privado-only)
    if (!VALID_PRIVATE_MODES.includes(mode)) throw new BadRequestException('Invalid battle mode');

    const language = opts.language === 'en' ? 'en' : 'es';
    let mealTime = this.normalizeMeal(opts.mealTime);

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new NotFoundException('User not found');
    if (!isPaid(dbUser.plan)) throw new ForbiddenException('PRO_ONLY');

    // ¿Ya está en una batalla activa? Lo reconectamos a esa en vez de crear otra.
    const active = await this.prisma.cookBattlePlayer.findFirst({
      where: { userId: user.id, battle: { status: { in: ['waiting', 'cooking', 'judging'] } } },
    });
    if (active) {
      return { battleId: active.battleId, state: await this.buildState(active.battleId) };
    }

    // Ingredientes del host (obligatorios en my_ingredients). En privada, los del host
    // definen la receta compartida (los que entran por código no aportan ingredientes).
    let ingredients: string[] = [];
    if (mode === 'my_ingredients') {
      ingredients = this.normalizeIngredients(opts.ingredients ?? []);
      if (ingredients.length < 2) {
        throw new BadRequestException('At least 2 ingredients are required for my_ingredients mode');
      }
      if (dbUser.plan === 'FREE' && (dbUser.requestsUsed ?? 0) >= FREE_LIMIT) {
        throw new ForbiddenException('LIMIT_REACHED');
      }
    }

    // En chef_choice la receta del catálogo se fija al crear (se muestran ingredientes en el lobby)
    let recipeData: RecipeData | null = null;
    let recipeTitle: string | null = null;
    let timeLimitSec: number | null = null;
    let recipeOptionId: string | null = null;
    if (mode === 'chef_choice') {
      if (!opts.recipeOptionId) throw new BadRequestException('recipeOptionId is required');
      const opt = await this.prisma.battleRecipeOption.findUnique({ where: { id: opts.recipeOptionId } });
      if (!opt) throw new BadRequestException('RECIPE_OPTION_NOT_FOUND');
      recipeData = opt.recipeData as unknown as RecipeData;
      recipeTitle = recipeData.title;
      timeLimitSec = this.cookTimeToLimitSec(recipeData.cookTime);
      recipeOptionId = opt.id;
      mealTime = opt.mealTime; // la sala hereda el tipo de comida de la receta elegida
    }

    const now = Date.now();
    const joinCode = await this.generateJoinCode();
    const expiresAt = new Date(now + PRIVATE_LOBBY_TTL_MS);

    // Buffet/Equipos: el host arranca con una asignación por defecto (editable en el lobby)
    const hostAssign = PER_PLAYER_MODES.includes(mode) ? this.defaultAssignment(mode, 0) : null;

    const battle = await this.prisma.cookBattle.create({
      data: {
        mode, status: 'waiting', visibility: 'private', joinCode,
        mealTime, language,
        lobbyExpiresAt: expiresAt,
        recipeData: recipeData as any, recipeTitle, timeLimitSec,
        recipeOptionId,
        players: {
          create: {
            userId: user.id, isHost: true,
            ingredients: mode === 'my_ingredients' ? ingredients : undefined,
            team: hostAssign?.team ?? undefined,
            courseLabel: hostAssign?.courseLabel ?? undefined,
          },
        },
      },
    });

    // El TTL solo limpia salas abandonadas; el inicio real lo dispara el host.
    this.scheduleLobbyTimeout(battle.id, expiresAt);
    return { battleId: battle.id, state: await this.buildState(battle.id) };
  }

  // Genera un código de invitación único (alfabeto sin caracteres ambiguos).
  private async generateJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      let code = '';
      for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
        code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
      }
      const clash = await this.prisma.cookBattle.findUnique({ where: { joinCode: code } });
      if (!clash) return code;
    }
    // Colisión repetida (improbabilísima): añadir entropía temporal
    return (JOIN_CODE_ALPHABET[0] + Date.now().toString(36).toUpperCase()).slice(0, JOIN_CODE_LENGTH + 2);
  }

  // =========================
  // 🔑 PARTIDA PRIVADA — unirse con código
  // =========================
  async joinByCode(user: SocketUser, rawCode: string): Promise<{ battleId: string; state: any }> {
    const code = (rawCode ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException('Code is required');

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new NotFoundException('User not found');
    if (!isPaid(dbUser.plan)) throw new ForbiddenException('PRO_ONLY');

    // ¿Ya está en una batalla activa? Reconectar a esa.
    const active = await this.prisma.cookBattlePlayer.findFirst({
      where: { userId: user.id, battle: { status: { in: ['waiting', 'cooking', 'judging'] } } },
    });
    if (active) {
      return { battleId: active.battleId, state: await this.buildState(active.battleId) };
    }

    const battle = await this.prisma.cookBattle.findUnique({
      where: { joinCode: code }, include: { players: true },
    });
    if (!battle || battle.visibility !== 'private') throw new BadRequestException('ROOM_NOT_FOUND');
    if (battle.status !== 'waiting') throw new BadRequestException('ALREADY_STARTED');
    if (battle.players.some((p) => p.userId === user.id)) {
      return { battleId: battle.id, state: await this.buildState(battle.id) };
    }
    if (battle.players.length >= BATTLE_MAX_PLAYERS) throw new BadRequestException('ROOM_FULL');

    // my_ingredients consume límite FREE → verificar antes de entrar
    if (battle.mode === 'my_ingredients' && dbUser.plan === 'FREE' && (dbUser.requestsUsed ?? 0) >= FREE_LIMIT) {
      throw new ForbiddenException('LIMIT_REACHED');
    }

    // Buffet/Equipos: el que entra recibe una asignación por defecto según su orden de llegada
    const joinAssign = PER_PLAYER_MODES.includes(battle.mode as BattleMode)
      ? this.defaultAssignment(battle.mode as BattleMode, battle.players.length)
      : null;

    await this.prisma.cookBattlePlayer.create({
      data: {
        battleId: battle.id, userId: user.id, isHost: false,
        team: joinAssign?.team ?? undefined,
        courseLabel: joinAssign?.courseLabel ?? undefined,
      },
    });

    const state = await this.buildState(battle.id);
    this.emit(battle.id, 'battle:playerJoined', { battleId: battle.id, userId: user.id, state });
    return { battleId: battle.id, state };
  }

  // =========================
  // 🎯 BUFFET/EQUIPOS — el host reparte cursos y equipos
  // =========================
  // Asignación por defecto según el orden de llegada (editable por el host).
  // Buffet: cursos distintos en orden. Equipos: 2v2 con cursos espejados entre equipos.
  private defaultAssignment(mode: BattleMode, index: number): { team: number | null; courseLabel: BattleCourse } {
    if (mode === 'teams') {
      const team = index < 2 ? 0 : 1;
      const courseLabel = DEFAULT_COURSE_SET[index % 2]; // 0→main, 1→salad (espejado por equipo)
      return { team, courseLabel };
    }
    // buffet
    return { team: null, courseLabel: DEFAULT_COURSE_SET[index % DEFAULT_COURSE_SET.length] };
  }

  async assignRoles(
    user: SocketUser,
    battleId: string,
    assignments: { userId: number; team?: number | null; courseLabel?: string }[],
  ): Promise<{ state: any }> {
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle) throw new NotFoundException('Battle not found');
    if (battle.status !== 'waiting') throw new BadRequestException('Battle already started');
    if (!PER_PLAYER_MODES.includes(battle.mode as BattleMode)) throw new BadRequestException('Assignments not allowed in this mode');

    const host = battle.players.find((p) => p.userId === user.id && p.isHost);
    if (!host) throw new ForbiddenException('Only the host can assign roles');

    const isTeams = battle.mode === 'teams';
    for (const a of assignments ?? []) {
      const player = battle.players.find((p) => p.userId === a.userId);
      if (!player) continue;
      const courseLabel = a.courseLabel && BATTLE_COURSES.includes(a.courseLabel as BattleCourse)
        ? (a.courseLabel as BattleCourse) : null;
      const team = isTeams && (a.team === 0 || a.team === 1) ? a.team : (isTeams ? player.team : null);
      await this.prisma.cookBattlePlayer.update({
        where: { id: player.id },
        data: {
          ...(courseLabel ? { courseLabel } : {}),
          team: team ?? null,
        },
      });
    }

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:assigned', { battleId, state });
    return { state };
  }

  // =========================
  // ▶️ PARTIDA PRIVADA — el host inicia
  // =========================
  async startBattleByHost(user: SocketUser, battleId: string): Promise<{ state: any }> {
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle) throw new NotFoundException('Battle not found');
    if (battle.visibility !== 'private') throw new BadRequestException('Not a private battle');
    if (battle.status !== 'waiting') throw new BadRequestException('Battle already started');

    const host = battle.players.find((p) => p.userId === user.id && p.isHost);
    if (!host) throw new ForbiddenException('Only the host can start the battle');

    const mode = battle.mode as BattleMode;
    // Equipos = exactamente 4 jugadores (2 vs 2); el resto, mínimo 2.
    if (mode === 'teams') {
      if (battle.players.length !== TEAMS_REQUIRED_PLAYERS) throw new BadRequestException('TEAMS_NEED_4');
      const t0 = battle.players.filter((p) => p.team === 0).length;
      const t1 = battle.players.filter((p) => p.team === 1).length;
      if (t0 !== 2 || t1 !== 2) throw new BadRequestException('TEAMS_UNBALANCED');
    } else if (battle.players.length < BATTLE_MIN_PLAYERS) {
      throw new BadRequestException('NOT_ENOUGH_PLAYERS');
    }

    // Buffet/Equipos: asegurar que cada jugador tenga curso asignado (rellenar faltantes)
    if (PER_PLAYER_MODES.includes(mode)) {
      const ordered = [...battle.players].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
      for (let i = 0; i < ordered.length; i++) {
        const p = ordered[i];
        if (!p.courseLabel || (mode === 'teams' && p.team == null)) {
          const def = this.defaultAssignment(mode, i);
          await this.prisma.cookBattlePlayer.update({
            where: { id: p.id },
            data: { courseLabel: p.courseLabel ?? def.courseLabel, team: mode === 'teams' ? (p.team ?? def.team) : null },
          });
        }
      }
    }

    await this.startBattle(battleId);
    return { state: await this.buildState(battleId) };
  }

  // =========================
  // ✅ MARCAR LISTO
  // =========================
  async setReady(user: SocketUser, battleId: string): Promise<{ state: any }> {
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle) throw new NotFoundException('Battle not found');
    if (battle.status !== 'waiting') throw new BadRequestException('Battle already started');

    const player = battle.players.find((p) => p.userId === user.id);
    if (!player) throw new ForbiddenException('You are not in this battle');

    await this.prisma.cookBattlePlayer.update({
      where: { id: player.id }, data: { isReady: true },
    });

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:playerReady', { battleId, userId: user.id, state });

    // Pública: evalúa auto-arranque (sala llena → ya; 2-3 todos listos → cuenta de 15s).
    // En privada el inicio lo controla el host (startBattleByHost).
    if (battle.visibility !== 'private') {
      await this.refreshPublicAutoStart(battleId);
    }

    return { state };
  }

  // =========================
  // ⚡ AUTO-ARRANQUE PÚBLICO (sala llena ya · 2-3 todos listos → 15s)
  // =========================
  private async refreshPublicAutoStart(battleId: string) {
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle || battle.status !== 'waiting' || battle.visibility !== 'public') {
      this.clearQuickStart(battleId);
      return;
    }
    const total = battle.players.length;
    const ready = battle.players.filter((p) => p.isReady).length;
    const allReady = total >= BATTLE_MIN_PLAYERS && ready === total;

    if (allReady && total >= BATTLE_MAX_PLAYERS) {
      // Sala llena + todos listos → arrancar ya
      this.clearQuickStart(battleId);
      await this.startBattle(battleId);
    } else if (allReady) {
      // 2-3 jugadores, todos listos → cuenta de 15s (si no hay una en marcha)
      this.scheduleQuickStart(battleId);
    } else {
      // Alguien sin marcar listo (p.ej. recién entró) → cancelar la cuenta
      this.clearQuickStart(battleId);
    }
  }

  private scheduleQuickStart(battleId: string) {
    if (this.quickStartTimers.has(battleId)) return; // ya hay una cuenta corriendo
    const startsAt = Date.now() + QUICK_START_MS;
    this.quickStartAt.set(battleId, startsAt);
    const t = setTimeout(() => {
      this.quickStartTimers.delete(battleId);
      this.quickStartAt.delete(battleId);
      this.startBattle(battleId).catch((e) =>
        this.logger.error(`Quick-start error ${battleId}: ${(e as Error).message}`),
      );
    }, QUICK_START_MS);
    this.quickStartTimers.set(battleId, t);
    // Avisar a la sala para mostrar la cuenta regresiva
    this.buildState(battleId)
      .then((state) => this.emit(battleId, 'battle:countdown', { battleId, startsAt: new Date(startsAt).toISOString(), state }))
      .catch(() => {});
  }

  private clearQuickStart(battleId: string) {
    const t = this.quickStartTimers.get(battleId);
    if (t) { clearTimeout(t); this.quickStartTimers.delete(battleId); }
    if (this.quickStartAt.has(battleId)) {
      this.quickStartAt.delete(battleId);
      // Avisar que se canceló la cuenta (refrescar estado de la sala)
      this.buildState(battleId)
        .then((state) => this.emit(battleId, 'battle:countdown', { battleId, startsAt: null, state }))
        .catch(() => {});
    }
  }

  // =========================
  // 🚪 SALIR (solo en lobby)
  // =========================
  async leaveBattle(user: SocketUser, battleId: string): Promise<{ ok: true }> {
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle) return { ok: true };

    const player = battle.players.find((p) => p.userId === user.id);
    if (!player) return { ok: true };

    // Durante cocción/juzgado el jugador ya está comprometido — no se elimina.
    if (battle.status !== 'waiting') return { ok: true };

    await this.prisma.cookBattlePlayer.delete({ where: { id: player.id } });
    const remaining = battle.players.filter((p) => p.userId !== user.id);

    if (remaining.length === 0) {
      this.clearLobbyTimer(battleId);
      this.clearQuickStart(battleId);
      await this.prisma.cookBattle.update({ where: { id: battleId }, data: { status: 'cancelled' } });
      return { ok: true };
    }

    // Reasignar host si se fue
    if (player.isHost) {
      await this.prisma.cookBattlePlayer.update({
        where: { id: remaining[0].id }, data: { isHost: true },
      });
    }

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:playerLeft', { battleId, userId: user.id, state });
    // Al irse alguien, los que quedan podrían quedar todos listos → recalcular la cuenta
    if (battle.visibility !== 'private') {
      await this.refreshPublicAutoStart(battleId);
    }
    return { ok: true };
  }

  // =========================
  // 📸 ENVIAR FOTO DEL RESULTADO
  // =========================
  async submitPhoto(user: SocketUser, battleId: string, photoBase64: string): Promise<{ ok: true }> {
    if (!photoBase64 || typeof photoBase64 !== 'string') {
      throw new BadRequestException('Photo is required');
    }
    const clean = photoBase64.replace(/^data:image\/\w+;base64,/, '').trim();
    if (clean.length < 100) throw new BadRequestException('Invalid photo');

    // Select liviano: nunca traer photoUrl/recipeData de todos solo para validar membresía.
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId },
      select: {
        status: true,
        players: { select: { id: true, userId: true, photoUrl: true } },
      },
    });
    if (!battle) throw new NotFoundException('Battle not found');
    if (battle.status !== 'cooking') throw new BadRequestException('Battle is not in cooking phase');

    const player = battle.players.find((p) => p.userId === user.id);
    if (!player) throw new ForbiddenException('You are not in this battle');

    // La foto va a Supabase Storage — la DB guarda solo la URL (la fila queda liviana
    // y el pool no transfiere megas de base64 en cada lectura de la batalla).
    const photoUrl = await this.storage.uploadBattlePhoto(battleId, user.id, clean);
    await this.prisma.cookBattlePlayer.update({
      where: { id: player.id }, data: { photoUrl, photoSubmitted: true },
    });
    // Si re-envió, borrar la foto anterior del bucket (best-effort).
    if (player.photoUrl && player.photoUrl !== photoUrl) {
      void this.storage.deleteImage(player.photoUrl);
    }
    await this.updateStreak(user.id);

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:photoSubmitted', { battleId, userId: user.id, state });

    // Si todos enviaron foto → juzgar ya (select mínimo, solo el flag)
    const players = await this.prisma.cookBattlePlayer.findMany({
      where: { battleId }, select: { photoUrl: true },
    });
    if (players.every((p) => !!p.photoUrl)) {
      this.clearCookingTimer(battleId);
      await this.judgeBattle(battleId);
    }

    return { ok: true };
  }

  // Estado actual de una batalla (para reconexión / consultas del gateway)
  async getState(battleId: string) {
    return this.buildState(battleId);
  }

  // =========================
  // 📖 CATÁLOGO DE RECETAS DEL CHEF (compartido entre usuarios)
  // =========================
  private static readonly OPTION_MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'];

  // Clave del día (fecha local del servidor) — el catálogo cambia 1 vez por día.
  private todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Catálogo diario COMPARTIDO: todos los usuarios del mismo idioma ven exactamente
  // las mismas recetas con los mismos IDs, por eso el matchmaking por recipeOptionId
  // los junta en la misma sala. Se genera una sola vez por día y queda fijo.
  async getRecipeOptions(language: 'en' | 'es') {
    const dateKey = this.todayKey();
    const existing = await this.prisma.battleRecipeOption.findMany({
      where: { language, dateKey }, orderBy: { createdAt: 'asc' },
    });
    if (existing.length >= 1) return existing.map((o) => this.toOptionPublic(o));

    // Generar el set de hoy una sola vez (lock contra concurrencia en la misma instancia)
    const lockKey = `${language}:${dateKey}`;
    const inFlight = this.optionsLock.get(lockKey);
    if (inFlight) return inFlight;
    const job = this.regenerateRecipeOptions(language, dateKey).finally(() => this.optionsLock.delete(lockKey));
    this.optionsLock.set(lockKey, job);
    return job;
  }

  private toOptionPublic(o: { id: string; mealTime: string; recipeData: any }) {
    const r = o.recipeData as RecipeData;
    return {
      id: o.id,
      mealTime: o.mealTime,
      title: r.title,
      description: r.description ?? null,
      ingredients: r.ingredients ?? [],
      tools: r.tools ?? [],
      difficulty: r.difficulty ?? null,
      cookTime: r.cookTime ?? null,
    };
  }

  // Títulos recientes del catálogo de duelos (de cualquier día) para evitar repetir
  // recetas día tras día. El catálogo de hoy se reemplaza, pero los días previos quedan.
  private async getRecentBattleTitles(language: 'en' | 'es', limit = 40): Promise<string[]> {
    const recent = await this.prisma.battleRecipeOption.findMany({
      where: { language }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { recipeData: true },
    });
    return recent
      .map((o) => (o.recipeData as RecipeData)?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
  }

  // Normaliza un título para comparar repeticiones (sin acentos, minúsculas, sin signos).
  private normalizeTitle(title: string): string {
    return title.normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private async regenerateRecipeOptions(language: 'en' | 'es', dateKey: string) {
    const meals = BattleService.OPTION_MEALS;

    // Exclusiones = historial reciente del catálogo (evita repetir de días anteriores).
    const exclusions = await this.getRecentBattleTitles(language);
    const usedKeys = new Set(exclusions.map((t) => this.normalizeTitle(t)));

    // 1) Genera el lote en paralelo evitando el historial.
    const settled = await Promise.allSettled(
      meals.map((m) => this.generateOptionRecipe(m, language, exclusions)),
    );

    // 2) Dedup dentro del lote: si dos franjas chocan entre sí o con el historial,
    //    regenera las repetidas en serie con las exclusiones acumuladas.
    const recipes: { mealTime: string; recipe: RecipeData }[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status !== 'fulfilled') continue;
      let recipe = r.value;
      let key = this.normalizeTitle(recipe.title);
      let tries = 0;
      while (usedKeys.has(key) && tries < 3) {
        recipe = await this.generateOptionRecipe(meals[i], language, exclusions);
        key = this.normalizeTitle(recipe.title);
        tries++;
      }
      usedKeys.add(key);
      exclusions.push(recipe.title);
      recipes.push({ mealTime: meals[i], recipe });
    }

    if (recipes.length === 0) {
      // No se pudo generar nada hoy: devolver el último catálogo disponible (de cualquier día)
      const old = await this.prisma.battleRecipeOption.findMany({
        where: { language }, orderBy: { createdAt: 'desc' }, take: meals.length,
      });
      return old.map((o) => this.toOptionPublic(o));
    }

    // Reemplazar el set de hoy (idempotente ante carreras) y guardarlo fijo
    await this.prisma.battleRecipeOption.deleteMany({ where: { language, dateKey } });
    const created: ReturnType<BattleService['toOptionPublic']>[] = [];
    for (const r of recipes) {
      const row = await this.prisma.battleRecipeOption.create({
        data: { language, dateKey, mealTime: r.mealTime, recipeData: r.recipe as any },
      });
      created.push(this.toOptionPublic(row));
    }
    return created;
  }

  private async generateOptionRecipe(mealTime: string, language: 'en' | 'es', exclusions: string[] = []): Promise<RecipeData> {
    const seed = Math.random().toString(36).slice(2, 8);
    const message =
      language === 'es'
        ? `Receta divertida y atractiva para una competencia de cocina entre amigos. (meal type: ${mealTime}) (seed: ${seed})`
        : `Fun, crowd-pleasing recipe for a cooking competition between friends. (meal type: ${mealTime}) (seed: ${seed})`;
    const recipe = await this.openai.generarReceta(message, null, false, language, exclusions);
    return this.toRecipeData(recipe);
  }

  // =========================
  // 💬 CHAT CON EL CHEF (durante la cocción) — no consume límite
  // =========================
  async askChef(
    user: SocketUser, battleId: string, question: string, stepContext?: string,
  ): Promise<string> {
    if (!question?.trim()) throw new BadRequestException('Question is required');

    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle) throw new NotFoundException('Battle not found');
    if (!battle.players.some((p) => p.userId === user.id)) {
      throw new ForbiddenException('You are not in this battle');
    }

    const recipe = battle.recipeData as unknown as RecipeData | null;
    if (!recipe?.title) throw new BadRequestException('Recipe not ready yet');

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    const recipeContext =
      `${recipe.title}\n${recipe.description ?? ''}\n` +
      `Ingredients:\n${(recipe.ingredients ?? []).join('\n')}\n` +
      `Steps:\n${(recipe.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    return this.openai.responderPreguntaReceta(recipeContext, question, dbUser, stepContext);
  }

  // =========================
  // ⏱️ TIMERS DEL LOBBY
  // =========================
  private scheduleLobbyTimeout(battleId: string, expiresAt: Date) {
    this.clearLobbyTimer(battleId);
    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    const t = setTimeout(() => {
      this.onLobbyTimeout(battleId).catch((e) =>
        this.logger.error(`Lobby timeout error ${battleId}: ${(e as Error).message}`),
      );
    }, delay);
    this.lobbyTimers.set(battleId, t);
  }

  private async onLobbyTimeout(battleId: string) {
    this.clearLobbyTimer(battleId);
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle || battle.status !== 'waiting') return;

    // Privada: el inicio lo controla el host. Si el lobby venció sin empezar, se abandonó → cancelar.
    if (battle.visibility === 'private') {
      await this.prisma.cookBattle.update({ where: { id: battleId }, data: { status: 'cancelled' } });
      this.emit(battleId, 'battle:cancelled', { battleId, reason: 'LOBBY_EXPIRED' });
      return;
    }

    const ready = battle.players.filter((p) => p.isReady);
    if (ready.length >= BATTLE_MIN_PLAYERS) {
      // Empezar con los que estén listos; descartar al resto
      await this.startBattle(battleId);
    } else {
      await this.prisma.cookBattle.update({ where: { id: battleId }, data: { status: 'cancelled' } });
      this.emit(battleId, 'battle:cancelled', { battleId, reason: 'NOT_ENOUGH_READY_PLAYERS' });
    }
  }

  private clearLobbyTimer(battleId: string) {
    const t = this.lobbyTimers.get(battleId);
    if (t) { clearTimeout(t); this.lobbyTimers.delete(battleId); }
  }

  // =========================
  // 🚀 ARRANCAR LA PARTIDA
  // =========================
  private async startBattle(battleId: string) {
    this.clearLobbyTimer(battleId);
    this.clearQuickStart(battleId);
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle || battle.status !== 'waiting') return;

    // Pública: solo arrancan los que marcaron "listo" (se descarta al resto).
    // Privada: arrancan TODOS los presentes (el host decide cuándo empezar).
    const isPrivate = battle.visibility === 'private';
    const readyPlayers = isPrivate ? battle.players : battle.players.filter((p) => p.isReady);
    const notReady = isPrivate ? [] : battle.players.filter((p) => !p.isReady);
    if (readyPlayers.length < BATTLE_MIN_PLAYERS) {
      await this.prisma.cookBattle.update({ where: { id: battleId }, data: { status: 'cancelled' } });
      this.emit(battleId, 'battle:cancelled', { battleId, reason: 'NOT_ENOUGH_READY_PLAYERS' });
      return;
    }
    if (notReady.length > 0) {
      await this.prisma.cookBattlePlayer.deleteMany({
        where: { id: { in: notReady.map((p) => p.id) } },
      });
    }

    const mode = battle.mode as BattleMode;
    const language = battle.language === 'en' ? 'en' : 'es';

    // Buffet/Equipos: cada jugador cocina un plato distinto (una receta por curso)
    if (PER_PLAYER_MODES.includes(mode)) {
      await this.startPerPlayerBattle(battleId, readyPlayers, mode, language);
      return;
    }

    // Resolver la receta compartida
    let recipeData: RecipeData;
    try {
      if (mode === 'chef_choice') {
        // Ya se generó al crear la sala
        recipeData = battle.recipeData as unknown as RecipeData;
        if (!recipeData?.title) {
          const host = readyPlayers.find((p) => p.isHost) ?? readyPlayers[0];
          const hostUser = await this.prisma.user.findUnique({ where: { id: host.userId } });
          recipeData = await this.generateChefRecipe(hostUser, battle.mealTime, language);
        }
      } else {
        // my_ingredients: receta a partir de los ingredientes comunes de los listos
        recipeData = await this.generateSharedIngredientRecipe(readyPlayers, battle.mealTime, language);
      }
    } catch (e) {
      this.logger.error(`No se pudo generar receta para ${battleId}: ${(e as Error).message}`);
      await this.prisma.cookBattle.update({ where: { id: battleId }, data: { status: 'cancelled' } });
      this.emit(battleId, 'battle:cancelled', { battleId, reason: 'RECIPE_GENERATION_FAILED' });
      return;
    }

    const timeLimitSec = battle.timeLimitSec ?? this.cookTimeToLimitSec(recipeData.cookTime);
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + timeLimitSec * 1000);

    await this.prisma.cookBattle.update({
      where: { id: battleId },
      data: {
        status: 'cooking',
        recipeData: recipeData as any,
        recipeTitle: recipeData.title,
        timeLimitSec,
        cookingStartedAt: startedAt,
        cookingEndsAt: endsAt,
      },
    });

    // Guardar la receta en el historial de cada jugador + consumir límite si aplica
    await this.persistRecipeForPlayers(readyPlayers.map((p) => p.userId), recipeData, mode);

    this.scheduleCookingTimeout(battleId, endsAt);

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:start', {
      battleId, recipe: recipeData, timeLimitSec,
      cookingEndsAt: endsAt.toISOString(), state,
    });
  }

  // =========================
  // 🍽️ ARRANCAR BUFFET/EQUIPOS — receta por curso, una distinta por jugador
  // =========================
  private async startPerPlayerBattle(
    battleId: string,
    players: { id: string; userId: number; courseLabel: string | null }[],
    mode: BattleMode,
    language: 'en' | 'es',
  ) {
    // Cursos en juego (distintos). En Equipos ambos equipos comparten el mismo set.
    const courses = [...new Set(players.map((p) => p.courseLabel).filter((c): c is string => !!c))];
    if (courses.length === 0) courses.push('main');

    // Generar una receta por curso en paralelo (evitando títulos repetidos entre cursos)
    const exclusions: string[] = [];
    const settled = await Promise.allSettled(courses.map((c) => this.generateCourseRecipe(c, language, exclusions)));
    const byCourse = new Map<string, RecipeData>();
    for (let i = 0; i < courses.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') {
        byCourse.set(courses[i], r.value);
        exclusions.push(r.value.title);
      }
    }

    // Reintentar en serie los cursos que fallaron
    for (const c of courses) {
      if (byCourse.has(c)) continue;
      try {
        const recipe = await this.generateCourseRecipe(c, language, exclusions);
        byCourse.set(c, recipe);
        exclusions.push(recipe.title);
      } catch (e) {
        this.logger.error(`No se pudo generar curso ${c} para ${battleId}: ${(e as Error).message}`);
      }
    }

    if (byCourse.size === 0) {
      await this.prisma.cookBattle.update({ where: { id: battleId }, data: { status: 'cancelled' } });
      this.emit(battleId, 'battle:cancelled', { battleId, reason: 'RECIPE_GENERATION_FAILED' });
      return;
    }

    // Asignar a cada jugador la receta de su curso + guardarla en su historial
    let maxCookTime = 0;
    for (const p of players) {
      const recipe = byCourse.get(p.courseLabel ?? '') ?? [...byCourse.values()][0];
      maxCookTime = Math.max(maxCookTime, recipe.cookTime ?? 0);
      await this.prisma.cookBattlePlayer.update({
        where: { id: p.id },
        data: { recipeData: recipe as any, recipeTitle: recipe.title },
      });
      try {
        await this.prisma.recipe.create({
          data: {
            userId: p.userId, title: recipe.title,
            description: recipe.description ?? null, tip: recipe.tip ?? null,
            ingredients: recipe.ingredients as any, tools: recipe.tools as any, steps: recipe.steps as any,
            stepTips: (Array.isArray(recipe.stepTips) ? recipe.stepTips : []) as any,
            difficulty: recipe.difficulty, cookTime: recipe.cookTime ?? null,
          },
        });
      } catch (e) {
        this.logger.warn(`No se pudo guardar receta de duelo para user ${p.userId}: ${(e as Error).message}`);
      }
    }

    const timeLimitSec = this.cookTimeToLimitSec(maxCookTime || 30);
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + timeLimitSec * 1000);

    await this.prisma.cookBattle.update({
      where: { id: battleId },
      data: {
        status: 'cooking',
        recipeTitle: mode === 'teams' ? 'Teams' : 'Buffet', // etiqueta; las recetas reales viven por jugador
        timeLimitSec, cookingStartedAt: startedAt, cookingEndsAt: endsAt,
      },
    });

    this.scheduleCookingTimeout(battleId, endsAt);

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:start', { battleId, timeLimitSec, cookingEndsAt: endsAt.toISOString(), state });
  }

  // Genera una receta divertida para un curso concreto (Buffet/Equipos)
  private async generateCourseRecipe(course: string, language: 'en' | 'es', exclusions: string[] = []): Promise<RecipeData> {
    const seed = Math.random().toString(36).slice(2, 8);
    const coursePhrase = COURSE_PROMPT[course as BattleCourse] ?? course;
    const message = `A fun, crowd-pleasing "${coursePhrase}" recipe for a cooking competition between friends. (seed: ${seed})`;
    const recipe = await this.openai.generarReceta(message, null, false, language, exclusions);
    return this.toRecipeData(recipe);
  }

  // =========================
  // ⏱️ TIMER DE COCCIÓN
  // =========================
  private scheduleCookingTimeout(battleId: string, endsAt: Date) {
    this.clearCookingTimer(battleId);
    const delay = Math.max(1000, endsAt.getTime() - Date.now() + COOKING_GRACE_MS);
    const t = setTimeout(() => {
      this.judgeBattle(battleId).catch((e) =>
        this.logger.error(`Cooking timeout error ${battleId}: ${(e as Error).message}`),
      );
    }, delay);
    this.cookingTimers.set(battleId, t);
  }

  private clearCookingTimer(battleId: string) {
    const t = this.cookingTimers.get(battleId);
    if (t) { clearTimeout(t); this.cookingTimers.delete(battleId); }
  }

  // =========================
  // 🏆 JUZGAR
  // =========================
  private async judgeBattle(battleId: string, opts?: { recovery?: boolean }) {
    this.clearCookingTimer(battleId);
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId }, include: { players: true },
    });
    if (!battle) return;

    // Transición ATÓMICA cooking→judging: la última foto y el timer de cocción pueden
    // llegar concurrentes — solo el que gana el updateMany juzga (evita doble juez
    // gpt-4o y doble awardBattleXp). 'judging' solo re-entra en recovery (reinicio).
    if (battle.status === 'cooking') {
      const won = await this.prisma.cookBattle.updateMany({
        where: { id: battleId, status: 'cooking' },
        data: { status: 'judging' },
      });
      if (won.count === 0) return; // otro flujo ya está juzgando esta batalla
    } else if (battle.status === 'judging') {
      if (!opts?.recovery) return; // hay un juzgado en curso en este proceso
    } else {
      return;
    }
    this.emit(battleId, 'battle:judging', { battleId });

    // Buffet/Equipos: cada plato es distinto → juez de platos heterogéneos + (equipos) agregación
    const mode = battle.mode as BattleMode;
    if (PER_PLAYER_MODES.includes(mode)) {
      await this.judgePerPlayerBattle(battle, mode);
      return;
    }

    const submitted = battle.players.filter((p) => !!p.photoUrl);
    const notSubmitted = battle.players.filter((p) => !p.photoUrl);
    const language = battle.language === 'en' ? 'en' : 'es';

    let ranking: { userId: number; rank: number; score: number; comment: string }[] = [];
    let summary = '';

    if (submitted.length === 0) {
      // Nadie envió foto → sin ganador
      await this.finishBattle(battleId, [], null, language === 'es' ? 'Nadie envió su plato.' : 'No dishes submitted.', battle.players);
      return;
    } else if (submitted.length === 1) {
      // Un solo plato → gana por default, sin gastar tokens de visión
      ranking = [{ userId: submitted[0].userId, rank: 1, score: 100, comment: language === 'es' ? '¡Único plato en pie!' : 'Last dish standing!' }];
      summary = language === 'es' ? 'Ganó por ser el único en enviar su plato.' : 'Won as the only submission.';
    } else {
      try {
        const result = await this.openai.juzgarBatalla(
          submitted.map((p) => ({ userId: p.userId, image: p.photoUrl! })),
          battle.recipeTitle ?? 'the dish',
          language,
        );
        ranking = result.ranking;
        summary = result.summary;
      } catch (e) {
        this.logger.error(`Juez IA falló ${battleId}: ${(e as Error).message}`);
        // Fallback: empate sin ganador claro, todos los que enviaron quedan rank 1
        ranking = submitted.map((p) => ({ userId: p.userId, rank: 1, score: 50, comment: '' }));
        summary = language === 'es' ? 'No se pudo juzgar automáticamente.' : 'Could not auto-judge.';
      }
    }

    // Los que no enviaron foto quedan al final
    const lastRank = ranking.length + 1;
    for (const p of notSubmitted) {
      ranking.push({ userId: p.userId, rank: lastRank, score: 0, comment: language === 'es' ? 'No envió plato.' : 'No submission.' });
    }

    const winnerUserId = ranking.find((r) => r.rank === 1)?.userId ?? null;
    await this.finishBattle(battleId, ranking, winnerUserId, summary, battle.players);
  }

  private async finishBattle(
    battleId: string,
    ranking: { userId: number; rank: number; score: number; comment: string }[],
    winnerUserId: number | null,
    summary: string,
    players: { id: string; userId: number; photoUrl?: string | null }[],
  ) {
    // Persistir resultados por jugador
    for (const r of ranking) {
      const player = players.find((p) => p.userId === r.userId);
      if (!player) continue;
      await this.prisma.cookBattlePlayer.update({
        where: { id: player.id },
        data: { rank: r.rank, score: r.score, judgeComment: r.comment },
      });
    }

    // XP global: participación a todos + bonus al ganador. Se calcula ANTES de guardar
    // judgeData para que el XP ganado/nivel viaje en el mismo payload persistido que
    // arma state.judge (así sobrevive a un refresh/reconexión, no solo al evento en vivo).
    const xpByUser = await this.awardBattleXp(ranking, winnerUserId != null ? [winnerUserId] : []);

    await this.prisma.cookBattle.update({
      where: { id: battleId },
      data: { status: 'finished', winnerUserId, judgeData: { ranking, summary, xp: xpByUser } as any },
    });

    // Ya juzgado: borrar las fotos del bucket (best-effort) y limpiar las URLs.
    // El flag photoSubmitted y el resultado (rank/score) quedan persistidos.
    const photoUrls = players.map((p) => p.photoUrl).filter((u): u is string => !!u);
    if (photoUrls.length) void this.storage.deleteImages(photoUrls);
    await this.prisma.cookBattlePlayer.updateMany({
      where: { battleId }, data: { photoUrl: null },
    });

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:result', { battleId, winnerUserId, ranking, summary, state });
  }

  // =========================
  // 🍽️ JUZGAR BUFFET/EQUIPOS — cada plato evaluado contra su propia receta
  // =========================
  private async judgePerPlayerBattle(
    battle: { id: string; language: string; players: any[] },
    mode: BattleMode,
  ) {
    const battleId = battle.id;
    const language = battle.language === 'en' ? 'en' : 'es';
    const submitted = battle.players.filter((p) => !!p.photoUrl);
    const notSubmitted = battle.players.filter((p) => !p.photoUrl);

    const scoreMap = new Map<number, { score: number; comment: string }>();
    let summary = '';

    if (submitted.length === 0) {
      await this.finishPerPlayer(battleId, mode, battle.players, scoreMap, language === 'es' ? 'Nadie envió su plato.' : 'No dishes submitted.');
      return;
    } else if (submitted.length === 1) {
      scoreMap.set(submitted[0].userId, { score: 100, comment: language === 'es' ? '¡Único plato en pie!' : 'Last dish standing!' });
      summary = language === 'es' ? 'Solo un plato llegó al final.' : 'Only one dish made it.';
    } else {
      try {
        const result = await this.openai.juzgarPlatos(
          submitted.map((p) => ({ userId: p.userId, image: p.photoUrl!, dishTitle: p.recipeTitle ?? 'the dish', courseLabel: p.courseLabel })),
          language,
        );
        for (const s of result.scores) scoreMap.set(s.userId, { score: s.score, comment: s.comment });
        summary = result.summary;
      } catch (e) {
        this.logger.error(`Juez IA (platos) falló ${battleId}: ${(e as Error).message}`);
        for (const p of submitted) scoreMap.set(p.userId, { score: 50, comment: '' });
        summary = language === 'es' ? 'No se pudo juzgar automáticamente.' : 'Could not auto-judge.';
      }
    }

    for (const p of notSubmitted) {
      scoreMap.set(p.userId, { score: 0, comment: language === 'es' ? 'No envió plato.' : 'No submission.' });
    }

    await this.finishPerPlayer(battleId, mode, battle.players, scoreMap, summary);
  }

  private async finishPerPlayer(
    battleId: string,
    mode: BattleMode,
    players: { id: string; userId: number; team: number | null; courseLabel: string | null; photoUrl?: string | null }[],
    scoreMap: Map<number, { score: number; comment: string }>,
    summary: string,
  ) {
    // Ranking individual (por score desc)
    const ranking = players.map((p) => ({
      userId: p.userId,
      team: p.team ?? null,
      courseLabel: p.courseLabel ?? null,
      score: scoreMap.get(p.userId)?.score ?? 0,
      comment: scoreMap.get(p.userId)?.comment ?? '',
      rank: 0,
    }));
    ranking.sort((a, b) => b.score - a.score);
    ranking.forEach((r, i) => { r.rank = i + 1; });

    let winnerUserId: number | null = null;
    let winningTeam: number | null = null;
    let teams: { team: number; total: number; avg: number; members: number[] }[] = [];

    if (mode === 'teams') {
      // Puntaje de equipo = suma de los platos de sus miembros
      teams = [0, 1].map((t) => {
        const members = ranking.filter((r) => r.team === t);
        const total = members.reduce((s, m) => s + m.score, 0);
        const avg = members.length ? Math.round(total / members.length) : 0;
        return { team: t, total, avg, members: members.map((m) => m.userId) };
      });
      const sorted = [...teams].sort((a, b) => b.total - a.total);
      // Empate de totales → desempata el mejor plato individual
      winningTeam = sorted[0].total === sorted[1].total ? (ranking[0]?.team ?? sorted[0].team) : sorted[0].team;
    } else {
      winnerUserId = ranking[0]?.userId ?? null;
    }

    for (const r of ranking) {
      const player = players.find((p) => p.userId === r.userId);
      if (!player) continue;
      await this.prisma.cookBattlePlayer.update({
        where: { id: player.id },
        data: { rank: r.rank, score: r.score, judgeComment: r.comment },
      });
    }

    // XP global: participación a todos; el bonus va al equipo ganador (teams) o al ganador.
    // Calculado ANTES de guardar judgeData para que viaje en el mismo payload persistido.
    const winnerIds = mode === 'teams'
      ? ranking.filter((r) => r.team === winningTeam).map((r) => r.userId)
      : (winnerUserId != null ? [winnerUserId] : []);
    const xpByUser = await this.awardBattleXp(ranking, winnerIds);

    const judgeData: any = { ranking, summary, xp: xpByUser };
    if (mode === 'teams') { judgeData.teams = teams; judgeData.winningTeam = winningTeam; }

    await this.prisma.cookBattle.update({
      where: { id: battleId },
      data: { status: 'finished', winnerUserId, judgeData },
    });

    // Borrar las fotos del bucket y limpiar las URLs (igual que en finishBattle).
    const photoUrls = players.map((p) => p.photoUrl).filter((u): u is string => !!u);
    if (photoUrls.length) void this.storage.deleteImages(photoUrls);
    await this.prisma.cookBattlePlayer.updateMany({ where: { battleId }, data: { photoUrl: null } });

    const state = await this.buildState(battleId);
    this.emit(battleId, 'battle:result', { battleId, winnerUserId, winningTeam, ranking, summary, state });
  }

  // =========================
  // 🤖 GENERACIÓN DE RECETAS
  // =========================
  private async generateChefRecipe(user: any, mealTime: string | null, language: 'en' | 'es'): Promise<RecipeData> {
    const mealHint = mealTime ? `(meal type: ${mealTime})` : '';
    const seed = Math.random().toString(36).slice(2, 8);
    const message = language === 'es'
      ? `Sorpréndeme con una receta divertida para una competencia de cocina entre amigos. ${mealHint} (seed: ${seed})`
      : `Surprise me with a fun recipe for a cooking competition between friends. ${mealHint} (seed: ${seed})`;
    const recipe = await this.openai.generarReceta(message, user, false, language, []);
    return this.toRecipeData(recipe);
  }

  private async generateSharedIngredientRecipe(
    players: { userId: number; ingredients: any }[],
    mealTime: string | null,
    language: 'en' | 'es',
  ): Promise<RecipeData> {
    const shared = this.computeSharedIngredients(players);
    const host = await this.prisma.user.findUnique({ where: { id: players[0].userId } });
    const mealHint = mealTime ? `(meal type: ${mealTime})` : '';
    const message = `Generate one recipe everyone can cook together using these ingredients: ${shared.join(', ')}. ${mealHint}`;
    const recipe = await this.openai.generarReceta(message, host, false, language, []);
    return this.toRecipeData(recipe);
  }

  private toRecipeData(recipe: any): RecipeData {
    return {
      title: String(recipe.title),
      description: recipe.description ?? null,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      tools: Array.isArray(recipe.tools) ? recipe.tools : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : [],
      stepTips: Array.isArray(recipe.stepTips) ? recipe.stepTips : [],
      difficulty: recipe.difficulty,
      cookTime: typeof recipe.cookTime === 'number' ? recipe.cookTime : 30,
      tip: recipe.tip ?? null,
    };
  }

  // Guardar la receta en el historial de cada jugador y consumir límite (solo my_ingredients)
  private async persistRecipeForPlayers(userIds: number[], recipe: RecipeData, mode: BattleMode) {
    for (const userId of userIds) {
      try {
        await this.prisma.recipe.create({
          data: {
            userId, title: recipe.title,
            description: recipe.description ?? null, tip: recipe.tip ?? null,
            ingredients: recipe.ingredients as any,
            tools: recipe.tools as any,
            steps: recipe.steps as any,
            stepTips: (Array.isArray(recipe.stepTips) ? recipe.stepTips : []) as any,
            difficulty: recipe.difficulty, cookTime: recipe.cookTime ?? null,
          },
        });
        if (mode === 'my_ingredients') {
          const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
          if (u?.plan === 'FREE') {
            await this.prisma.user.update({ where: { id: userId }, data: { requestsUsed: { increment: 1 } } });
          }
        }
      } catch (e) {
        this.logger.warn(`No se pudo guardar receta para user ${userId}: ${(e as Error).message}`);
      }
    }
  }

  // =========================
  // 🔥 RACHA (mismo criterio que recipes.service)
  // =========================
  private async updateStreak(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { cookingStreak: true, lastCookedAt: true },
    });
    if (!user) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastCooked = user.lastCookedAt ? new Date(user.lastCookedAt) : null;
    if (lastCooked) lastCooked.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = 1;
    if (lastCooked) {
      if (lastCooked.getTime() === today.getTime()) return;
      if (lastCooked.getTime() === yesterday.getTime()) newStreak = (user.cookingStreak ?? 0) + 1;
    }
    await this.prisma.user.update({
      where: { id: userId }, data: { cookingStreak: newStreak, lastCookedAt: today },
    });
  }

  // =========================
  // 🧱 HELPERS
  // =========================
  private async buildState(battleId: string) {
    // ⚠️ Select EXPLÍCITO en players: nunca include completo. Con include, cada evento
    // (join/ready/foto/countdown) transfería TODAS las columnas de todos los jugadores
    // — históricamente incluía las fotos — reteniendo una conexión del pool por megas
    // que el mapping a PlayerPublic descartaba de todos modos.
    const battle = await this.prisma.cookBattle.findUnique({
      where: { id: battleId },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' },
          select: {
            userId: true, isReady: true, isHost: true, photoSubmitted: true,
            team: true, courseLabel: true, recipeTitle: true, recipeData: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    if (!battle) throw new NotFoundException('Battle not found');

    const status = battle.status as BattleStatus;
    const perPlayer = battle.mode === 'buffet' || battle.mode === 'teams';
    // En buffet/teams la receta de cada quien se entrega ya cocinando (no se filtra antes)
    const exposeRecipe = perPlayer && (status === 'cooking' || status === 'judging' || status === 'finished');

    const players: PlayerPublic[] = battle.players.map((p) => ({
      userId: p.userId,
      name: p.user?.name ?? null,
      isReady: p.isReady,
      isHost: p.isHost,
      hasSubmittedPhoto: p.photoSubmitted,
      team: perPlayer ? (p.team ?? null) : undefined,
      courseLabel: perPlayer ? (p.courseLabel ?? null) : undefined,
      recipeTitle: perPlayer ? (p.recipeTitle ?? null) : undefined,
      recipe: exposeRecipe ? ((p.recipeData as unknown as RecipeData) ?? null) : undefined,
    }));

    const base: any = {
      battleId: battle.id,
      mode: battle.mode,
      status,
      visibility: battle.visibility,
      // El código solo se expone mientras la sala está abierta (y solo a sus sockets).
      joinCode: status === 'waiting' && battle.visibility === 'private' ? battle.joinCode : null,
      mealTime: battle.mealTime,
      language: battle.language,
      players,
      maxPlayers: BATTLE_MAX_PLAYERS,
      lobbyExpiresAt: battle.lobbyExpiresAt?.toISOString() ?? null,
      // Cuenta corta de auto-arranque (pública, 2-3 todos listos); null si no hay
      quickStartAt: status === 'waiting' && this.quickStartAt.has(battle.id)
        ? new Date(this.quickStartAt.get(battle.id)!).toISOString() : null,
      cookingEndsAt: battle.cookingEndsAt?.toISOString() ?? null,
      timeLimitSec: battle.timeLimitSec ?? null,
      winnerUserId: battle.winnerUserId ?? null,
    };

    const recipe = battle.recipeData as unknown as RecipeData | null;
    if (status === 'waiting' && battle.mode === 'chef_choice' && recipe) {
      // En el lobby solo se muestran los ingredientes a conseguir, no los pasos
      base.recipePreview = {
        title: recipe.title, description: recipe.description ?? null,
        ingredients: recipe.ingredients, tools: recipe.tools,
        difficulty: recipe.difficulty, cookTime: recipe.cookTime,
      };
    }
    if ((status === 'cooking' || status === 'judging' || status === 'finished') && recipe) {
      base.recipe = recipe;
    }
    if (status === 'finished') {
      base.judge = battle.judgeData ?? null;
    }
    return base;
  }

  private normalizeMeal(meal?: string): string | null {
    const valid = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink', 'cocktail', 'surprise'];
    return meal && valid.includes(meal) ? meal : null;
  }

  private normalizeIngredients(list: string[]): string[] {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const v = raw.trim().toLowerCase().slice(0, 40);
      if (v.length >= 2) seen.add(v);
    }
    return [...seen].slice(0, 30);
  }

  private collectIngredients(players: { ingredients: any }[]): string[] {
    const set = new Set<string>();
    for (const p of players) {
      const arr = Array.isArray(p.ingredients) ? p.ingredients : [];
      for (const i of arr) if (typeof i === 'string') set.add(i);
    }
    return [...set];
  }

  // Ingredientes a usar en la receta compartida: intersección; si es muy chica, unión
  private computeSharedIngredients(players: { ingredients: any }[]): string[] {
    const lists = players.map((p) => (Array.isArray(p.ingredients) ? (p.ingredients as string[]) : []));
    if (lists.length === 0) return [];
    let intersection = lists[0];
    for (let i = 1; i < lists.length; i++) {
      const s = new Set(lists[i]);
      intersection = intersection.filter((x) => s.has(x));
    }
    if (intersection.length >= 3) return intersection.slice(0, 15);
    // Unión como fallback
    const union = new Set<string>();
    for (const l of lists) for (const x of l) union.add(x);
    return [...union].slice(0, 15);
  }

  private jaccard(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a); const setB = new Set(b);
    let inter = 0;
    for (const x of setA) if (setB.has(x)) inter++;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : inter / union;
  }

  private cookTimeToLimitSec(cookTime?: number): number {
    const minutes = typeof cookTime === 'number' && cookTime > 0 ? cookTime : 30;
    // Tiempo límite = tiempo de cocción, con piso de 5 min y techo de 60 min
    return Math.min(60, Math.max(5, minutes)) * 60;
  }
}
