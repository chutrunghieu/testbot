export interface ICandle {
  time: number | string;
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

interface ITrendLine {
  type: 'up' | 'down';
  slope: number;
  intercept: number;
  from: ISwingPoint;
  to: ISwingPoint;
}