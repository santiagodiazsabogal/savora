import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ClansService } from './clans.service';
import { wsRateAllow } from '../common/ws-rate-limit';

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

const room = (clanId: string) => `clan:${clanId}`;

@WebSocketGateway({
  namespace: '/clans',
  cors: {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  },
  // Permite payloads con imágenes en base64 (comprimidas en el cliente).
  maxHttpBufferSize: 6e6,
})
export class ClansGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('ClansGateway');

  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    @Inject(forwardRef(() => ClansService)) private readonly clans: ClansService,
  ) {}

  // ── Conexión / autenticación ───────────────────────────────────────────────
  async handleConnection(socket: Socket) {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers?.authorization as string | undefined);
      const token = raw?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('no token');
      const payload: any = this.jwt.verify(token, { secret: process.env.JWT_SECRET });
      socket.data.userId = payload.sub;
      socket.data.nombre = await this.clans.getDisplayName(payload.sub);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    // Avisa a las salas en las que estaba que dejó de escribir.
    const userId = socket.data.userId;
    if (!userId) return;
    for (const r of socket.rooms) {
      if (r.startsWith('clan:')) socket.to(r).emit('stopTyping', { userId });
    }
  }

  // ── Salas ───────────────────────────────────────────────────────────────────
  @SubscribeMessage('joinClan')
  async onJoinClan(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { clanId: string },
  ) {
    const userId = socket.data.userId;
    if (!userId || !data?.clanId) return;
    const isMember = await this.clans.isMember(userId, data.clanId);
    if (!isMember) {
      socket.emit('chatError', { message: 'You are not a member of this clan' });
      return;
    }
    socket.join(room(data.clanId));
    socket.emit('joined', { clanId: data.clanId });
  }

  @SubscribeMessage('leaveClan')
  onLeaveClan(@ConnectedSocket() socket: Socket, @MessageBody() data: { clanId: string }) {
    if (data?.clanId) socket.leave(room(data.clanId));
  }

  // ── Mensajes ──────────────────────────────────────────────────────────────
  @SubscribeMessage('sendMessage')
  async onSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { clanId: string; contenido?: string; imagenUrl?: string; replyToId?: string; clientId?: string },
  ) {
    const userId = socket.data.userId;
    if (!userId || !data?.clanId) return;
    try {
      // Tope por socket: cada mensaje pasa por moderación (y las fotos por Storage).
      if (!wsRateAllow(socket, 'sendMessage', 15, 30_000)) {
        socket.emit('chatError', { message: 'RATE_LIMITED', clientId: data.clientId });
        return;
      }
      await this.clans.sendMessage(userId, data.clanId, data.contenido ?? '', {
        imagenUrl: data.imagenUrl,
        replyToId: data.replyToId,
        clientId: data.clientId,
        // Ya cacheado en la conexión (handleConnection) → evita el join a User
        // en el service para conocer el nombre del autor del mensaje.
        nombre: socket.data.nombre,
      });
      // La emisión a la sala la hace el servicio (emitToClan).
      socket.to(room(data.clanId)).emit('stopTyping', { userId });
    } catch (e: any) {
      // Devuelve el clientId para que el cliente quite su mensaje optimista al fallar.
      socket.emit('chatError', { message: e?.message ?? 'Could not send the message', clientId: data.clientId });
    }
  }

  @SubscribeMessage('react')
  async onReact(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { clanId: string; messageId: string; emoji: string },
  ) {
    const userId = socket.data.userId;
    if (!userId || !data?.clanId || !data?.messageId || !data?.emoji) return;
    try {
      if (!wsRateAllow(socket, 'react', 30, 30_000)) return; // anti-spam silencioso
      await this.clans.toggleReaction(userId, data.clanId, data.messageId, data.emoji);
    } catch (e: any) {
      socket.emit('chatError', { message: e?.message ?? 'No se pudo reaccionar' });
    }
  }

  // ── Indicador "escribiendo…" ────────────────────────────────────────────────
  @SubscribeMessage('typing')
  onTyping(@ConnectedSocket() socket: Socket, @MessageBody() data: { clanId: string }) {
    const userId = socket.data.userId;
    if (!userId || !data?.clanId) return;
    // Solo puede emitir a la sala quien pasó por joinClan (que valida membresía).
    if (!socket.rooms.has(room(data.clanId))) return;
    socket.to(room(data.clanId)).emit('typing', { userId, nombre: socket.data.nombre });
  }

  @SubscribeMessage('stopTyping')
  onStopTyping(@ConnectedSocket() socket: Socket, @MessageBody() data: { clanId: string }) {
    const userId = socket.data.userId;
    if (!userId || !data?.clanId) return;
    if (!socket.rooms.has(room(data.clanId))) return;
    socket.to(room(data.clanId)).emit('stopTyping', { userId });
  }

  // ── API para el servicio (emisión desde lógica de negocio) ──────────────────
  emitToClan(clanId: string, event: string, payload: any) {
    this.server?.to(room(clanId)).emit(event, payload);
  }
}
