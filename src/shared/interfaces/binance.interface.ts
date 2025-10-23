export interface ICandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ISwingPoint {
  index: number;
  value: number;
  time: number | string;
}

export interface ITrendLineParams {
  slope: number;
  intercept: number;
}