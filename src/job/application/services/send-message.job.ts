import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BotService } from 'src/bot-tele/application/services/bot.service';

@Injectable()
export class SendMessageCommand {
  constructor(private readonly botService: BotService) {}

  private readonly logger = new Logger(SendMessageCommand.name);

  @Cron('* * * * *')
  async handleCron() {
    console.log('Sending scheduled message to Telegram...');
    await this.botService.sendMessage(
      process.env.CHAT_ID!,
      'Scheduled message from NestJS Bot!',
    );
    this.logger.log('Sent scheduled message to Telegram');
  }
}
