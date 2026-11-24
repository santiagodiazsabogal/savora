import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';
import { BadgesModule } from '../badges/badges.module';
import { FriendsModule } from '../friends/friends.module';
import { ClansModule } from '../clans/clans.module';
import { StorageModule } from '../storage/storage.module';


@Module({
  imports: [PrismaModule, StatsModule, BadgesModule, FriendsModule, ClansModule, StorageModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
