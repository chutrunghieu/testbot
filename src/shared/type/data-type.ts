import { ISwingPoint, ITrendLineParams } from '../interfaces/binance.interface';

export type TSwingPoints = {
  swingHighs: ISwingPoint[];
  swingLows: ISwingPoint[];
};

export type TTrendLines = {
  resistance: ITrendLineParams;
  support: ITrendLineParams;
};
