import { Module } from '@nestjs/common';
import { BotService } from './application/services/bot.service';
import { BotController } from './infrastructure/controllers/bot.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import telegramConfig from './infrastructure/config/bot.config';
import { BinanceHttpLib } from 'src/shared/binance';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forFeature(telegramConfig),
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('telegram.token')!,
      }),
    }),
    HttpModule,
  ],
  providers: [BotService, BotController, BinanceHttpLib],
  exports: [BotService],
})
export class BotTeleModule {}
