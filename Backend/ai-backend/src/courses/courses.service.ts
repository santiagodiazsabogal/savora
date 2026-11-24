import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EnrollCourseDto, ScheduleLessonDto } from './dto/courses.dto'
import {
  SPECIALIZATIONS,
  FREE_MAX_ACTIVE_COURSES,
  UNLOCK_AFTER_COURSES,
  computeAppLevel,
  getLevelWarning,
} from './courses.constants'
import { isChef } from '../common/plans'

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CATÁLOGO agrupado por nivel con estado de inscripción ───────────
  async getCatalog(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cookingLevel: true, coursesCompleted: true },
    })
    if (!user) throw new NotFoundException('User not found')

    const courses = await this.prisma.courseCatalog.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { lessons: true } },
        enrollments: {
          where: { userId },
          include: { lessons: { select: { completedAt: true } } },
        },
      },
    })

    const mapCourse = (c: (typeof courses)[number]) => {
      const enrollment = c.enrollments[0] ?? null
      const lessonsTotal = c._count.lessons
      const lessonsDone = enrollment
        ? enrollment.lessons.filter((l) => l.completedAt).length
        : 0
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle,
        emoji: c.emoji,
        cookingLevel: c.cookingLevel,
        category: c.category,
        lessonCount: lessonsTotal,
        isRecommended: c.cookingLevel === user.cookingLevel,
        isLocked: c.unlockAfterCount > 0 && user.coursesCompleted < c.unlockAfterCount,
        levelWarning: getLevelWarning(user.cookingLevel, c.cookingLevel),
        enrollment: enrollment
          ? {
              userCourseId: enrollment.id,
              startedAt: enrollment.startedAt,
              completedAt: enrollment.completedAt,
              lessonsTotal,
              lessonsDone,
              progress: lessonsTotal > 0 ? lessonsDone / lessonsTotal : 0,
            }
          : null,
      }
    }

    const mapped = courses.map(mapCourse)
    return {
      userCookingLevel: user.cookingLevel,
      coursesCompleted: user.coursesCompleted,
      unlockProgress: Math.min(user.coursesCompleted, UNLOCK_AFTER_COURSES),
      beginner: mapped.filter((c) => c.cookingLevel === 'beginner'),
      intermediate: mapped.filter((c) => c.cookingLevel === 'intermediate'),
      advanced: mapped.filter((c) => c.cookingLevel === 'advanced'),
    }
  }

  // ── INSCRIBIRSE a un curso ──────────────────────────────────────────
  async enroll(userId: number, dto: EnrollCourseDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, coursesCompleted: true },
    })
    if (!user) throw new NotFoundException('User not found')

    // Cursos = exclusivo del plan CHEF (el tier tope). FREE y PRO no acceden.
    if (!isChef(user.plan)) throw new ForbiddenException('CHEF_ONLY')

    const catalog = await this.prisma.courseCatalog.findUnique({
      where: { id: dto.catalogId },
      include: { lessons: { select: { id: true } } },
    })
    if (!catalog) throw new NotFoundException('Course not found')

    // Curso bloqueado (generativo) hasta completar N cursos base
    if (catalog.unlockAfterCount > 0 && user.coursesCompleted < catalog.unlockAfterCount) {
      throw new ForbiddenException('COURSE_LOCKED')
    }

    // Ya inscrito
    const existing = await this.prisma.userCourse.findUnique({
      where: { userId_catalogId: { userId, catalogId: catalog.id } },
    })
    if (existing) throw new BadRequestException('ALREADY_ENROLLED')

    // Límite FREE: máximo 2 cursos activos (sin completar) simultáneos
    if (user.plan === 'FREE') {
      const activeCount = await this.prisma.userCourse.count({
        where: { userId, completedAt: null },
      })
      if (activeCount >= FREE_MAX_ACTIVE_COURSES) throw new ForbiddenException('FREE_LIMIT')
    }

    const userCourse = await this.prisma.$transaction(async (tx) => {
      const uc = await tx.userCourse.create({ data: { userId, catalogId: catalog.id } })
      await tx.userCourseLesson.createMany({
        data: catalog.lessons.map((l) => ({ userCourseId: uc.id, catalogLessonId: l.id })),
      })
      return uc
    })

    return this.getCourseDetail(userId, userCourse.id)
  }

  // ── MIS CURSOS con progreso ─────────────────────────────────────────
  async getMyEnrolled(userId: number) {
    const enrolled = await this.prisma.userCourse.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      include: {
        catalog: true,
        lessons: { select: { completedAt: true } },
      },
    })

    return enrolled.map((uc) => {
      const lessonsTotal = uc.lessons.length
      const lessonsDone = uc.lessons.filter((l) => l.completedAt).length
      return {
        userCourseId: uc.id,
        startedAt: uc.startedAt,
        completedAt: uc.completedAt,
        lessonsTotal,
        lessonsDone,
        progress: lessonsTotal > 0 ? lessonsDone / lessonsTotal : 0,
        catalog: {
          id: uc.catalog.id,
          slug: uc.catalog.slug,
          title: uc.catalog.title,
          subtitle: uc.catalog.subtitle,
          emoji: uc.catalog.emoji,
          cookingLevel: uc.catalog.cookingLevel,
          category: uc.catalog.category,
        },
      }
    })
  }

  // ── DETALLE de un curso inscrito con todas sus lecciones ────────────
  async getCourseDetail(userId: number, userCourseId: string) {
    const uc = await this.prisma.userCourse.findFirst({
      where: { id: userCourseId, userId },
      include: {
        catalog: true,
        lessons: {
          include: { catalogLesson: true },
          orderBy: { catalogLesson: { order: 'asc' } },
        },
      },
    })
    if (!uc) throw new NotFoundException('Enrolled course not found')

    return {
      userCourseId: uc.id,
      startedAt: uc.startedAt,
      completedAt: uc.completedAt,
      catalog: {
        id: uc.catalog.id,
        slug: uc.catalog.slug,
        title: uc.catalog.title,
        subtitle: uc.catalog.subtitle,
        emoji: uc.catalog.emoji,
        cookingLevel: uc.catalog.cookingLevel,
        category: uc.catalog.category,
      },
      lessons: uc.lessons.map((l) => ({
        userLessonId: l.id,
        order: l.catalogLesson.order,
        title: l.catalogLesson.title,
        description: l.catalogLesson.description,
        difficulty: l.catalogLesson.difficulty,
        hasPrereqWarning: l.catalogLesson.hasPrereqWarning,
        prereqMessage: l.catalogLesson.prereqMessage,
        scheduledAt: l.scheduledAt,
        completedAt: l.completedAt,
      })),
    }
  }

  // ── AGENDAR una lección en el calendario ────────────────────────────
  async scheduleLesson(userId: number, userLessonId: string, dto: ScheduleLessonDto) {
    const lesson = await this.prisma.userCourseLesson.findFirst({
      where: { id: userLessonId, userCourse: { userId } },
    })
    if (!lesson) throw new NotFoundException('Lesson not found')

    const scheduledAt = new Date(dto.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('Invalid date')
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future')
    }

    const updated = await this.prisma.userCourseLesson.update({
      where: { id: lesson.id },
      data: { scheduledAt, reminderSent: false },
    })

    return { userLessonId: updated.id, scheduledAt: updated.scheduledAt }
  }

  // ── COMPLETAR una lección (level up, especialidad, fin de curso) ─────
  async completeLesson(userId: number, userLessonId: string) {
    const lesson = await this.prisma.userCourseLesson.findFirst({
      where: { id: userLessonId, userCourse: { userId } },
      include: {
        userCourse: { include: { catalog: { select: { category: true } } } },
        catalogLesson: { select: { title: true } },
      },
    })
    if (!lesson) throw new NotFoundException('Lesson not found')
    if (lesson.completedAt) throw new BadRequestException('ALREADY_COMPLETED')

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lessonsCompleted: true, specializations: true },
    })
    if (!user) throw new NotFoundException('User not found')

    const prevLessons = user.lessonsCompleted
    const newLessons = prevLessons + 1

    // ¿Esta es la última lección pendiente del curso?
    const remaining = await this.prisma.userCourseLesson.count({
      where: { userCourseId: lesson.userCourseId, completedAt: null, id: { not: lesson.id } },
    })
    const courseCompleted = remaining === 0
    const category = lesson.userCourse.catalog.category
    const willUnlockSpec = courseCompleted && !user.specializations.includes(category)
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.userCourseLesson.update({
        where: { id: lesson.id },
        data: { completedAt: now },
      })
      await tx.user.update({
        where: { id: userId },
        data: {
          lessonsCompleted: { increment: 1 },
          ...(courseCompleted ? { coursesCompleted: { increment: 1 } } : {}),
          ...(willUnlockSpec ? { specializations: { push: category } } : {}),
        },
      })
      if (courseCompleted) {
        await tx.userCourse.update({
          where: { id: lesson.userCourseId },
          data: { completedAt: now },
        })
      }
    })

    const prevLevel = computeAppLevel(prevLessons)
    const newLevel = computeAppLevel(newLessons)
    const levelUp = prevLevel.current.key !== newLevel.current.key

    return {
      userLessonId: lesson.id,
      lessonTitle: lesson.catalogLesson.title,
      completedAt: now,
      courseCompleted,
      levelUp,
      ...(levelUp ? { previousLevel: prevLevel.current, newLevel: newLevel.current } : {}),
      currentLevel: newLevel.current,
      levelProgress: {
        progressToNext: newLevel.progressToNext,
        neededForNext: newLevel.neededForNext,
        next: newLevel.next,
      },
      ...(willUnlockSpec
        ? { unlockedSpecialization: { category, ...SPECIALIZATIONS[category] } }
        : {}),
      totalLessonsCompleted: newLessons,
    }
  }

  // ── CALENDARIO: próximos 7 días agrupados por día ───────────────────
  async getWeekSchedule(userId: number) {
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const lessons = await this.prisma.userCourseLesson.findMany({
      where: {
        userCourse: { userId },
        completedAt: null,
        scheduledAt: { gte: now, lte: weekEnd },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        catalogLesson: { select: { title: true, difficulty: true } },
        userCourse: { include: { catalog: { select: { title: true, emoji: true } } } },
      },
    })

    const byDay = new Map<string, any[]>()
    for (const l of lessons) {
      const day = l.scheduledAt!.toISOString().slice(0, 10) // YYYY-MM-DD
      const entry = {
        userLessonId: l.id,
        scheduledAt: l.scheduledAt,
        title: l.catalogLesson.title,
        difficulty: l.catalogLesson.difficulty,
        courseTitle: l.userCourse.catalog.title,
        courseEmoji: l.userCourse.catalog.emoji,
      }
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(entry)
    }

    return Array.from(byDay.entries()).map(([date, items]) => ({ date, lessons: items }))
  }

  // ── PROGRESO: nivel, especialidades, estadísticas ───────────────────
  async getProgress(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lessonsCompleted: true,
        coursesCompleted: true,
        specializations: true,
        cookingLevel: true,
      },
    })
    if (!user) throw new NotFoundException('User not found')

    const level = computeAppLevel(user.lessonsCompleted)
    const [activeCourses, completedCourses] = await Promise.all([
      this.prisma.userCourse.count({ where: { userId, completedAt: null } }),
      this.prisma.userCourse.count({ where: { userId, completedAt: { not: null } } }),
    ])

    return {
      cookingLevel: user.cookingLevel,
      currentLevel: level.current,
      nextLevel: level.next,
      levelProgress: {
        progressToNext: level.progressToNext,
        neededForNext: level.neededForNext,
      },
      lessonsCompleted: user.lessonsCompleted,
      coursesCompleted: user.coursesCompleted,
      unlockProgress: Math.min(user.coursesCompleted, UNLOCK_AFTER_COURSES),
      specializations: user.specializations.map((cat) => ({
        category: cat,
        ...(SPECIALIZATIONS[cat] ?? { name: cat, emoji: '🍽️' }),
      })),
      stats: { activeCourses, completedCourses },
    }
  }

  // ── ELIMINAR inscripción (solo si no está completado) ───────────────
  async dropCourse(userId: number, userCourseId: string) {
    const uc = await this.prisma.userCourse.findFirst({
      where: { id: userCourseId, userId },
      select: { id: true, completedAt: true },
    })
    if (!uc) throw new NotFoundException('Enrolled course not found')
    if (uc.completedAt) throw new BadRequestException('Cannot drop a completed course')

    await this.prisma.userCourse.delete({ where: { id: uc.id } })
    return { success: true }
  }

  // ── SCHEDULER: lecciones que necesitan recordatorio ─────────────────
  async getLessonsNeedingReminder(windowMinutes: number) {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000)

    return this.prisma.userCourseLesson.findMany({
      where: {
        reminderSent: false,
        completedAt: null,
        scheduledAt: { gte: now, lte: windowEnd },
      },
      include: {
        catalogLesson: { select: { title: true } },
        userCourse: {
          include: {
            user: { select: { id: true, pushToken: true } },
            catalog: { select: { title: true, emoji: true } },
          },
        },
      },
    })
  }

  async markReminderSent(userLessonId: string) {
    await this.prisma.userCourseLesson.update({
      where: { id: userLessonId },
      data: { reminderSent: true },
    })
  }
}
