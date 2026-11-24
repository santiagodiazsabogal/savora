import { IsString, IsNotEmpty, IsDateString } from 'class-validator'

export class EnrollCourseDto {
  @IsString()
  @IsNotEmpty()
  catalogId!: string
}

export class ScheduleLessonDto {
  @IsDateString()
  scheduledAt!: string
}
