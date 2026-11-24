import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('chat')
export class ChatController {

  constructor(private chatService: ChatService) {}

  // 💬 Enviar mensaje
  @UseGuards(JwtAuthGuard)
  @Post('message')
  async sendMessage(
    @Body('message') message: string,
    @Body('conversationId') conversationId: number,
    @Body('stepContext') stepContext: string | undefined,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('User not authenticated');
    if (!message?.trim()) throw new BadRequestException('The message cannot be empty');
    if (message.trim().length > 1000) throw new BadRequestException('Message too long (max 1000 characters)');
    if (!conversationId) throw new BadRequestException('conversationId is required');

    return this.chatService.handleMessage(req.user.id, message, conversationId, stepContext);
  }

  // 📚 Listar conversaciones del usuario
  @UseGuards(JwtAuthGuard)
  @Get('conversations')
  async getConversations(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Usuario no autenticado');

    return this.chatService.getUserConversations(req.user.id);
  }

  // 📜 Ver mensajes de una conversación
  @UseGuards(JwtAuthGuard)
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id', ParseIntPipe) conversationId: number,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Usuario no autenticado');

    return this.chatService.getConversationMessages(req.user.id, conversationId);
  }
}