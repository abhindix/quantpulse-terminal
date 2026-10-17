import React, { useState } from 'react';
import { Candle } from '../types/market';
import { ArrowUpRight, ArrowDownRight, Wallet, ShoppingBag } from 'lucide-react';

interface OrderTerminalProps {
  currentCandle: Candle | null;
  onExecuteSimulatedTrade: (side: 'BUY' | 'SELL', amount: number, price: number) => void;
  balance: number;
  position: { size: number; entryPrice: number } | null;
}

export const OrderTerminal: React.FC<OrderTerminalProps> = ({
  currentCandle,
  onExecuteSimulatedTrade,
  balance,
  position,
}) => {
  const [orderAmount, setOrderAmount] = useState<string>('0.5');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState<string>(
    currentCandle ? currentCandle.close.toFixed(2) : '7200'
  );

  const currentPrice = currentCandle ? currentCandle.close : 7200;
  const numAmount = parseFloat(orderAmount) || 0;
  const totalCost = numAmount * currentPrice;

  const unrealizedPnL = position
    ? (currentPrice - position.entryPrice) * position.size
    : 0;
  const unrealizedPnLPct = position
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : 0;

  return (
    <div className="flex flex-col h-full bg-[#070b1c] border border-slate-800 rounded-xl overflow-hidden shadow-2xl text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#090e24] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-cyan-400" />
          <span className="font-bold uppercase tracking-wider text-slate-200">Execution Desk</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-slate-400">Bal:</span>
          <span className="text-white font-semibold">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="p-3 space-y-3 flex-1 flex flex-col justify-between">
        {/* Active Position Info */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[11px] text-slate-400 flex justify-between">
            <span>Open Position</span>
            <span className="font-mono">{position ? `${position.size} Units` : 'FLAT'}</span>
          </div>
          {position && (
            <div className="flex justify-between items-baseline mt-1 font-mono">
              <span className="text-slate-300">Avg Entry: ${position.entryPrice.toFixed(2)}</span>
              <span className={`font-bold ${unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)} ({unrealizedPnLPct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Order inputs */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-slate-400">
            <span>Order Type</span>
            <div className="flex gap-1">
              <button
                onClick={() => setOrderType('MARKET')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  orderType === 'MARKET' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500'
                }`}
              >
                Market
              </button>
              <button
                onClick={() => setOrderType('LIMIT')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  orderType === 'LIMIT' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-500'
                }`}
              >
                Limit
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Amount (Units)</span>
              <span>≈ ${(numAmount * currentPrice).toFixed(2)}</span>
            </div>
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={orderAmount}
              onChange={(e) => setOrderAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {orderType === 'LIMIT' && (
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Limit Price ($)</span>
              </div>
              <input
                type="number"
                step="1"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}
        </div>

        {/* Buy & Sell Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={() => onExecuteSimulatedTrade('BUY', numAmount, currentPrice)}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg transition-all shadow-lg active:scale-95"
          >
            <ArrowUpRight className="w-4 h-4" />
            BUY / LONG
          </button>
          <button
            onClick={() => onExecuteSimulatedTrade('SELL', numAmount, currentPrice)}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all shadow-lg active:scale-95"
          >
            <ArrowDownRight className="w-4 h-4" />
            SELL / SHORT
          </button>
        </div>
      </div>
    </div>
  );
};
