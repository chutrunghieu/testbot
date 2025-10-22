import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { BinanceHttpLib } from 'src/shared/binance';
import { ICandle, ISwingPoint } from 'src/shared/interfaces/binance.interface';
import { Telegraf } from 'telegraf';

@Injectable()
export class BotService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly config: ConfigService,
    protected readonly binance: BinanceHttpLib,
  ) {}

  async sendMessage(chatId: string | number, message: string) {
    try {
      const price = await this.binance.getPrice('BTCUSDT');

      // const getCandles4h = await this.binance.getCandles('BTCUSDT', '4h', 42);

      const getCandles1d = await this.binance.getCandles('BTCUSDT', '1d', 30);

      const data = this.findSwingPoints(getCandles1d);
      console.log(data, '1d candles');

      await this.bot.telegram.sendMessage(chatId, message);
      return true;
    } catch (err) {
      console.error('Telegram error:', err);
      return false;
    }
  }

  async calculateTrendline(candles: ICandle[]) {
    // Lấy danh sách đỉnh và đáy
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    // Tìm 2 đáy thấp nhất gần nhất (cho uptrend)
    const sortedLows = [...lows]
      .map((v, i) => ({ v, i }))
      .sort((a, b) => a.v - b.v);
    const [low1, low2] = sortedLows.slice(0, 2);

    // Tính đường trend tăng
    const slopeUp = (low2.v - low1.v) / (low2.i - low1.i);
    const interceptUp = low1.v - slopeUp * low1.i;

    // Tìm 2 đỉnh cao nhất gần nhất (cho downtrend)
    const sortedHighs = [...highs]
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v);
    const [high1, high2] = sortedHighs.slice(0, 2);

    const slopeDown = (high2.v - high1.v) / (high2.i - high1.i);
    const interceptDown = high1.v - slopeDown * high1.i;

    // Đánh giá xu hướng hiện tại
    const trend =
      slopeUp > Math.abs(slopeDown)
        ? 'uptrend'
        : slopeDown < 0
          ? 'downtrend'
          : 'sideway';

    return {
      uptrend: {
        slope: slopeUp,
        intercept: interceptUp,
        from: low1.i,
        to: low2.i,
      },
      downtrend: {
        slope: slopeDown,
        intercept: interceptDown,
        from: high1.i,
        to: high2.i,
      },
      trend,
    };
  }

  findSwingPoints(candles: ICandle[], lookback = 2) {
    const swingHighs: ISwingPoint[] = [];
    const swingLows: ISwingPoint[] = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
      const { high, low, time } = candles[i];

      // 🔺 Kiểm tra đỉnh
      const isHigh =
        candles.slice(i - lookback, i).every((c) => c.high < high) &&
        candles.slice(i + 1, i + 1 + lookback).every((c) => c.high < high);

      // 🔻 Kiểm tra đáy
      const isLow =
        candles.slice(i - lookback, i).every((c) => c.low > low) &&
        candles.slice(i + 1, i + 1 + lookback).every((c) => c.low > low);

      if (isHigh) swingHighs.push({ index: i, time, value: high });
      if (isLow) swingLows.push({ index: i, time, value: low });
    }

    return { swingHighs, swingLows };
  }

  getTrendlineFromSwings(swings: { index: number; value: number }[]) {
  if (swings.length < 2) return null;
  const lastTwo = swings.slice(-2);
  const [p1, p2] = lastTwo;

  const slope = (p2.value - p1.value) / (p2.index - p1.index);
  const intercept = p1.value - slope * p1.index;

  return { slope, intercept, from: p1.index, to: p2.index };
}
}
