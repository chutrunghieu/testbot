import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { BinanceHttpLib } from 'src/shared/binance';
import { TrendEnum } from 'src/shared/enum/trend.enum';
import {
  ICandle,
  IPriceCurrent,
  ISwingPoint,
  ITrendLineParams,
} from 'src/shared/interfaces/binance.interface';
import { TSwingPoints, TTrendLines } from 'src/shared/type/data-type';
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
      const symbol = 'BTCUSDT';
      const {
        priceNow,
        getNowCandles,
        getLastCandles4h,
        getLastCandles1d,
        getCandles1d,
        getCandles4h,
        getCandles1h,
        getCandles15m,
      } = await this.getDataBinance(symbol);

      this.handleDataBinance(
        priceNow,
        getNowCandles,
        getLastCandles4h,
        getLastCandles1d,
        getCandles1d,
        getCandles4h,
        getCandles1h,
        getCandles15m,
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

    for (let i = lookback; i < candles.length - lookback - 1; i++) {
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

  calculateTrendLine(data: TSwingPoints): TTrendLines {
    const highs = data.swingHighs;
    const lows = data.swingLows;

    const [h1, h2] = highs;
    const xh1 = new Date(h1.time).getTime();
    const xh2 = new Date(h2.time).getTime();
    const yh1 = h1.value;
    const yh2 = h2.value;
    const slopeHigh = (yh2 - yh1) / (xh2 - xh1);
    const interceptHigh = yh1 - slopeHigh * xh1;

    const [l1, l2] = lows;
    const xl1 = new Date(l1.time).getTime();
    const xl2 = new Date(l2.time).getTime();
    const yl1 = l1.value;
    const yl2 = l2.value;
    const slopeLow = (yl2 - yl1) / (xl2 - xl1);
    const interceptLow = yl1 - slopeLow * xl1;

    return {
      resistance: { slope: slopeHigh, intercept: interceptHigh },
      support: { slope: slopeLow, intercept: interceptLow },
    };
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

  async getDataBinance(symbol: string) {
    const priceNow = await this.binance.getPriceNow(symbol);

    const getNowCandles = await this.binance.getNowCandles(symbol);

    const getLastCandles4h = await this.binance.getLastCandles(symbol, '4h');

    const getLastCandles1d = await this.binance.getLastCandles(symbol, '1d');

    const getCandles1d = await this.binance.getCandles(symbol, '1d', 90);

    const getCandles4h = await this.binance.getCandles(symbol, '4h', 120);

    const getCandles1h = await this.binance.getCandles(symbol, '1h', 200);

    const getCandles15m = await this.binance.getCandles(symbol, '15m', 300);
    return {
      priceNow,
      getNowCandles,
      getLastCandles4h,
      getLastCandles1d,
      getCandles1d,
      getCandles4h,
      getCandles1h,
      getCandles15m,
    };
  }

  handleDataBinance(
    priceNow: IPriceCurrent,
    getNowCandles: ICandle,
    getLastCandles4h: ICandle,
    getLastCandles1d: ICandle,
    getCandles1d: ICandle[],
    getCandles4h: ICandle[],
    getCandles1h: ICandle[],
    getCandles15m: ICandle[],
  ) {
    const timeframes = [
      { key: '1d', candles: getCandles1d, lookback: 6 },
      { key: '4h', candles: getCandles4h, lookback: 5 },
      { key: '1h', candles: getCandles1h, lookback: 4 },
      { key: '15m', candles: getCandles15m, lookback: 3 },
    ];

    const trends: any = {};

    for (const { key, candles, lookback } of timeframes) {
      const swing = this.findSwingPoints(candles, lookback);
      trends[`highestAndLowest${key}`] = swing;
      trends[`trend${key}`] = this.detectTrend(swing);
    }

    this.handleTrendLine(trends.highestAndLowest4h, getLastCandles4h);

    this.handleTrendLine(trends.highestAndLowest1d, getLastCandles1d);


    return {};
  }

  handleTrendLine(highestAndLowest: TSwingPoints, getLastCandles: ICandle) {
    const calculateTrendLine = this.calculateTrendLine(highestAndLowest);

    const priceTrendLineAtResistance = this.calculatePriceTrendLineAtTime(
      getLastCandles.time,
      calculateTrendLine.resistance.slope,
      calculateTrendLine.resistance.intercept,
    );

    const priceTrendLineAtSupport = this.calculatePriceTrendLineAtTime(
      getLastCandles.time,
      calculateTrendLine.support.slope,
      calculateTrendLine.support.intercept,
    );

    const touchResistance =
      Math.abs(getLastCandles.close - priceTrendLineAtResistance) /
        priceTrendLineAtResistance <
      0.005;

    const touchSupport =
      Math.abs(getLastCandles.close - priceTrendLineAtSupport) /
        priceTrendLineAtSupport <
      0.005;

    if (touchResistance) {
      console.log('Touch resistance 4h');
    }
    if (touchSupport) {
      console.log('Touch support 4h');
    }
    if (getLastCandles.close > priceTrendLineAtResistance) {
      console.log('breakout resistance 4h');
    }
    if (getLastCandles.close < priceTrendLineAtSupport) {
      console.log('breakdown support 4h');
    }
  }
}
