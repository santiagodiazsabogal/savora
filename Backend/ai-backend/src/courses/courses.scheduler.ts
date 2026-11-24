import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CoursesService } from './courses.service'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class CoursesScheduler {
  private readonly logger = new Logger(CoursesScheduler.name)

  constructor(
    private readonly coursesService: CoursesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Cada 5 min: busca lecciones agendadas dentro de los próximos ~30 min
  // que aún no tienen recordatorio enviado y dispara la push.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendLessonReminders() {
    // Ventana de 35 min = 30 (antelación) + 5 (margen del intervalo del cron)
    const lessons = await this.coursesService.getLessonsNeedingReminder(35)
    if (lessons.length === 0) return

    for (const lesson of lessons) {
      // Marcamos primero para no reenviar aunque la push falle.
      await this.coursesService.markReminderSent(lesson.id)

      const pushToken = lesson.userCourse.user.pushToken
      if (!pushToken) continue

      await this.notificationsService.sendLessonReminder(
        pushToken,
        lesson.catalogLesson.title,
        lesson.userCourse.catalog.emoji,
        lesson.userCourse.catalog.title,
      )
    }

    this.logger.log(`Procesado(s) ${lessons.length} recordatorio(s) de lección`)
  }
}
