import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Tarjeta mínima de usuario para listas (amigos, solicitudes, búsqueda).
const userCardSelect = {
  id: true,
  username: true,
  name: true,
  nivel: true,
} as const;

export type FriendStatus =
  | 'self'
  | 'none'
  | 'friends'
  | 'request_sent'
  | 'request_received';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  // Estado de la relación entre quien mira (viewer) y otro usuario (target).
  async getStatus(
    viewerId: number,
    targetId: number,
  ): Promise<{ status: FriendStatus; friendshipId?: string }> {
    if (viewerId === targetId) return { status: 'self' };
    const fr = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: viewerId },
        ],
      },
    });
    if (!fr) return { status: 'none' };
    if (fr.status === 'accepted') return { status: 'friends', friendshipId: fr.id };
    // pending
    return {
      status: fr.requesterId === viewerId ? 'request_sent' : 'request_received',
      friendshipId: fr.id,
    };
  }

  // Enviar solicitud (auto-acepta si ya existe la inversa pendiente).
  async sendRequest(requesterId: number, targetId: number) {
    if (requesterId === targetId) throw new BadRequestException('CANNOT_FRIEND_SELF');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');

    // Si hay bloqueo en cualquier dirección, no se permite enviar solicitud.
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: requesterId, blockedId: targetId },
          { blockerId: targetId, blockedId: requesterId },
        ],
      },
      select: { id: true },
    });
    if (blocked) throw new ForbiddenException('BLOCKED');

    const current = await this.getStatus(requesterId, targetId);
    if (current.status === 'friends') throw new ConflictException('ALREADY_FRIENDS');
    if (current.status === 'request_sent') return current; // idempotente
    if (current.status === 'request_received' && current.friendshipId) {
      await this.prisma.friendship.update({
        where: { id: current.friendshipId },
        data: { status: 'accepted' },
      });
      return { status: 'friends' as FriendStatus, friendshipId: current.friendshipId };
    }
    const fr = await this.prisma.friendship.create({
      data: { requesterId, addresseeId: targetId, status: 'pending' },
    });
    return { status: 'request_sent' as FriendStatus, friendshipId: fr.id };
  }

  async sendRequestByUsername(requesterId: number, username: string) {
    const u = (username || '').trim().toLowerCase().replace(/^@/, '');
    if (!u) throw new BadRequestException('USERNAME_REQUIRED');
    const target = await this.prisma.user.findUnique({ where: { username: u }, select: { id: true } });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');
    return this.sendRequest(requesterId, target.id);
  }

  async accept(userId: number, friendshipId: string) {
    const fr = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!fr) throw new NotFoundException('REQUEST_NOT_FOUND');
    if (fr.addresseeId !== userId) throw new ForbiddenException('NOT_YOUR_REQUEST');
    if (fr.status !== 'accepted') {
      await this.prisma.friendship.update({ where: { id: friendshipId }, data: { status: 'accepted' } });
    }
    return { status: 'friends' as FriendStatus };
  }

  async reject(userId: number, friendshipId: string) {
    const fr = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!fr) throw new NotFoundException('REQUEST_NOT_FOUND');
    if (fr.addresseeId !== userId) throw new ForbiddenException('NOT_YOUR_REQUEST');
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { status: 'none' as FriendStatus };
  }

  // Quitar amistad o cancelar solicitud enviada (cualquier dirección).
  async remove(userId: number, otherUserId: number) {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherUserId },
          { requesterId: otherUserId, addresseeId: userId },
        ],
      },
    });
    return { status: 'none' as FriendStatus };
  }

  async listFriends(userId: number) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: userCardSelect }, addressee: { select: userCardSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => (r.requesterId === userId ? r.addressee : r.requester));
  }

  // Solicitudes entrantes (pendientes donde soy el destinatario).
  async listRequests(userId: number) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'pending', addresseeId: userId },
      include: { requester: { select: userCardSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ friendshipId: r.id, user: r.requester }));
  }

  async counts(userId: number) {
    const [friends, requests] = await Promise.all([
      this.prisma.friendship.count({ where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
      this.prisma.friendship.count({ where: { status: 'pending', addresseeId: userId } }),
    ]);
    return { friends, requests };
  }
}
