import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function isValidExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token)
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── Registrar el push token del usuario (desde la app móvil) ────────
  async registerToken(userId: number, token: string) {
    if (!token || !isValidExpoToken(token)) {
      throw new BadRequestException('Invalid Expo push token')
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    })
    return { success: true }
  }

  async removeToken(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: null },
    })
    return { success: true }
  }

  // ── Enviar una push genérica vía Expo ───────────────────────────────
  // Devuelve true si Expo aceptó el envío; nunca lanza (no debe tumbar el scheduler).
  async sendPush(
    to: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!isValidExpoToken(to)) {
      this.logger.warn(`Push token inválido, se omite: ${to}`)
      return false
    }

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, title, body, sound: 'default', data: data ?? {} }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        this.logger.error(`Expo push error ${res.status}: ${errBody}`)
        return false
      }
      return true
    } catch (err) {
      this.logger.error(`Expo push network error: ${String(err)}`)
      return false
    }
  }

  // ── Recordatorio de lección (lo usa el scheduler) ───────────────────
  async sendLessonReminder(
    pushToken: string,
    lessonTitle: string,
    courseEmoji: string,
    courseTitle: string,
  ): Promise<boolean> {
    return this.sendPush(
      pushToken,
      `${courseEmoji} ¡Tu clase está por empezar!`,
      `En 30 minutos: "${lessonTitle}" de ${courseTitle}. ¡Prepárate para cocinar! 👨‍🍳`,
      { type: 'lesson_reminder' },
    )
  }
}
