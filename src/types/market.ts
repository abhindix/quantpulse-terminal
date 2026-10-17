export interface Candle {
  timestamp: number;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SignalType = 'buy' | 'sell' | 'target';

export interface SignalMarker {
  id: string;
  candleIndex: number;
  timestamp: number;
  price: number;
  type: SignalType;
  label?: string;
  score?: number;
  indicatorValue?: number;
}

export interface TechnicalIndicators {
  fastEma: (number | null)[];
  slowEma: (number | null)[];
  baseline: (number | null)[];
  upperBand?: (number | null)[];
  lowerBand?: (number | null)[];
  volumeMa?: (number | null)[];
}

export interface TradeLog {
  id: string;
  entryIndex: number;
  exitIndex: number;
  entryTime: string;
  exitTime: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  pnlUsd: number;
  status: 'CLOSED' | 'OPEN';
  reason: string;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  winRatePct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  initialCapital: number;
  finalEquity: number;
}

export interface StrategyParams {
  fastPeriod: number;
  slowPeriod: number;
  baselinePeriod: number;
  stopLossPct: number;
  takeProfitPct: number;
  initialCapital: number;
}

export interface PythonExecutionResult {
  indicators: {
    fastEma: (number | null)[];
    slowEma: (number | null)[];
    baseline: (number | null)[];
  };
  signals: SignalMarker[];
  metrics: BacktestMetrics;
  trades: TradeLog[];
  logs?: string[];
}
