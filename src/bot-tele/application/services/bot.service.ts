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

  public findSwingPoints(
    candles: ICandle[],
    lookback: number,
    key: string,
  ): TSwingPoints {
    const swingHighs: ISwingPoint[] = [];
    const swingLows: ISwingPoint[] = [];

    if (candles.length < lookback * 2 + 2) {
      return { swingHighs, swingLows };
    }
    // ❌ Bỏ nến cuối (chưa hoàn thiện)
    const effectiveCandles = candles.slice(0, -1);

    const atrPeriodMap: Record<string, number> = {
      '15m': 10,
      '1h': 12,
      '4h': 14,
      '1d': 20,
    };

    const atrMap = {
      '15m': 1.3, // nến nhỏ, biến động nhiễu ⇒ cần ATR “nhạy hơn”
      '1h': 1.2,
      '4h': 1.15,
      '1d': 1.1, // nến lớn, dao động tự nhiên lớn ⇒ giảm nhạy
    };

    const volatilityThresholds = {
      '15m': { low: 0.008, high: 0.015 },
      '1h': { low: 0.012, high: 0.022 },
      '4h': { low: 0.018, high: 0.03 },
      '1d': { low: 0.025, high: 0.04 },
    };

    const { low, high } = volatilityThresholds[key];
    const atr = this.calcATR(effectiveCandles, atrPeriodMap[key]);
    const adjustedATR = atr * atrMap[key];
    const lastClose = effectiveCandles[effectiveCandles.length - 1].close;
    const volatilityRatio = +(adjustedATR / lastClose).toFixed(5);

    // 🔧 Tự động điều chỉnh lookback dựa vào độ biến động
    const adjLookback =
      volatilityRatio > high
        ? Math.max(2, lookback - 1) // Biến động mạnh ⇒ nhạy hơn
        : volatilityRatio < low
          ? lookback + 1 // Biến động yếu ⇒ làm mượt hơn
          : lookback;

    for (let i = adjLookback; i < effectiveCandles.length - adjLookback; i++) {
      let { high, low, close, time } = effectiveCandles[i];

      // 🔸 Xử lý đặc biệt ngày 2025-10-10
      if (String(time).startsWith('2025-10-10')) {
        low = close;
      }

      const prevCandles = effectiveCandles.slice(i - adjLookback, i);
      const nextCandles = effectiveCandles.slice(i + 1, i + 1 + adjLookback);

      const isHigh =
        prevCandles.every((c) => c.high < high) &&
        nextCandles.every((c) => c.high < high);

      const isLow =
        prevCandles.every((c) => c.low > low) &&
        nextCandles.every((c) => c.low > low);

      if (isHigh) {
        const avgAround =
          (Math.max(...prevCandles.map((c) => c.high)) +
            Math.max(...nextCandles.map((c) => c.high))) /
          2;
        if (high - avgAround > atr * 0.4) {
          swingHighs.push({ index: i, time, value: high });
        }
      }

      if (isLow) {
        const avgAround =
          (Math.min(...prevCandles.map((c) => c.low)) +
            Math.min(...nextCandles.map((c) => c.low))) /
          2;
        if (avgAround - low > atr * 0.4) {
          swingLows.push({ index: i, time, value: low });
        }
      }
    }

    return {
      swingHighs: swingHighs.slice(-2),
      swingLows: swingLows.slice(-2),
    };
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

    const getCandles1d = await this.binance.getCandles(symbol, '1d', 180);

    const getCandles4h = await this.binance.getCandles(symbol, '4h', 180);

    const getCandles1h = await this.binance.getCandles(symbol, '1h', 168);

    const getCandles15m = await this.binance.getCandles(symbol, '15m', 96);
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
      { key: '1d', candles: getCandles1d, lookback: 2 },
      { key: '4h', candles: getCandles4h, lookback: 2 },
      { key: '1h', candles: getCandles1h, lookback: 2 },
      { key: '15m', candles: getCandles15m, lookback: 2 },
    ];

    const trends: any = {};

    for (const { key, candles, lookback } of timeframes) {
      const swing = this.findSwingPoints(candles, lookback, key);
      console.log(swing);

      trends[`highestAndLowest${key}`] = swing;
      trends[`trend${key}`] = this.detectTrend(swing);
    }

    console.log(
      trends.trend1d,
      trends.trend4h,
      trends.trend1h,
      trends.trend15m,
    );

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

  // 🔹 Tính ATR (Average True Range)
  private calcATR(candles: ICandle[], period: number): number {
    if (candles.length < period + 1) return 0;

    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close),
      );
      trs.push(tr);
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
}
