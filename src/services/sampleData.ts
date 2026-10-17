import { Candle } from '../types/market';

export interface MarketAsset {
  symbol: string;
  name: string;
  basePrice: number;
  currency: string;
  category: string;
  coinbaseProduct?: string;
  isCoinbase?: boolean;
}

export const AVAILABLE_ASSETS: MarketAsset[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin (Coinbase)', basePrice: 81400, currency: '$', category: 'Crypto', coinbaseProduct: 'BTC-USD', isCoinbase: true },
  { symbol: 'ETH/USD', name: 'Ethereum (Coinbase)', basePrice: 2850, currency: '$', category: 'Crypto', coinbaseProduct: 'ETH-USD', isCoinbase: true },
  { symbol: 'SOL/USD', name: 'Solana (Coinbase)', basePrice: 195, currency: '$', category: 'Crypto', coinbaseProduct: 'SOL-USD', isCoinbase: true },
  { symbol: 'DOGE/USD', name: 'Dogecoin (Coinbase)', basePrice: 0.18, currency: '$', category: 'Crypto', coinbaseProduct: 'DOGE-USD', isCoinbase: true },
  { symbol: 'NVDA', name: 'NVIDIA Compute', basePrice: 880, currency: '$', category: 'Equities', isCoinbase: false },
  { symbol: 'SPX500', name: 'S&P 500 Index', basePrice: 5620, currency: '$', category: 'Indices', isCoinbase: false },
];

/**
 * Generates initial candlestick data that mirrors the trajectory in the reference image:
 * Starting around 4800-6000, testing local supports, then entering a strong multi-stage
 * breakout up through 7200, 7600, 8500, peaking at 8942.08.
 */
export function generateReferenceMarketData(count: number = 75, seedPrice: number = 7200): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - count * 60 * 60 * 1000; // 1-hour candles

  // Specific key price points corresponding to the image:
  // 4355.08, 4772.08, 5606.08, 6023.08, 6440.08, 6857.08, 7274.08, 7691.08, 8525.08, 8942.08
  let currentPrice = 5800;
  
  // Phase 1: Consolidation and slight dip around 5600-6000
  // Phase 2: Double bottom bounce at ~5400
  // Phase 3: Explosive trend upwards with pullbacks through 6800, 7200, 7600
  // Phase 4: Breakout towards 8900
  for (let i = 0; i < count; i++) {
    const progress = i / count;
    let trend = 0;

    if (progress < 0.2) {
      // Mild drift down to test ~5400-5600
      trend = -8 + Math.sin(i * 0.8) * 15;
    } else if (progress < 0.35) {
      // Reversal and accumulation
      trend = 14 + Math.cos(i * 0.5) * 12;
    } else if (progress < 0.75) {
      // Aggressive bull run up to 7800
      trend = 45 + Math.sin(i * 0.4) * 20;
    } else if (progress < 0.85) {
      // Healthy pullback/consolidation
      trend = -20 + Math.sin(i * 0.9) * 15;
    } else {
      // Final parabolic surge to 8942
      trend = 65 + Math.sin(i * 0.6) * 25;
    }

    const volatility = 40 + Math.random() * 35;
    const open = currentPrice;
    const change = trend + (Math.random() - 0.45) * volatility;
    let close = Math.max(3800, open + change);
    
    // Ensure highs and lows bracket open and close
    const high = Math.max(open, close) + Math.random() * (volatility * 0.8);
    const low = Math.min(open, close) - Math.random() * (volatility * 0.8);
    const volume = Math.floor(1200 + Math.random() * 4500 + (Math.abs(change) * 40));

    currentPrice = close;

    const candleDate = new Date(baseTime + i * 3600 * 1000);
    const dateStr = candleDate.toISOString().split('T')[0];
    const timeStr = candleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    candles.push({
      timestamp: candleDate.getTime(),
      date: dateStr,
      time: timeStr,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });
  }

  return candles;
}

/**
 * Appends a realistic live tick / new candle onto the series
 */
export function generateNextCandle(lastCandle: Candle): Candle {
  const nextTimestamp = lastCandle.timestamp + 3600 * 1000;
  const candleDate = new Date(nextTimestamp);
  const dateStr = candleDate.toISOString().split('T')[0];
  const timeStr = candleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const open = lastCandle.close;
  const drift = (Math.random() - 0.47) * 35;
  const close = parseFloat(Math.max(100, open + drift).toFixed(2));
  const high = parseFloat((Math.max(open, close) + Math.random() * 25).toFixed(2));
  const low = parseFloat((Math.min(open, close) - Math.random() * 25).toFixed(2));
  const volume = Math.floor(1800 + Math.random() * 3200);

  return {
    timestamp: nextTimestamp,
    date: dateStr,
    time: timeStr,
    open,
    high,
    low,
    close,
    volume,
  };
}
