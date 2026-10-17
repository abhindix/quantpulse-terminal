import React, { useState, useEffect } from 'react';
import { StrategyDefinition, PYTHON_STRATEGIES } from '../services/pythonStrategies';
import { StrategyParams, PythonExecutionResult } from '../types/market';
import { User } from '../services/authService';
import { saveUserStrategyToFirestore, getUserStrategiesFromFirestore, FirestoreStrategy } from '../services/firebase';
import { Play, Copy, Check, Download, Terminal, Settings2, Sparkles, RefreshCw, Code2, CloudUpload, Cloud } from 'lucide-react';

interface PythonCodePanelProps {
  currentCode: string;
  onCodeChange: (code: string) => void;
  params: StrategyParams;
  onParamsChange: (params: StrategyParams) => void;
  onRunPython: () => Promise<void>;
  isRunning: boolean;
  executionLogs: string[];
  executionTimeMs: number | null;
  activeStrategyId: string;
  onSelectStrategy: (strat: StrategyDefinition) => void;
  currentUser?: User | null;
  onOpenAuth?: () => void;
}

export const PythonCodePanel: React.FC<PythonCodePanelProps> = ({
  currentCode,
  onCodeChange,
  params,
  onParamsChange,
  onRunPython,
  isRunning,
  executionLogs,
  executionTimeMs,
  activeStrategyId,
  onSelectStrategy,
  currentUser,
  onOpenAuth,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'params' | 'terminal'>('editor');
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);
  const [cloudSaved, setCloudSaved] = useState<boolean>(false);
  const [cloudStrategies, setCloudStrategies] = useState<FirestoreStrategy[]>([]);

  // Fetch user's saved strategies from Firestore when user is authenticated
  useEffect(() => {
    if (currentUser?.id) {
      getUserStrategiesFromFirestore(String(currentUser.id))
        .then((strats) => setCloudStrategies(strats))
        .catch((err) => console.warn('Could not load Firestore strategies:', err));
    } else {
      setCloudStrategies([]);
    }
  }, [currentUser]);

  const handleSaveToCloud = async () => {
    if (!currentUser) {
      onOpenAuth?.();
      return;
    }
    setIsSavingCloud(true);
    try {
      const activeStrat = PYTHON_STRATEGIES.find((s) => s.id === activeStrategyId);
      const name = activeStrat ? activeStrat.name : 'Custom Python Strategy';
      await saveUserStrategyToFirestore(String(currentUser.id), {
        name,
        code: currentCode,
        category: 'quantitative',
      });
      setCloudSaved(true);
      setTimeout(() => setCloudSaved(false), 3000);
      const updated = await getUserStrategiesFromFirestore(String(currentUser.id));
      setCloudStrategies(updated);
    } catch (err) {
      console.error('Save to Firestore error:', err);
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quant_strategy_${activeStrategyId}.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lineCount = currentCode.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full bg-[#070b1c] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#090e24] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-950/40 text-cyan-400 border border-cyan-800/40 rounded text-xs font-mono">
            <span className="font-bold">Python 3.10</span>
            <span className="text-slate-500">|</span>
            <span>Quant Studio</span>
          </div>

          {/* Strategy Template Dropdown */}
          <select
            value={activeStrategyId}
            onChange={(e) => {
              const strat = PYTHON_STRATEGIES.find((s) => s.id === e.target.value);
              if (strat) onSelectStrategy(strat);
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {PYTHON_STRATEGIES.map((strat) => (
              <option key={strat.id} value={strat.id}>
                {strat.name}
              </option>
            ))}
          </select>
        </div>

        {/* View Switcher Tabs & Run Button */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900/90 rounded p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                activeTab === 'editor' ? 'bg-slate-800 text-cyan-300 font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Editor
            </button>
            <button
              onClick={() => setActiveTab('params')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                activeTab === 'params' ? 'bg-slate-800 text-cyan-300 font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Parameters
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                activeTab === 'terminal' ? 'bg-slate-800 text-cyan-300 font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Terminal
            </button>
          </div>

          {/* Primary Run Action */}
          <button
            onClick={onRunPython}
            disabled={isRunning}
            className={`px-3 py-1 text-xs font-semibold rounded flex items-center gap-1.5 transition-all shadow-md ${
              isRunning
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold active:scale-95'
            }`}
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Execute Strategy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex-1 overflow-hidden flex flex-col">
        {activeTab === 'editor' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Line numbers gutter */}
            <div className="w-12 py-3 bg-[#050814] text-right pr-3 select-none text-[11px] font-mono text-slate-600 border-r border-slate-800/80 overflow-hidden">
              {lineNumbers.map((num) => (
                <div key={num} className="leading-5">
                  {num}
                </div>
              ))}
            </div>

            {/* Editable Python Code Area */}
            <div className="flex-1 relative overflow-auto">
              <textarea
                value={currentCode}
                onChange={(e) => onCodeChange(e.target.value)}
                spellCheck={false}
                className="w-full h-full p-3 bg-transparent text-[12px] font-mono leading-5 text-slate-200 outline-none resize-none selection:bg-cyan-500/30 whitespace-pre"
              />
            </div>
          </div>
        )}

        {activeTab === 'params' && (
          <div className="p-5 overflow-auto text-xs space-y-4">
            <h4 className="text-sm font-semibold text-slate-200 mb-2">Strategy Tuner</h4>
            <p className="text-slate-400 text-xs">
              Directly tune the algorithmic hyperparameters. When modified, parameters update your execution payload.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Fast Trend Period (EMA)</span>
                  <span className="font-mono text-amber-400 font-bold">{params.fastPeriod}</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="20"
                  value={params.fastPeriod}
                  onChange={(e) => onParamsChange({ ...params, fastPeriod: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500">Controls the Yellow Trend curve responsiveness</span>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Slow Signal Period (EMA)</span>
                  <span className="font-mono text-fuchsia-400 font-bold">{params.slowPeriod}</span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="50"
                  value={params.slowPeriod}
                  onChange={(e) => onParamsChange({ ...params, slowPeriod: Number(e.target.value) })}
                  className="w-full accent-fuchsia-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500">Controls the Purple Signal line crossover filter</span>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Stop Loss (% Capital)</span>
                  <span className="font-mono text-rose-400 font-bold">{params.stopLossPct}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={params.stopLossPct}
                  onChange={(e) => onParamsChange({ ...params, stopLossPct: Number(e.target.value) })}
                  className="w-full accent-rose-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500">Strict downside capital protection barrier</span>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Take Profit Target (%)</span>
                  <span className="font-mono text-cyan-400 font-bold">{params.takeProfitPct}%</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="20"
                  step="0.5"
                  value={params.takeProfitPct}
                  onChange={(e) => onParamsChange({ ...params, takeProfitPct: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500">Target price exit target (Generates pink discs)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="flex-1 p-4 bg-[#030612] font-mono text-xs overflow-auto flex flex-col justify-between">
            <div className="space-y-1.5 text-slate-300">
              <div className="text-cyan-400 font-semibold mb-2">
                $ python3 -c &quot;quant_strategy.py&quot; --mode=backtest
              </div>
              {executionLogs.map((log, index) => (
                <div
                  key={index}
                  className={`leading-relaxed ${
                    log.includes('[SIGNAL]')
                      ? 'text-emerald-400 font-semibold'
                      : log.includes('[ERROR]')
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))}
              {executionTimeMs !== null && (
                <div className="text-slate-500 pt-2 text-[11px]">
                  ✓ Process finished in <span className="text-cyan-400 font-bold">{executionTimeMs}ms</span> with exit code 0
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-slate-500 text-[11px]">
              <span>Standard I/O: STDIN JSON Pipe · STDOUT Structured Result</span>
              <span>Runtime: Linux x86_64 CPython</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Utility Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#090e24] border-t border-slate-800 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span>{lineCount} lines</span>
          <span>·</span>
          <span>UTF-8</span>
          {executionTimeMs !== null && (
            <>
              <span>·</span>
              <span className="text-emerald-400">Latency: {executionTimeMs}ms</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Save to Firestore Cloud */}
          <button
            onClick={handleSaveToCloud}
            disabled={isSavingCloud}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              cloudSaved
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-amber-500/40'
            }`}
            title="Save custom Python strategy to Google Cloud Firestore database"
          >
            {cloudSaved ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 text-amber-400" />
            )}
            {cloudSaved ? 'Saved to Cloud!' : isSavingCloud ? 'Saving...' : 'Save to Firestore'}
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download .py
          </button>
        </div>
      </div>
    </div>
  );
};
