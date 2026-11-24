import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

// Panel de moderación — solo admins (JwtAuthGuard + AdminGuard).
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  list(@Query('status') status: string) {
    return this.admin.listReports(status || 'pending');
  }

  @Get('reports/count')
  count() {
    return this.admin.pendingCount();
  }

  // action: 'dismiss' | 'remove_content' | 'ban_user'
  @Post('reports/:id/action')
  action(@Param('id') id: string, @Body('action') action: string) {
    return this.admin.actionReport(id, action);
  }

  @Delete('posts/:id')
  removePost(@Param('id') id: string) {
    return this.admin.removePost(id);
  }

  @Post('users/:userId/ban')
  ban(@Param('userId') userId: string, @Body('reason') reason: string) {
    return this.admin.banUser(Number(userId), reason);
  }

  @Post('users/:userId/unban')
  unban(@Param('userId') userId: string) {
    return this.admin.unbanUser(Number(userId));
  }
}
