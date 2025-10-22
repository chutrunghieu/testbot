import { Module } from '@nestjs/common';
import { BotTeleModule } from './bot-tele/bot-tele.module';
import { JobModule } from './job/job.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    BotTeleModule,
    JobModule,
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
