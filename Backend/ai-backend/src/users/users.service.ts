import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { BadgesService } from '../badges/badges.service';
import { FriendsService } from '../friends/friends.service';
import { ClansService } from '../clans/clans.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { UpdateProfileDto } from './DTO/update-profile.dto';
import { computePersonalGoal } from '../common/personal-goal';

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {

  constructor(
    private prisma: PrismaService,
    private statsService: StatsService,
    private badgesService: BadgesService,
    private friendsService: FriendsService,
    private clansService: ClansService,
    private storage: SupabaseStorageService,
  ) {}

  // Normaliza y valida un @username (a-z, 0-9, _, 3-20). Lanza si es inválido.
  private normalizeUsername(raw: string): string {
    const u = (raw || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new BadRequestException('USERNAME_INVALID');
    return u;
  }

  // Genera un @username único a partir del nombre/email (para el registro).
  private async generateUniqueUsername(name?: string, email?: string): Promise<string> {
    const slug = (s?: string) =>
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 15);
    let base = slug(name) || slug((email || '').split('@')[0]) || 'chef';
    if (base.length < 3) base = (base + 'chef').slice(0, 15);
    let candidate = base;
    let i = 1;
    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      candidate = `${base}${i++}`.slice(0, 20);
    }
    return candidate;
  }

  // =========================
  // 🔐 CREATE USER
  // =========================
  async createUser(email: string, password: string, name?: string) {

    try {

      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new ConflictException('Email already registered');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const verificationToken = crypto.randomBytes(32).toString('hex');
      const username = await this.generateUniqueUsername(name, email);

      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          verificationToken,
          username,
          // El único camino de registro (auth.register) ya exigió acceptTerms=true.
          termsAcceptedAt: new Date(),
        },
      });

      const { password: _, ...safeUser } = user;

      return safeUser;

    } catch (error) {

      if (error instanceof ConflictException) {
        throw error;
      }

      throw new InternalServerErrorException('Error creating user');

    }

  }

  // =========================
  // 🥗 UPDATE FOOD PROFILE
  // =========================
  async updateProfile(userId: number, data: UpdateProfileDto) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const patch: Record<string, any> = { ...data };

    // Despensa y utensilios (My Kitchen): sanitizar (trim, quitar vacíos, tope de
    // longitud, dedup case-insensitive, máx 60).
    const sanitizeList = (list: string[] | undefined): string[] => {
      const seen = new Set<string>();
      return (list ?? [])
        .map((i) => (typeof i === 'string' ? i.trim().slice(0, 40) : ''))
        .filter((i) => {
          if (!i) return false;
          const key = i.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 60);
    };
    if (data.pantry !== undefined) patch.pantry = sanitizeList(data.pantry);
    if (data.utensils !== undefined) patch.utensils = sanitizeList(data.utensils);

    // Username: normalizar + verificar unicidad. No se permite vaciarlo.
    if (data.username !== undefined) {
      if (!data.username) {
        delete patch.username;
      } else {
        const norm = this.normalizeUsername(data.username);
        const taken = await this.prisma.user.findUnique({ where: { username: norm } });
        if (taken && taken.id !== userId) throw new ConflictException('USERNAME_TAKEN');
        patch.username = norm;
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: patch,
    });

    const { password, ...safeUser } = updatedUser;

    return safeUser;

  }

  // =========================
  // 🔎 DISPONIBILIDAD DE USERNAME
  // =========================
  async checkUsername(username: string, selfId: number) {
    const norm = this.normalizeUsername(username); // lanza si inválido
    const existing = await this.prisma.user.findUnique({ where: { username: norm } });
    return { username: norm, available: !existing || existing.id === selfId };
  }

  // =========================
  // 🔎 BUSCAR USUARIOS (por @username o nombre)
  // =========================
  async searchUsers(query: string, selfId: number) {
    const q = (query || '').trim().replace(/^@/, '');
    if (q.length < 2) return [];
    return this.prisma.user.findMany({
      where: {
        id: { not: selfId },
        username: { not: null },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, name: true, nivel: true },
      take: 20,
      orderBy: { nivel: 'desc' },
    });
  }

  // =========================
  // 👤 PERFIL PÚBLICO (por username)
  // =========================
  async getPublicProfile(username: string, viewerId: number) {
    const u = (username || '').trim().toLowerCase().replace(/^@/, '');
    const user = await this.prisma.user.findUnique({ where: { username: u } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');

    const [badges, membership, friendship] = await Promise.all([
      this.badgesService.getUserBadges(user.id),
      this.prisma.clanMember.findFirst({
        where: { userId: user.id },
        include: { clan: { select: { id: true, nombre: true, avatarUrl: true } } },
        orderBy: { fechaIngreso: 'asc' },
      }),
      this.friendsService.getStatus(viewerId, user.id),
    ]);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      plan: user.plan,
      nivel: user.nivel,
      xpTotal: user.xpTotal,
      xpForCurrentLevel: this.statsService.xpDelNivelActual(user.nivel),
      xpForNextLevel: this.statsService.xpParaSiguienteNivel(user.nivel),
      badges: badges.filter((b) => b.completada), // solo insignias ganadas
      clan: membership
        ? { id: membership.clan.id, nombre: membership.clan.nombre, avatarUrl: membership.clan.avatarUrl, rol: membership.rol }
        : null,
      friendship,
      isSelf: viewerId === user.id,
    };
  }

  // =========================
  // 🔎 FIND USER BY ID
  // =========================
  async findById(userId: number) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password, ...safeUser } = user;

    // La racha guardada solo se recalcula cuando el usuario cocina.
    // Al leer el perfil mostramos la racha "efectiva": si pasó un día
    // completo sin cocinar (último cocinado hace 2+ días) ya se rompió → 0.
    // Añadimos los umbrales de XP del nivel para pintar la barra de progreso global.
    return {
      ...safeUser,
      cookingStreak: this.effectiveStreak(user.cookingStreak, user.lastCookedAt),
      xpForCurrentLevel: this.statsService.xpDelNivelActual(user.nivel),
      xpForNextLevel: this.statsService.xpParaSiguienteNivel(user.nivel),
      // Meta nutricional personalizada (null si faltan datos corporales) — se
      // calcula server-side para que el dashboard y la generación usen el mismo número.
      personalizedGoal: computePersonalGoal(user),
    };

  }

  // =========================
  // 🔥 RACHA EFECTIVA (solo lectura)
  // =========================
  // Viva si cocinó hoy o ayer (ayer = todavía puede cocinar hoy para extenderla).
  // Si el último cocinado fue hace 2+ días, la racha está rota → 0.
  private effectiveStreak(cookingStreak: number, lastCookedAt: Date | null): number {
    if (!cookingStreak || !lastCookedAt) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last = new Date(lastCookedAt);
    last.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (last.getTime() === today.getTime() || last.getTime() === yesterday.getTime()) {
      return cookingStreak;
    }

    return 0;
  }

  // =========================
  // 🗑️ ELIMINAR CUENTA (Apple 5.1.1(v)) — soft delete + anonimización IRREVERSIBLE
  // =========================
  // Pide la contraseña actual (reautenticación). Anonimiza el User (PII sobrescrita,
  // login imposible), libera email/username, borra la huella pública (posts+imágenes,
  // amistades, bloqueos, solicitudes de clan), sale del clan (con sucesión) y PURGA todo
  // el contenido privado (recetas, conversaciones, carpetas, plan semanal, progreso/gamificación).
  async deleteAccount(userId: number, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.deletedAt) return { success: true, alreadyDeleted: true }; // idempotente

    const ok = await bcrypt.compare(password || '', user.password);
    if (!ok) throw new UnauthorizedException('WRONG_PASSWORD');

    // 1) Salir del clan si pertenece a uno (maneja sucesión/disolución del liderazgo).
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId }, select: { clanId: true },
    });
    if (membership) {
      try { await this.clansService.leave(userId, membership.clanId); }
      catch { /* best-effort: no bloquear el borrado por un fallo del clan */ }
    }

    // 2) Borrar imágenes de sus publicaciones del bucket (los posts se borran abajo).
    const posts = await this.prisma.socialPost.findMany({
      where: { userId }, select: { imageUrl: true },
    });
    for (const p of posts) {
      try { await this.storage.deletePostImage(p.imageUrl); }
      catch { /* best-effort */ }
    }

    // 3) Borrar huella social + anonimizar el User, todo en una transacción.
    const anonEmail = `deleted_${userId}@savora.deleted`;
    const scrambledPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

    await this.prisma.$transaction([
      // SocialLike sobre estos posts cae por cascade al borrar el post.
      this.prisma.socialPost.deleteMany({ where: { userId } }),
      this.prisma.friendship.deleteMany({
        where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      }),
      this.prisma.block.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),
      this.prisma.clanRequest.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }), // cortar sesiones (refresh)

      // Contenido privado (hard delete). Orden importa por las FKs:
      // - conversaciones → borran sus mensajes por cascade (incluye las ligadas a recetas).
      // - recetas ANTES que carpetas (Recipe.folderId → RecipeFolder es Restrict).
      this.prisma.conversation.deleteMany({ where: { userId } }),
      this.prisma.mealPlanEntry.deleteMany({ where: { userId } }),
      this.prisma.recipe.deleteMany({ where: { userId } }),
      this.prisma.recipeFolder.deleteMany({ where: { userId } }),

      // Progreso / gamificación personal (no visible para nadie; el XP de clan es un
      // contador almacenado y NO se recalcula, así que esto no lo altera).
      this.prisma.userStats.deleteMany({ where: { userId } }),
      this.prisma.userMission.deleteMany({ where: { userId } }),
      this.prisma.userBadge.deleteMany({ where: { userId } }),
      this.prisma.userMealDbCourse.deleteMany({ where: { userId } }),
      this.prisma.userMealDbLesson.deleteMany({ where: { userId } }),
      this.prisma.userCourse.deleteMany({ where: { userId } }),

      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          email: anonEmail,        // libera el email original para re-registro
          name: null,
          username: null,          // libera el @handle
          password: scrambledPassword,
          allergies: null, dietType: null, goal: null, cookingLevel: null, timeAvailable: null,
          pushToken: null, resetToken: null, resetTokenExpiry: null, verificationToken: null,
          isVerified: false,
        },
      }),
    ]);

    return { success: true };
  }

}