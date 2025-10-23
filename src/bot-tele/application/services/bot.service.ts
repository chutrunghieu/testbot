import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { BinanceHttpLib } from 'src/shared/binance';
import { TrendEnum } from 'src/shared/enum/trend.enum';
import {
  ICandle,
  ISwingPoint,
  ITrendLineParams,
} from 'src/shared/interfaces/binance.interface';
import { TSwingPoints } from 'src/shared/type/data-type';
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

      // Lấy dữ liệu nến gần nhất
      const getLastCandles = await this.binance.getLastCandles('BTCUSDT', '4h');

      const getCandles1d = await this.binance.getCandles('BTCUSDT', '1d', 90);

      const getCandles4h = await this.binance.getCandles('BTCUSDT', '4h', 120);

      const getCandles1h = await this.binance.getCandles('BTCUSDT', '1h', 200);

      const getCandles15m = await this.binance.getCandles(
        'BTCUSDT',
        '15m',
        300,
      );

      const highestAndLowest1d = this.findSwingPoints(getCandles1d, 1);

      const highestAndLowest4h = this.findSwingPoints(getCandles4h, 2);

      const highestAndLowest1h = this.findSwingPoints(getCandles1h, 2);

      const highestAndLowest15m = this.findSwingPoints(getCandles15m, 3);

      const trend4h = this.detectTrend(highestAndLowest4h);

      const trendDay = this.detectTrend(highestAndLowest1d);

      const trend1h = this.detectTrend(highestAndLowest1h);

      const trend15m = this.detectTrend(highestAndLowest15m);

      const calculateTrendline = this.calculateTrendline(
        highestAndLowest4h,
        trend4h.trend,
      );

      const priceAtTime = this.calculatePriceTrendLineAtTime(
        getLastCandles.time,
        calculateTrendline.slope,
        calculateTrendline.intercept,
      );

      console.log(priceAtTime);

      console.log('highestAndLowest4h:', highestAndLowest4h);

      console.log('getLastCandles:', getLastCandles);

      console.log(
        'trend 1d:',
        trendDay,
        'trend 4h:',
        trend4h,
        'trend 1h:',
        trend1h,
        'trend 15m:',
        trend15m,
      );

      // await this.bot.telegram.sendMessage(chatId, message);
      return true;
    } catch (err) {
      console.error('Telegram error:', err);
      return false;
    }
  }

  findSwingPoints(candles: ICandle[], lookback: number): TSwingPoints {
    const swingHighs: ISwingPoint[] = [];
    const swingLows: ISwingPoint[] = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
      let { high, low, time, close } = candles[i];

      if (String(time).startsWith('2025-10-10')) {
        low = close;
      }
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
    const recentSwingHighs = swingHighs.slice(-2);
    const recentSwingLows = swingLows.slice(-2);

    return { swingHighs: recentSwingHighs, swingLows: recentSwingLows };
  }

  detectTrend(
    data: { swingHighs: ISwingPoint[]; swingLows: ISwingPoint[] },
    nearRatio = 0.005,
  ): { trend: TrendEnum } {
    const { swingHighs, swingLows } = data;
    if (swingHighs.length < 2 || swingLows.length < 2)
      return { trend: TrendEnum.UNSPECIFIED };

    const highsNearEqual =
      Math.abs(swingHighs[1].value - swingHighs[0].value) /
        swingHighs[1].value <
      nearRatio;
    const lowsNearEqual =
      Math.abs(swingLows[1].value - swingLows[0].value) / swingLows[1].value <
      nearRatio;

    const highsIncreasing = swingHighs[1].value > swingHighs[0].value;
    const lowsIncreasing = swingLows[1].value > swingLows[0].value;
    const highsDecreasing = swingHighs[1].value < swingHighs[0].value;
    const lowsDecreasing = swingLows[1].value < swingLows[0].value;

    // nếu đỉnh hoặc đáy gần bằng nhau (sideway) -> không rõ xu hướng
    if (highsNearEqual && lowsNearEqual)
      return { trend: TrendEnum.FLAT_SIDEWAY };

    if (highsNearEqual || lowsNearEqual) {
      // nếu đỉnh gần bằng nhưng đáy tăng → wait breakout
      if (highsNearEqual && lowsIncreasing)
        return { trend: TrendEnum.WAIT_BREAKOUT };

      // nếu đỉnh gần bằng nhưng đáy giảm → wait breakdown
      if (highsNearEqual && lowsDecreasing)
        return { trend: TrendEnum.WAIT_BREAKDOWN };

      // nếu đáy gần bằng nhưng đỉnh tăng → có thể lên
      if (lowsNearEqual && highsIncreasing)
        return { trend: TrendEnum.MAYBE_UP };

      // nếu đáy gần bằng nhưng đỉnh giảm → có thể xuống
      if (lowsNearEqual && highsDecreasing)
        return { trend: TrendEnum.MAYBE_DOWN };
    }

    // Logic xác định xu hướng:
    if (highsIncreasing && lowsIncreasing) return { trend: TrendEnum.UP }; // cả đỉnh và đáy cùng tăng
    if (highsDecreasing && lowsDecreasing) return { trend: TrendEnum.DOWN }; // cả đỉnh và đáy cùng giảm

    // nếu đỉnh tăng nhưng đáy giảm → đang biến động, bất ổn
    if (highsIncreasing && lowsDecreasing)
      return { trend: TrendEnum.SIDEWAY_EXPANDING };

    // nếu đỉnh giảm nhưng đáy tăng → tích lũy
    if (highsDecreasing && lowsIncreasing)
      return { trend: TrendEnum.SIDEWAY_CONTRACTING };

    // fallback
    return { trend: TrendEnum.UNSPECIFIED };
  }

  calculateTrendline(data: TSwingPoints, trend: TrendEnum): ITrendLineParams {
    const p1 = trend === TrendEnum.UP ? data.swingHighs[0] : data.swingLows[0];
    const p2 = trend === TrendEnum.UP ? data.swingHighs[1] : data.swingLows[1];

    const x1 = new Date(p1.time).getTime();
    const x2 = new Date(p2.time).getTime();
    const y1 = p1.value;
    const y2 = p2.value;

    if (x1 === x2) {
      throw new Error('Hai điểm có cùng thời gian, không thể tính slope.');
    }

    const slope = (y2 - y1) / (x2 - x1);
    const intercept = y1 - slope * x1;

    return { slope, intercept };
  }

  calculatePriceTrendLineAtTime(
    time: string,
    slope: number,
    intercept: number,
  ): number {
    const x = new Date(time).getTime();
    const price = slope * x + intercept;
    return price;
  }
}
