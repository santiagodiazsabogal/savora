import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CoursesService } from './courses.service'
import { EnrollCourseDto, ScheduleLessonDto } from './dto/courses.dto'

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get('catalog')
  getCatalog(@Req() req: Request & { user?: { id?: number } }) {
    const userId = this.requireUser(req)
    return this.coursesService.getCatalog(userId)
  }

  @Get('progress')
  getProgress(@Req() req: Request & { user?: { id?: number } }) {
    const userId = this.requireUser(req)
    return this.coursesService.getProgress(userId)
  }

  @Get('schedule')
  getWeekSchedule(@Req() req: Request & { user?: { id?: number } }) {
    const userId = this.requireUser(req)
    return this.coursesService.getWeekSchedule(userId)
  }

  @Get('my')
  getMyEnrolled(@Req() req: Request & { user?: { id?: number } }) {
    const userId = this.requireUser(req)
    return this.coursesService.getMyEnrolled(userId)
  }

  @Get('my/:userCourseId')
  getCourseDetail(
    @Param('userCourseId') userCourseId: string,
    @Req() req: Request & { user?: { id?: number } },
  ) {
    const userId = this.requireUser(req)
    return this.coursesService.getCourseDetail(userId, userCourseId)
  }

  @Post('enroll')
  enroll(
    @Body() dto: EnrollCourseDto,
    @Req() req: Request & { user?: { id?: number } },
  ) {
    const userId = this.requireUser(req)
    return this.coursesService.enroll(userId, dto)
  }

  @Patch('lessons/:userLessonId/schedule')
  scheduleLesson(
    @Param('userLessonId') userLessonId: string,
    @Body() dto: ScheduleLessonDto,
    @Req() req: Request & { user?: { id?: number } },
  ) {
    const userId = this.requireUser(req)
    return this.coursesService.scheduleLesson(userId, userLessonId, dto)
  }

  @Patch('lessons/:userLessonId/complete')
  completeLesson(
    @Param('userLessonId') userLessonId: string,
    @Req() req: Request & { user?: { id?: number } },
  ) {
    const userId = this.requireUser(req)
    return this.coursesService.completeLesson(userId, userLessonId)
  }

  @Delete('my/:userCourseId')
  dropCourse(
    @Param('userCourseId') userCourseId: string,
    @Req() req: Request & { user?: { id?: number } },
  ) {
    const userId = this.requireUser(req)
    return this.coursesService.dropCourse(userId, userCourseId)
  }

  private requireUser(req: Request & { user?: { id?: number } }): number {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated')
    return req.user.id
  }
}
