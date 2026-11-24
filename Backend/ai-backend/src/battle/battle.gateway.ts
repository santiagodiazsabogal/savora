import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
  MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { BattleService, BattleEmitter } from './battle.service';
import { SocketUser } from './battle.types';
import { wsRateAllow } from '../common/ws-rate-limit';

function roomName(battleId: string) {
  return `battle:${battleId}`;
}

// Extrae mensajes de error legibles de las excepciones de Nest/Prisma
function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as any).message);
  return 'Unexpected error';
}

@WebSocketGateway({
  namespace: '/battle',
  cors: { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()) },
  // Las fotos en base64 pueden ser grandes — subir el buffer (default 1MB)
  maxHttpBufferSize: 12 * 1024 * 1024,
})
export class BattleGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, BattleEmitter
{
  private readonly logger = new Logger(BattleGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private battleService: BattleService,
    private jwtService: JwtService,
  ) {}

  afterInit() {
    // El service emite eventos de tiempo real (incluidos los de timers) a través de aquí
    this.battleService.registerEmitter(this);
  }

  // BattleEmitter — emite a todos los sockets de la sala
  emitToBattle(battleId: string, event: string, payload: unknown) {
    this.server.to(roomName(battleId)).emit(event, payload);
  }

  // =========================
  // 🔐 CONEXIÓN — autenticar JWT del handshake
  // =========================
  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('No token');
      const payload = await this.jwtService.verifyAsync<{ sub: number; email: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
      const user: SocketUser = { id: payload.sub, email: payload.email };
      client.data.user = user;
      this.logger.log(`Socket conectado: user ${user.id}`);
    } catch (e) {
      this.logger.warn(`Conexión rechazada: ${errorMessage(e)}`);
      client.emit('battle:error', { message: 'UNAUTHENTICATED' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user as SocketUser | undefined;
    if (user) this.logger.log(`Socket desconectado: user ${user.id}`);
    // No removemos al jugador en disconnect: puede reconectar dentro del lobby/partida.
  }

  private extractToken(client: Socket): string | null {
    // 1) handshake.auth.token (recomendado)  2) ?token=  3) header Authorization
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken) return authToken.replace(/^Bearer\s+/i, '');
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken) return queryToken;
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header) return header.replace(/^Bearer\s+/i, '');
    return null;
  }

  private getUser(client: Socket): SocketUser {
    const user = client.data?.user as SocketUser | undefined;
    if (!user) throw new Error('UNAUTHENTICATED');
    return user;
  }

  // =========================
  // 🎮 EVENTOS DEL CLIENTE
  // =========================
  @SubscribeMessage('battle:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { mode: string; mealTime?: string; language?: string; ingredients?: string[] },
  ) {
    try {
      const user = this.getUser(client);
      const { battleId, state } = await this.battleService.joinBattle(user, body ?? ({} as any));
      await client.join(roomName(battleId));
      client.emit('battle:matched', { battleId, state });
      return { ok: true, battleId };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  // Crear una partida PRIVADA: devuelve la sala con su código de invitación
  @SubscribeMessage('battle:create')
  async onCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { mode: string; mealTime?: string; language?: string; ingredients?: string[]; recipeOptionId?: string },
  ) {
    try {
      const user = this.getUser(client);
      const { battleId, state } = await this.battleService.createPrivateBattle(user, body ?? ({} as any));
      await client.join(roomName(battleId));
      client.emit('battle:matched', { battleId, state });
      return { ok: true, battleId };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  // Unirse a una partida PRIVADA con el código compartido
  @SubscribeMessage('battle:joinByCode')
  async onJoinByCode(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code: string },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.code) throw new Error('code is required');
      const { battleId, state } = await this.battleService.joinByCode(user, body.code);
      await client.join(roomName(battleId));
      client.emit('battle:matched', { battleId, state });
      return { ok: true, battleId };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  // El host reparte cursos/equipos (Buffet/Equipos)
  @SubscribeMessage('battle:assign')
  async onAssign(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string; assignments: { userId: number; team?: number | null; courseLabel?: string }[] },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      const { state } = await this.battleService.assignRoles(user, body.battleId, body.assignments ?? []);
      return { ok: true, state };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  // El host arranca la partida privada
  @SubscribeMessage('battle:start')
  async onStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      const { state } = await this.battleService.startBattleByHost(user, body.battleId);
      return { ok: true, state };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  @SubscribeMessage('battle:ready')
  async onReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      // Asegurar que el socket esté en la sala (por si reconectó)
      await client.join(roomName(body.battleId));
      const { state } = await this.battleService.setReady(user, body.battleId);
      return { ok: true, state };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  @SubscribeMessage('battle:leave')
  async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      await this.battleService.leaveBattle(user, body.battleId);
      await client.leave(roomName(body.battleId));
      return { ok: true };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  @SubscribeMessage('battle:submitPhoto')
  async onSubmitPhoto(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string; photoBase64: string },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      // Tope por socket: subir/moderar fotos es costoso (Storage + query pesada)
      if (!wsRateAllow(client, 'submitPhoto', 4, 60_000)) throw new Error('RATE_LIMITED');
      await this.battleService.submitPhoto(user, body.battleId, body.photoBase64);
      return { ok: true };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }

  // Chat con el chef durante la cocción (respuesta por ack, privada al jugador)
  @SubscribeMessage('battle:askChef')
  async onAskChef(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string; question: string; stepContext?: string },
  ) {
    try {
      const user = this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      // Tope por socket: cada pregunta es una llamada a OpenAI (el chat no consume
      // el límite de negocio, pero sí debe tener freno anti-spam).
      if (!wsRateAllow(client, 'askChef', 8, 60_000)) throw new Error('RATE_LIMITED');
      const reply = await this.battleService.askChef(user, body.battleId, body.question, body.stepContext);
      return { ok: true, reply };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  // Reconexión: pedir el estado actual y reincorporarse a la sala
  @SubscribeMessage('battle:state')
  async onState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { battleId: string },
  ) {
    try {
      this.getUser(client);
      if (!body?.battleId) throw new Error('battleId is required');
      await client.join(roomName(body.battleId));
      const state = await this.battleService.getState(body.battleId);
      client.emit('battle:state', { battleId: body.battleId, state });
      return { ok: true, state };
    } catch (e) {
      client.emit('battle:error', { message: errorMessage(e) });
      return { ok: false, error: errorMessage(e) };
    }
  }
}
