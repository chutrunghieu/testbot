import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SendMessageCommand } from './application/services/send-message.job';
import { BotService } from 'src/bot-tele/application/services/bot.service';
import { BinanceHttpLib } from 'src/shared/binance';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ScheduleModule.forRoot(), HttpModule],
  providers: [SendMessageCommand, BotService, BinanceHttpLib],
})
export class JobModule {}
