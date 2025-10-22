import { registerAs } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
export default registerAs('telegram', () => ({
  token: process.env.BOT_TOKEN,
}));
