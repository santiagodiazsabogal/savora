import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { OpenaiModule } from './ai/openai.module';
import { ChatModule } from './chat/chat.module';
import { RecipesModule } from './recipes/recipes.module';
import { TtsModule } from './tts/tts.module';
import { BattleModule } from './battle/battle.module';
import { CoursesModule } from './courses/courses.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SocialModule } from './social/social.module';
import { CoursesAiModule } from './courses-ai/courses-ai.module';
import { StatsModule } from './stats/stats.module';
import { BadgesModule } from './badges/badges.module';
import { MissionsModule } from './missions/missions.module';
import { ClansModule } from './clans/clans.module';
import { FriendsModule } from './friends/friends.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { MarketModule } from './market/market.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 🔥 CLAVE
    }),
    ScheduleModule.forRoot(),
    // Rate limiting (config global). El ThrottlerGuard se aplica POR CONTROLADOR
    // (auth/recetas) — NO como APP_GUARD global, para no chocar con los gateways WS.
    // Default: 120 req/min por IP. (Detrás de proxy hace falta trust proxy para la IP real.)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    UsersModule,
    AuthModule,
    OpenaiModule,
    ChatModule,
    RecipesModule,
    TtsModule,
    BattleModule,
    CoursesModule,
    NotificationsModule,
    SocialModule,
    CoursesAiModule,
    StatsModule,
    BadgesModule,
    MissionsModule,
    ClansModule,
    FriendsModule,
    AdminModule,
    BillingModule,
    MarketModule,
    WaitlistModule,
  ],
  controllers: [AppController],
})
export class AppModule {}