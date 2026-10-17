import { Candle } from '../types/market';

export interface CoinbaseTicker {
  price: string;
  volume: string;
  bid: string;
  ask: string;
  time: string;
  trade_id?: number;
}

export interface CoinbaseFeedState {
  isConnected: boolean;
  isConnecting: boolean;
  lastPrice: number | null;
  lastUpdated: string | null;
  volume24h: number | null;
  source: 'websocket' | 'rest' | 'simulated';
  error: string | null;
}

export function formatCoinbaseProduct(symbol: string): string {
  // Convert symbols like "BTC/USDT" or "BTC" to "BTC-USD"
  const clean = symbol.replace('/', '-').replace('USDT', 'USD');
  if (!clean.includes('-')) {
    return `${clean}-USD`;
  }
  return clean;
}

export function timeframeToGranularity(timeframe: string): number {
  switch (timeframe) {
    case '1m':
      return 60;
    case '5m':
      return 300;
    case '15m':
      return 900;
    case '1h':
      return 3600;
    case '4h':
      return 21600;
    case '1D':
      return 86400;
    default:
      return 3600;
  }
}

/**
 * Fetches real historical candlesticks directly from the Coinbase Exchange API (via our Python backend proxy)
 */
export async function fetchCoinbaseCandles(
  symbol: string,
  timeframe: string = '1h',
  count: number = 80
): Promise<{ candles: Candle[]; source: string }> {
  const product = formatCoinbaseProduct(symbol);
  const granularity = timeframeToGranularity(timeframe);

  try {
    const res = await fetch(
      `/api/market/coinbase/candles?product=${product}&granularity=${granularity}&count=${count}`
    );
    if (!res.ok) {
      throw new Error(`Coinbase HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.success && Array.isArray(data.candles) && data.candles.length > 0) {
      return {
        candles: data.candles,
        source: data.source || 'Coinbase Exchange Live API',
      };
    }
    throw new Error(data.warning || 'No candles returned');
  } catch (err: unknown) {
    console.warn('[CoinbaseService] Primary fetch failed, attempting direct public fallback:', err);
    // Direct public fallback in browser if proxy had issue
    try {
      const directUrl = `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}`;
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        const raw = await directRes.json();
        const candles: Candle[] = [];
        for (const item of raw.slice(0, count)) {
          const t = Number(item[0]);
          const structDate = new Date(t * 1000);
          candles.push({
            timestamp: t * 1000,
            date: structDate.toISOString().split('T')[0],
            time: structDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            open: parseFloat(Number(item[3]).toFixed(2)),
            high: parseFloat(Number(item[2]).toFixed(2)),
            low: parseFloat(Number(item[1]).toFixed(2)),
            close: parseFloat(Number(item[4]).toFixed(2)),
            volume: parseFloat(Number(item[5]).toFixed(4)),
          });
        }
        candles.reverse();
        return { candles, source: 'Coinbase Exchange Live (Direct Public)' };
      }
    } catch (fallbackErr) {
      console.warn('[CoinbaseService] Direct fallback failed:', fallbackErr);
    }
    throw err;
  }
}

/**
 * Fetches live ticker price from Coinbase
 */
export async function fetchCoinbaseTicker(symbol: string): Promise<CoinbaseTicker | null> {
  const product = formatCoinbaseProduct(symbol);
  try {
    const res = await fetch(`/api/market/coinbase/ticker?product=${product}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.ticker) {
      return data.ticker;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Live Coinbase WebSocket & polling feed manager
 */
export class CoinbaseLiveFeed {
  private ws: WebSocket | null = null;
  private pollInterval: any = null;
  private product: string = 'BTC-USD';
  private onTickCallback: (price: number, volume: number) => void;
  private onStateCallback: (state: CoinbaseFeedState) => void;
  private state: CoinbaseFeedState = {
    isConnected: false,
    isConnecting: false,
    lastPrice: null,
    lastUpdated: null,
    volume24h: null,
    source: 'websocket',
    error: null,
  };

  constructor(
    onTick: (price: number, volume: number) => void,
    onState: (state: CoinbaseFeedState) => void
  ) {
    this.onTickCallback = onTick;
    this.onStateCallback = onState;
  }

  private updateState(partial: Partial<CoinbaseFeedState>) {
    this.state = { ...this.state, ...partial };
    this.onStateCallback(this.state);
  }

  public connect(symbol: string) {
    this.disconnect();
    this.product = formatCoinbaseProduct(symbol);

    this.updateState({ isConnecting: true, error: null });

    // Initial ticker fetch to get instant price
    fetchCoinbaseTicker(this.product).then((ticker) => {
      if (ticker) {
        const p = parseFloat(ticker.price);
        const v = parseFloat(ticker.volume);
        this.updateState({
          lastPrice: p,
          volume24h: v,
          lastUpdated: new Date().toLocaleTimeString(),
        });
        this.onTickCallback(p, v);
      }
    });

    try {
      // Connect to Coinbase public WebSocket feed
      this.ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');

      this.ws.onopen = () => {
        this.updateState({ isConnected: true, isConnecting: false, source: 'websocket' });
        const subscribeMsg = {
          type: 'subscribe',
          product_ids: [this.product],
          channels: ['ticker'],
        };
        this.ws?.send(JSON.stringify(subscribeMsg));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ticker' && msg.price) {
            const price = parseFloat(msg.price);
            const volume = msg.volume_24h ? parseFloat(msg.volume_24h) : 0;
            this.updateState({
              lastPrice: price,
              volume24h: volume,
              lastUpdated: new Date().toLocaleTimeString(),
            });
            this.onTickCallback(price, volume);
          }
        } catch {
          // ignore malformed frame
        }
      };

      this.ws.onerror = () => {
        // Fall back to REST polling if WebSocket is blocked or fails
        this.startRestPolling();
      };

      this.ws.onclose = () => {
        if (this.state.isConnected) {
          this.startRestPolling();
        }
      };
    } catch {
      this.startRestPolling();
    }
  }

  private startRestPolling() {
    this.updateState({ isConnected: true, isConnecting: false, source: 'rest' });
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      const ticker = await fetchCoinbaseTicker(this.product);
      if (ticker) {
        const p = parseFloat(ticker.price);
        const v = parseFloat(ticker.volume);
        this.updateState({
          lastPrice: p,
          volume24h: v,
          lastUpdated: new Date().toLocaleTimeString(),
        });
        this.onTickCallback(p, v);
      }
    }, 2500);
  }

  public disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.updateState({ isConnected: false, isConnecting: false });
  }
}
