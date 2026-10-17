import React, { useState } from 'react';
import { BacktestMetrics, TradeLog } from '../types/market';
import { User } from '../services/authService';
import { saveBacktestReportToFirestore } from '../services/firebase';
import { TrendingUp, Award, AlertTriangle, ShieldCheck, DollarSign, Activity, Download, Check, CloudUpload, Cloud } from 'lucide-react';

interface BacktestDashboardProps {
  metrics: BacktestMetrics;
  trades: TradeLog[];
  currentUser?: User | null;
  onOpenAuth?: () => void;
  activeStrategyName?: string;
  symbol?: string;
  timeframe?: string;
}

export const BacktestDashboard: React.FC<BacktestDashboardProps> = ({ 
  metrics, 
  trades,
  currentUser,
  onOpenAuth,
  activeStrategyName = 'Dual EMA Cyber Trend',
  symbol = 'BTC/USD',
  timeframe = '1h'
}) => {
  const [exported, setExported] = useState<boolean>(false);
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);
  const [cloudSaved, setCloudSaved] = useState<boolean>(false);
  const isPositive = metrics.totalReturnPct >= 0;

  const handleSaveToFirestore = async () => {
    if (!currentUser) {
      onOpenAuth?.();
      return;
    }
    setIsSavingCloud(true);
    try {
      await saveBacktestReportToFirestore(String(currentUser.id), {
        strategyName: activeStrategyName,
        symbol,
        timeframe,
        totalReturnPct: metrics.totalReturnPct,
        winRatePct: metrics.winRatePct,
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdownPct: metrics.maxDrawdownPct,
        profitFactor: metrics.profitFactor,
        totalTrades: metrics.totalTrades,
      });
      setCloudSaved(true);
      setTimeout(() => setCloudSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save backtest to Firestore:', err);
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleExportCSV = () => {
    const csvRows: string[] = [];

    // 1. Backtest Summary Performance Section
    csvRows.push('=== BACKTEST SUMMARY PERFORMANCE ===');
    csvRows.push('Metric,Value');
    csvRows.push(`Initial Capital,$${metrics.initialCapital}`);
    csvRows.push(`Final Equity,$${metrics.finalEquity}`);
    csvRows.push(`Total Return (%),${metrics.totalReturnPct}%`);
    csvRows.push(`Win Rate (%),${metrics.winRatePct}%`);
    csvRows.push(`Total Trades,${metrics.totalTrades}`);
    csvRows.push(`Winning Trades,${metrics.winningTrades}`);
    csvRows.push(`Losing Trades,${metrics.losingTrades}`);
    csvRows.push(`Sharpe Ratio,${metrics.sharpeRatio}`);
    csvRows.push(`Max Drawdown (%),${metrics.maxDrawdownPct}%`);
    csvRows.push(`Profit Factor,${metrics.profitFactor}`);
    csvRows.push(''); // Spacer

    // 2. Trade Execution Logs Section
    csvRows.push('=== TRADE EXECUTION LOG ===');
    csvRows.push('Order,Entry Time,Exit Time,Side,Entry Price,Exit Price,PnL (%),PnL ($),Status,Reason');

    if (trades.length > 0) {
      trades.forEach((t, idx) => {
        const orderNum = idx + 1;
        const entryTime = `"${t.entryTime || ''}"`;
        const exitTime = `"${t.exitTime || ''}"`;
        const side = t.side;
        const entryPrice = t.entryPrice.toFixed(2);
        const exitPrice = t.exitPrice.toFixed(2);
        const pnlPct = t.pnlPct.toFixed(2);
        const pnlUsd = t.pnlUsd.toFixed(2);
        const status = t.status || 'CLOSED';
        const reason = `"${(t.reason || '').replace(/"/g, '""')}"`;

        csvRows.push(
          `${orderNum},${entryTime},${exitTime},${side},${entryPrice},${exitPrice},${pnlPct},${pnlUsd},${status},${reason}`
        );
      });
    } else {
      csvRows.push('No completed trades recorded in this backtest cycle.');
    }

    const csvContent = csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute('download', `quantpulse_backtest_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#070b1c] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#090e24] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Python Backtest Intelligence
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
            Capital: <span className="text-white font-semibold">${metrics.initialCapital.toLocaleString()}</span>
            <span className="mx-1.5">→</span>
            Equity: <span className="text-emerald-400 font-bold">${metrics.finalEquity.toLocaleString()}</span>
          </div>

          {/* Save to Firestore Cloud */}
          <button
            onClick={handleSaveToFirestore}
            disabled={isSavingCloud}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer whitespace-nowrap ${
              cloudSaved
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40'
            }`}
            title="Save backtest results to Google Cloud Firestore database"
          >
            {cloudSaved ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 text-amber-400" />
            )}
            {cloudSaved ? 'Saved to Cloud!' : isSavingCloud ? 'Saving...' : 'Save to Firestore'}
          </button>

          {/* Export to CSV Action */}
          <button
            onClick={handleExportCSV}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer whitespace-nowrap ${
              exported
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/40'
            }`}
            title="Download current backtest metrics and trade logs as CSV"
          >
            {exported ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
            {exported ? 'Exported!' : 'Export to CSV'}
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 bg-[#050814]/70 border-b border-slate-800/80">
        {/* Total Return */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Net Return</span>
            <TrendingUp className="w-3 h-3 text-cyan-400" />
          </div>
          <div className={`text-base font-bold font-mono mt-1 ${isPositive ? 'text-cyan-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : ''}{metrics.totalReturnPct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Cumulative PnL</div>
        </div>

        {/* Win Rate */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Win Rate</span>
            <Award className="w-3 h-3 text-amber-400" />
          </div>
          <div className="text-base font-bold font-mono mt-1 text-amber-400">
            {metrics.winRatePct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {metrics.winningTrades}W / {metrics.losingTrades}L
          </div>
        </div>

        {/* Sharpe Ratio */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Sharpe Ratio</span>
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="text-base font-bold font-mono mt-1 text-emerald-400">
            {metrics.sharpeRatio.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Risk-adjusted return</div>
        </div>

        {/* Max Drawdown */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Max Drawdown</span>
            <AlertTriangle className="w-3 h-3 text-rose-400" />
          </div>
          <div className="text-base font-bold font-mono mt-1 text-rose-400">
            {metrics.maxDrawdownPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Peak-to-trough drop</div>
        </div>

        {/* Profit Factor */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Profit Factor</span>
            <DollarSign className="w-3 h-3 text-indigo-400" />
          </div>
          <div className="text-base font-bold font-mono mt-1 text-indigo-400">
            {metrics.profitFactor.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Gross Win / Gross Loss</div>
        </div>

        {/* Total Trades */}
        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Executions</span>
            <Activity className="w-3 h-3 text-purple-400" />
          </div>
          <div className="text-base font-bold font-mono mt-1 text-white">
            {metrics.totalTrades}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Completed orders</div>
        </div>
      </div>

      {/* Trade Log Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090e24] text-[11px] text-slate-400 uppercase tracking-wider font-mono sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="py-2 px-3">Order</th>
              <th className="py-2 px-3">Entry Time</th>
              <th className="py-2 px-3">Side</th>
              <th className="py-2 px-3 text-right">Entry Price</th>
              <th className="py-2 px-3 text-right">Exit Price</th>
              <th className="py-2 px-3 text-right">PnL %</th>
              <th className="py-2 px-3 text-right">PnL ($)</th>
              <th className="py-2 px-3">Exit Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {trades.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  No completed trades in current cycle. Adjust parameters or run execution.
                </td>
              </tr>
            ) : (
              trades.map((t, idx) => {
                const isGain = t.pnlPct >= 0;
                return (
                  <tr key={t.id || idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 text-slate-400">#{idx + 1}</td>
                    <td className="py-2 px-3 text-slate-300">{t.entryTime}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                        {t.side}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      ${t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      ${t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isGain ? '+' : ''}{t.pnlPct.toFixed(2)}%
                    </td>
                    <td className={`py-2 px-3 text-right font-bold ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isGain ? '+' : ''}${t.pnlUsd.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      <span className="text-[10px] text-slate-400">{t.reason}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
