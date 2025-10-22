import { Controller } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { BotService } from 'src/bot-tele/application/services/bot.service';
import { Telegraf } from 'telegraf';

@Controller()
export class BotController {
  constructor(
    private readonly botService: BotService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}
}
