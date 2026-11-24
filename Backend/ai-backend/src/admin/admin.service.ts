import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { ClansService } from '../clans/clans.service';

// Panel de moderación (Apple 1.2): permite actuar sobre reportes en <24h →
// descartar, borrar el contenido o banear al usuario (que además le quita el login,
// le borra las publicaciones y lo saca del clan).
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private clansService: ClansService,
  ) {}

  // Lista de reportes (por defecto los pendientes), enriquecidos con autor,
  // reportado y el post (si sigue existiendo).
  async listReports(status = 'pending') {
    const where = status === 'all' ? {} : { status };
    const reports = await this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reporter: { select: { id: true, name: true, username: true } },
        reportedUser: { select: { id: true, name: true, username: true, bannedAt: true } },
      },
    });

    const postIds = reports
      .filter((r) => r.targetType === 'POST' && r.postId)
      .map((r) => r.postId as string);
    const posts = postIds.length
      ? await this.prisma.socialPost.findMany({
          where: { id: { in: postIds } },
          select: { id: true, imageUrl: true, caption: true, type: true },
        })
      : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    return reports.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      reporter: r.reporter,
      reportedUser: r.reportedUser,
      postId: r.postId,
      post: r.postId ? postMap.get(r.postId) ?? null : null, // null si ya se borró
    }));
  }

  async pendingCount() {
    return { pending: await this.prisma.report.count({ where: { status: 'pending' } }) };
  }

  // Acción sobre un reporte: descartar | borrar contenido | banear al usuario.
  async actionReport(reportId: string, action: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    if (action === 'dismiss') {
      await this.prisma.report.update({ where: { id: reportId }, data: { status: 'dismissed' } });
      return { ok: true };
    }

    if (action === 'remove_content') {
      if (report.targetType === 'POST' && report.postId) await this.removePost(report.postId);
      await this.prisma.report.update({ where: { id: reportId }, data: { status: 'reviewed' } });
      return { ok: true };
    }

    if (action === 'ban_user') {
      await this.banUser(report.reportedUserId, `report:${reportId}`);
      // Resolver todos los reportes pendientes contra ese usuario.
      await this.prisma.report.updateMany({
        where: { reportedUserId: report.reportedUserId, status: 'pending' },
        data: { status: 'reviewed' },
      });
      return { ok: true };
    }

    throw new BadRequestException('Invalid action');
  }

  // Borra un post (override de admin) + su imagen del bucket.
  async removePost(postId: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: postId }, select: { id: true, imageUrl: true },
    });
    if (!post) return { ok: true };
    try { await this.storage.deletePostImage(post.imageUrl); } catch { /* best-effort */ }
    await this.prisma.socialPost.delete({ where: { id: postId } });
    return { ok: true };
  }

  // Banear: bloquea el login, borra sus publicaciones+imágenes y lo saca del clan.
  async banUser(userId: number, reason?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { id: true, isAdmin: true, deletedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isAdmin) throw new BadRequestException('No se puede banear a un administrador');

    // Sacarlo del clan (si está en uno) → corta su acceso al chat de clan.
    const membership = await this.prisma.clanMember.findFirst({ where: { userId }, select: { clanId: true } });
    if (membership) {
      try { await this.clansService.leave(userId, membership.clanId); } catch { /* best-effort */ }
    }

    // Borrar sus publicaciones + imágenes (quitar el contenido).
    const posts = await this.prisma.socialPost.findMany({ where: { userId }, select: { imageUrl: true } });
    for (const p of posts) {
      try { await this.storage.deletePostImage(p.imageUrl); } catch { /* best-effort */ }
    }
    await this.prisma.socialPost.deleteMany({ where: { userId } });

    // Cortar sesiones: revocar refresh tokens (el access muere al caducar; login ya queda bloqueado).
    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: new Date(), banReason: (reason || '').slice(0, 300) || null },
    });
    return { ok: true, banned: true };
  }

  async unbanUser(userId: number) {
    await this.prisma.user.update({
      where: { id: userId }, data: { bannedAt: null, banReason: null },
    });
    return { ok: true, banned: false };
  }
}
