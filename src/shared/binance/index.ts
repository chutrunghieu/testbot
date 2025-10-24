import { HttpService } from '@nestjs/axios';
import { HttpLib } from '../axios';
import { ICandle, IPriceCurrent } from '../interfaces/binance.interface';
import { formatDate } from '../utils/helpers';

export class BinanceHttpLib extends HttpLib {
  constructor(protected readonly http: HttpService) {
    super(http);
    this.BASE_API = process.env.API!;
  }

  async getPriceNow(symbol: string): Promise<IPriceCurrent> {
    const urlGetPrice = `${this.BASE_API}/ticker/price`;
    const params = {
      symbol,
    };
    const urlGetTime = `${this.BASE_API}/time`;

    const [{ data: priceData }, { data: timeData }] = await Promise.all([
      await this.makeRequest('GET', urlGetPrice, params),
      await this.makeRequest('GET', urlGetTime),
    ]);
    return {
      symbol: priceData.symbol,
      price: parseFloat(priceData.price),
      time: formatDate(timeData.serverTime),
    };
  }

  async getCandles(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<ICandle[]> {
    const url = `${this.BASE_API}/klines`;
    const { data } = await this.makeRequest('GET', url, {
      symbol,
      interval,
      limit,
    });

    return data.map((c: any) => ({
      time: formatDate(c[0]),
      open: +c[1],
      high: +c[2],
      low: +c[3],
      close: +c[4],
    }));
  }

  async getLastCandles(
    symbol: string,
    interval: string,
    limit: number = 2,
  ): Promise<ICandle> {
    const url = `${this.BASE_API}/klines`;
    const { data } = await this.makeRequest('GET', url, {
      symbol,
      interval,
      limit,
    });

    return {
      time: formatDate(data[0][0]),
      open: +data[0][1],
      high: +data[0][2],
      low: +data[0][3],
      close: +data[0][4],
    };
  }

  async getNowCandles(symbol: string, limit: number = 1): Promise<ICandle> {
    const url = `${this.BASE_API}/klines`;
    const { data } = await this.makeRequest('GET', url, {
      symbol,
      interval: '15m',
      limit,
    });

    return {
      time: formatDate(data[0][0]),
      open: +data[0][1],
      high: +data[0][2],
      low: +data[0][3],
      close: +data[0][4],
    };
  }
}
