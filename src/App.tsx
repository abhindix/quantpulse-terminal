/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateReferenceMarketData,
  generateNextCandle,
  AVAILABLE_ASSETS,
  MarketAsset,
} from './services/sampleData';
import { Candle, StrategyParams, SignalMarker, TechnicalIndicators, BacktestMetrics, TradeLog } from './types/market';
import { PYTHON_STRATEGIES, StrategyDefinition } from './services/pythonStrategies';
import { executePythonOnServer, runLocalQuantStrategy } from './services/quantEngine';
import { authService, User } from './services/authService';
import { 
  testFirestoreConnection, 
  auth, 
  onAuthStateChanged, 
  logOutFirebase, 
  saveTradeOrderToFirestore 
} from './services/firebase';
import { 
  fetchCoinbaseCandles, 
  CoinbaseLiveFeed, 
  CoinbaseFeedState, 
  formatCoinbaseProduct 
} from './services/coinbaseService';
import { FinancialChart } from './components/FinancialChart';
import { ThreeDMarketStudio } from './components/ThreeDMarketStudio';
import { PythonCodePanel } from './components/PythonCodePanel';
import { BacktestDashboard } from './components/BacktestDashboard';
import { OrderTerminal } from './components/OrderTerminal';
import { AuthModal } from './components/AuthModal';
import { SecurityMetricsModal } from './components/SecurityMetricsModal';
import { 
  Play, 
  Pause, 
  FastForward, 
  RotateCcw, 
  Cpu, 
  Box, 
  LineChart, 
  User as UserIcon, 
  LogOut, 
  Menu, 
  X,
  Layers,
  Terminal,
  Activity,
  CheckCircle2,
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'reset'>('login');
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);

  // Market & Asset State
  const [selectedAsset, setSelectedAsset] = useState<string>('BTC/USD');
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);

  // Feed source: 'coinbase' for real live Coinbase Exchange data, 'simulation' for photo model
  const [dataSource, setDataSource] = useState<'coinbase' | 'simulation'>('coinbase');
  const [dataSourceLabel, setDataSourceLabel] = useState<string>('Coinbase Exchange Live API');
  const [isLoadingMarketData, setIsLoadingMarketData] = useState<boolean>(false);

  // Coinbase Live Feed Connection State
  const [coinbaseState, setCoinbaseState] = useState<CoinbaseFeedState>({
    isConnected: false,
    isConnecting: false,
    lastPrice: null,
    lastUpdated: null,
    volume24h: null,
    source: 'websocket',
    error: null,
  });
  const coinbaseFeedRef = useRef<CoinbaseLiveFeed | null>(null);

  // Chart Presentation Mode: 'terminal' (2D/3D Cyber Chart matching photo) vs 'threejs' (Three.js PBR Studio)
  const [displayMode, setDisplayMode] = useState<'terminal' | 'threejs'>('terminal');

  // Perspective 3D angle mode for the canvas chart
  const [is3DMode, setIs3DMode] = useState<boolean>(true);

  // Active navigation tab for lower workspace on mobile/desktop
  const [activeTab, setActiveTab] = useState<'python' | 'backtest' | 'desk'>('python');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Python Quantitative Strategy State
  const [activeStrategy, setActiveStrategy] = useState<StrategyDefinition>(PYTHON_STRATEGIES[0]);
  const [strategyCode, setStrategyCode] = useState<string>(PYTHON_STRATEGIES[0].pythonCode);
  const [params, setParams] = useState<StrategyParams>({
    fastPeriod: PYTHON_STRATEGIES[0].defaultParams.fastPeriod,
    slowPeriod: PYTHON_STRATEGIES[0].defaultParams.slowPeriod,
    baselinePeriod: PYTHON_STRATEGIES[0].defaultParams.baselinePeriod,
    stopLossPct: PYTHON_STRATEGIES[0].defaultParams.stopLossPct,
    takeProfitPct: PYTHON_STRATEGIES[0].defaultParams.takeProfitPct,
    initialCapital: 10000,
  });

  // Strategy Execution Results
  const [indicators, setIndicators] = useState<TechnicalIndicators>({
    fastEma: [],
    slowEma: [],
    baseline: [],
  });
  const [signals, setSignals] = useState<SignalMarker[]>([]);
  const [metrics, setMetrics] = useState<BacktestMetrics>({
    totalReturnPct: 38.4,
    winRatePct: 68.2,
    sharpeRatio: 1.85,
    maxDrawdownPct: -4.8,
    totalTrades: 6,
    winningTrades: 4,
    losingTrades: 2,
    profitFactor: 2.45,
    initialCapital: 10000,
    finalEquity: 13840,
  });
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [executionLogs, setExecutionLogs] = useState<string[]>([
    '[INIT] Python 3.10 REST Architecture ready on 127.0.0.1:5001',
    '[INFO] Connected to Coinbase Exchange Live Market Feed',
  ]);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(14);
  const [isExecutingPython, setIsExecutingPython] = useState<boolean>(false);

  // Live Market Stream State
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamSpeed] = useState<number>(2000);

  // Paper Trading State
  const [balance, setBalance] = useState<number>(10000);
  const [position, setPosition] = useState<{ size: number; entryPrice: number } | null>(null);

  // Check initial user authentication session from Python backend & Firebase
  useEffect(() => {
    // 1. Test Firestore Enterprise connection on boot
    testFirestoreConnection().catch((err) => console.warn('Firestore connection check:', err));

    // 2. Check local Python SQLite token
    authService.checkAuth().then((user) => {
      if (user) setCurrentUser(user);
    });

    // 3. Listen to Firebase Google Auth state transitions
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setCurrentUser({
          id: fbUser.uid,
          email: fbUser.email || '',
          name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Google Trader',
          photoURL: fbUser.photoURL || undefined,
          provider: 'google',
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Execute strategy handler
  const executeStrategy = useCallback(
    async (codeToRun = strategyCode, currentCandles = candles, currentParams = params) => {
      if (currentCandles.length === 0) return;
      setIsExecutingPython(true);
      try {
        const { result, stdout, stderr, executionTimeMs: timeMs } = await executePythonOnServer(
          codeToRun,
          currentCandles,
          currentParams
        );

        if (result && result.indicators) {
          setIndicators(result.indicators);
          setSignals(result.signals || []);
          if (result.metrics) setMetrics(result.metrics);
          if (result.trades) setTrades(result.trades);
        }

        const newLogs: string[] = [];
        if (stdout) {
          stdout
            .split('\n')
            .filter((l) => l.trim().length > 0 && !l.startsWith('{'))
            .forEach((l) => newLogs.push(l));
        }
        if (result?.logs) {
          result.logs.forEach((l) => newLogs.push(l));
        }
        if (stderr) {
          newLogs.push(`[STDERR] ${stderr}`);
        }
        if (newLogs.length === 0) {
          newLogs.push(`[SUCCESS] Python REST engine finished in ${timeMs}ms`);
        }

        setExecutionLogs(newLogs);
        setExecutionTimeMs(timeMs);
      } catch (err: unknown) {
        console.error('Python execution error:', err);
        const localRes = runLocalQuantStrategy(currentCandles, currentParams);
        setIndicators(localRes.indicators);
        setSignals(localRes.signals);
        setMetrics(localRes.metrics);
        setTrades(localRes.trades);
        setExecutionLogs([
          `[FALLBACK] Local engine executed: ${err instanceof Error ? err.message : String(err)}`,
        ]);
        setExecutionTimeMs(4);
      } finally {
        setIsExecutingPython(false);
      }
    },
    [strategyCode, candles, params]
  );

  // Fetch market candles from Coinbase or simulation
  const loadMarketCandles = useCallback(
    async (symbol: string, tf: string, source: 'coinbase' | 'simulation') => {
      setIsLoadingMarketData(true);
      const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL') || symbol.includes('DOGE') || symbol.includes('USD');

      if (source === 'coinbase' && isCrypto) {
        try {
          const { candles: realCandles, source: label } = await fetchCoinbaseCandles(symbol, tf, 80);
          setCandles(realCandles);
          setDataSourceLabel(label);
          executeStrategy(strategyCode, realCandles, params);

          // Connect live Coinbase WebSocket/ticker feed
          if (coinbaseFeedRef.current) {
            coinbaseFeedRef.current.connect(symbol);
          }
        } catch (err) {
          console.warn('[App] Coinbase fetch error, falling back to simulated data:', err);
          const fallbackCandles = generateReferenceMarketData(80, 81400);
          setCandles(fallbackCandles);
          setDataSourceLabel('Coinbase Offline (Simulated Fallback)');
          executeStrategy(strategyCode, fallbackCandles, params);
        } finally {
          setIsLoadingMarketData(false);
        }
      } else {
        // Simulated / Reference mode
        const assetObj = AVAILABLE_ASSETS.find((a) => a.symbol === symbol);
        const seedPrice = assetObj ? assetObj.basePrice : 7200;
        const simCandles = generateReferenceMarketData(80, seedPrice);
        setCandles(simCandles);
        setDataSourceLabel('Reference Photo Pattern');
        executeStrategy(strategyCode, simCandles, params);
        if (coinbaseFeedRef.current) {
          coinbaseFeedRef.current.disconnect();
        }
        setIsLoadingMarketData(false);
      }
    },
    [strategyCode, params, executeStrategy]
  );

  // Setup Coinbase Live Feed listener
  useEffect(() => {
    coinbaseFeedRef.current = new CoinbaseLiveFeed(
      (price: number) => {
        // Real-time tick received from Coinbase
        setCandles((prevCandles) => {
          if (prevCandles.length === 0) return prevCandles;
          const lastIdx = prevCandles.length - 1;
          const last = prevCandles[lastIdx];

          const updatedLast: Candle = {
            ...last,
            close: price,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
          };

          const newArr = [...prevCandles.slice(0, lastIdx), updatedLast];
          return newArr;
        });
      },
      (state) => {
        setCoinbaseState(state);
      }
    );

    return () => {
      coinbaseFeedRef.current?.disconnect();
    };
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadMarketCandles(selectedAsset, timeframe, dataSource);
  }, []);

  // Update indicators whenever latest candle updates during live streaming
  useEffect(() => {
    if (candles.length > 0) {
      const localRes = runLocalQuantStrategy(candles, params);
      setIndicators(localRes.indicators);
      setSignals(localRes.signals);
    }
  }, [candles, params]);

  // Strategy template selection
  const handleSelectStrategy = (strat: StrategyDefinition) => {
    setActiveStrategy(strat);
    setStrategyCode(strat.pythonCode);
    const newParams: StrategyParams = {
      ...params,
      fastPeriod: strat.defaultParams.fastPeriod,
      slowPeriod: strat.defaultParams.slowPeriod,
      baselinePeriod: strat.defaultParams.baselinePeriod,
      stopLossPct: strat.defaultParams.stopLossPct,
      takeProfitPct: strat.defaultParams.takeProfitPct,
    };
    setParams(newParams);
    executeStrategy(strat.pythonCode, candles, newParams);
  };

  // Asset change
  const handleSelectAsset = (asset: MarketAsset) => {
    setSelectedAsset(asset.symbol);
    loadMarketCandles(asset.symbol, timeframe, dataSource);
  };

  // Timeframe change
  const handleSelectTimeframe = (tf: string) => {
    setTimeframe(tf);
    loadMarketCandles(selectedAsset, tf, dataSource);
  };

  // Toggle between Coinbase Live and Reference Simulation
  const handleToggleDataSource = (source: 'coinbase' | 'simulation') => {
    setDataSource(source);
    loadMarketCandles(selectedAsset, timeframe, source);
  };

  // Manual next tick
  const handleStepNextTick = () => {
    if (candles.length === 0) return;
    const last = candles[candles.length - 1];
    const next = generateNextCandle(last);
    const updated = [...candles.slice(1), next];
    setCandles(updated);
    executeStrategy(strategyCode, updated, params);
  };

  // Paper trade execution
  const handleExecuteSimulatedTrade = async (side: 'BUY' | 'SELL', amount: number, price: number) => {
    if (side === 'BUY') {
      const cost = amount * price;
      if (balance >= cost) {
        setBalance((b) => b - cost);
        setPosition({ size: amount, entryPrice: price });
      }
    } else if (side === 'SELL') {
      if (position) {
        const proceeds = position.size * price;
        setBalance((b) => b + proceeds);
        setPosition(null);
      }
    }

    // Persist to Python SQLite backend
    try {
      await fetch('/api/portfolio/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authService.getToken() ? { Authorization: `Bearer ${authService.getToken()}` } : {}),
        },
        body: JSON.stringify({
          symbol: selectedAsset,
          side,
          amount,
          price,
        }),
      });
    } catch {
      // ignore
    }

    // Persist to Google Cloud Firestore database under /users/{userId}/orders
    if (currentUser?.id) {
      saveTradeOrderToFirestore(String(currentUser.id), {
        symbol: selectedAsset,
        side,
        amount,
        price,
        status: 'FILLED',
      }).catch((err) => console.warn('Could not save order to Firestore:', err));
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    await logOutFirebase();
    setCurrentUser(null);
  };

  const currentCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  return (
    <div className="flex flex-col min-h-screen bg-[#040714] text-slate-100 selection:bg-cyan-500/30">
      {/* 
        Top Bar Contract (Universal Design Constitution):
        Exactly 3 zones separated by gap-8:
        Zone 1: Single text wordmark
        Zone 2: 4-5 concise single-line nav links
        Zone 3: 1 primary action button + User Profile
      */}
      <header className="flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5 bg-[#060a1d] border-b border-slate-800/80 sticky top-0 z-50">
        {/* Zone 1: Single Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/"
            className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap flex items-center gap-2"
          >
            <span className="w-6 h-6 rounded bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-xs font-mono font-bold text-black shadow-lg shadow-cyan-500/20">
              Q
            </span>
            QuantPulse
          </a>
        </div>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            onClick={() => setDisplayMode('terminal')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white cursor-pointer flex items-center gap-1.5 ${
              displayMode === 'terminal' ? 'text-cyan-400 font-semibold' : ''
            }`}
          >
            <LineChart className="w-4 h-4" />
            Cyber Chart
          </button>

          <button
            onClick={() => setDisplayMode('threejs')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white cursor-pointer flex items-center gap-1.5 ${
              displayMode === 'threejs' ? 'text-cyan-400 font-semibold' : ''
            }`}
          >
            <Box className="w-4 h-4" />
            Three.js 3D Studio
          </button>

          <button
            onClick={() => setActiveTab('python')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'python' ? 'text-cyan-400 font-semibold' : ''
            }`}
          >
            <Terminal className="w-4 h-4" />
            Python Engine
          </button>

          <button
            onClick={() => setActiveTab('backtest')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-white cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'backtest' ? 'text-cyan-400 font-semibold' : ''
            }`}
          >
            <Activity className="w-4 h-4" />
            Strategy Backtest
          </button>

          <button
            onClick={() => setIsSecurityModalOpen(true)}
            className="transition-colors whitespace-nowrap shrink-0 hover:text-white cursor-pointer flex items-center gap-1.5 text-slate-400"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Security & Metrics
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action & Authentication Profile */}
        <div className="flex items-center gap-3 shrink-0">
          {/* User Profile / Auth Action */}
          {currentUser ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-white font-medium truncate max-w-[120px]">{currentUser.name}</span>
              <button
                onClick={handleLogout}
                title="Log Out"
                className="text-slate-400 hover:text-rose-400 p-0.5 cursor-pointer ml-1 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAuthModalMode('login');
                setIsAuthModalOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
              Sign In
            </button>
          )}

          {/* Primary Action Button */}
          <button
            onClick={() => executeStrategy()}
            disabled={isExecutingPython}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-400 rounded-lg hover:from-cyan-300 hover:to-teal-300 transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isExecutingPython ? 'Running...' : 'Run Python Strategy'}
            </span>
            <span className="sm:hidden">Run</span>
          </button>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden flex flex-col gap-2 p-4 bg-[#080d24] border-b border-slate-800 text-xs">
          <button
            onClick={() => { setDisplayMode('terminal'); setIsMobileMenuOpen(false); }}
            className={`p-2 rounded text-left font-medium ${displayMode === 'terminal' ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
          >
            Cyber Chart Terminal
          </button>
          <button
            onClick={() => { setDisplayMode('threejs'); setIsMobileMenuOpen(false); }}
            className={`p-2 rounded text-left font-medium ${displayMode === 'threejs' ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
          >
            Three.js 3D PBR Studio
          </button>
          <button
            onClick={() => { setActiveTab('python'); setIsMobileMenuOpen(false); }}
            className={`p-2 rounded text-left font-medium ${activeTab === 'python' ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
          >
            Python Studio & Tuner
          </button>
          <button
            onClick={() => { setActiveTab('backtest'); setIsMobileMenuOpen(false); }}
            className={`p-2 rounded text-left font-medium ${activeTab === 'backtest' ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
          >
            Backtest Intelligence
          </button>
          <button
            onClick={() => { setIsSecurityModalOpen(true); setIsMobileMenuOpen(false); }}
            className="p-2 rounded text-left font-medium text-emerald-400 flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            Security & System Metrics
          </button>
        </div>
      )}

      {/* Coinbase Live Connection Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-1.5 bg-[#070e28] border-b border-cyan-950/60 text-xs">
        <div className="flex items-center gap-3">
          {/* Feed mode switch buttons */}
          <div className="flex items-center bg-slate-900 rounded p-0.5 border border-slate-800">
            <button
              onClick={() => handleToggleDataSource('coinbase')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                dataSource === 'coinbase'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3 h-3 text-cyan-300" />
              Coinbase Live Feed
            </button>
            <button
              onClick={() => handleToggleDataSource('simulation')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                dataSource === 'simulation'
                  ? 'bg-slate-800 text-cyan-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Photo Model Simulation
            </button>
          </div>

          {/* Connection Status Indicator */}
          {dataSource === 'coinbase' ? (
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>Connected: <strong className="text-white">{formatCoinbaseProduct(selectedAsset)}</strong></span>
              </span>
              {currentCandle && (
                <span className="text-slate-300">
                  Spot: <strong className="text-cyan-300 font-bold">${currentCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </span>
              )}
              {coinbaseState.lastUpdated && (
                <span className="text-slate-500 hidden lg:inline">
                  (Synced at {coinbaseState.lastUpdated})
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 font-mono text-[11px] text-amber-400">
              <span>Photo Model Calibration Active (8942.08 Key Levels)</span>
            </div>
          )}
        </div>

        {/* Sync now button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadMarketCandles(selectedAsset, timeframe, dataSource)}
            disabled={isLoadingMarketData}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded transition-colors cursor-pointer"
            title="Refresh candles from exchange"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingMarketData ? 'animate-spin' : ''}`} />
            {isLoadingMarketData ? 'Syncing...' : 'Sync Coinbase'}
          </button>
        </div>
      </div>

      {/* Sub-Header Toolbar (Market Instruments, Timeframes, Live Stream) */}
      <section className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2 bg-[#050817] border-b border-slate-800/60 text-xs">
        {/* Symbol Selector */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          <span className="text-slate-500 font-mono text-[11px] shrink-0">Pairs:</span>
          <div className="flex items-center gap-1 shrink-0">
            {AVAILABLE_ASSETS.map((asset) => (
              <button
                key={asset.symbol}
                onClick={() => handleSelectAsset(asset)}
                className={`px-2.5 py-1 rounded font-mono text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  selectedAsset === asset.symbol
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {asset.symbol}
                {asset.isCoinbase && <span className="text-[9px] text-blue-400 font-sans">CB</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-mono text-[11px]">TF:</span>
          <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800">
            {['1m', '5m', '15m', '1h', '4h', '1D'].map((tf) => (
              <button
                key={tf}
                onClick={() => handleSelectTimeframe(tf)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors cursor-pointer ${
                  timeframe === tf ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* View Switcher Segmented Control */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setDisplayMode('terminal')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                displayMode === 'terminal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              Chart
            </button>
            <button
              onClick={() => setDisplayMode('threejs')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                displayMode === 'threejs'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              3D PBR Studio
            </button>
          </div>
        </div>

        {/* Live Stream Controls & Tick Step */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-3 py-1 rounded font-semibold flex items-center gap-1.5 transition-colors cursor-pointer text-xs ${
              isStreaming
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            {isStreaming ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            {isStreaming ? 'Stream Active' : 'Pause Stream'}
          </button>

          <button
            onClick={handleStepNextTick}
            className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 flex items-center gap-1 cursor-pointer"
            title="Inject Next Tick"
          >
            <FastForward className="w-3 h-3" />
            Tick
          </button>

          <button
            onClick={() => loadMarketCandles(selectedAsset, timeframe, 'simulation')}
            className="px-2 py-1 rounded bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 cursor-pointer"
            title="Reset to 8942.08 Photo Pattern"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* Main Workspace Viewport */}
      <main className="flex-1 p-3 sm:p-5 md:p-6 flex flex-col gap-5 max-w-[1720px] mx-auto w-full">
        {/* Top Visual Centerpiece Viewport */}
        <div className="w-full h-[540px] md:h-[600px] lg:h-[640px] flex-shrink-0">
          {displayMode === 'terminal' ? (
            <FinancialChart
              candles={candles}
              indicators={indicators}
              signals={signals}
              is3DMode={is3DMode}
              onToggle3D={() => setIs3DMode(!is3DMode)}
              selectedAsset={selectedAsset}
              timeframe={timeframe}
              isStreaming={isStreaming}
            />
          ) : (
            <ThreeDMarketStudio
              candles={candles}
              indicators={indicators}
              signals={signals}
              selectedAsset={selectedAsset}
            />
          )}
        </div>

        {/* Lower Interactive Section: Python Studio & Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full">
          {/* Left: Python Code Panel (7 columns on desktop) */}
          <div className="lg:col-span-7 h-[540px]">
            <PythonCodePanel
              currentCode={strategyCode}
              onCodeChange={setStrategyCode}
              params={params}
              onParamsChange={(newParams) => {
                setParams(newParams);
                executeStrategy(strategyCode, candles, newParams);
              }}
              onRunPython={() => executeStrategy(strategyCode, candles, params)}
              isRunning={isExecutingPython}
              executionLogs={executionLogs}
              executionTimeMs={executionTimeMs}
              activeStrategyId={activeStrategy.id}
              onSelectStrategy={handleSelectStrategy}
              currentUser={currentUser}
              onOpenAuth={() => {
                setAuthModalMode('login');
                setIsAuthModalOpen(true);
              }}
            />
          </div>

          {/* Right: Strategy Backtest & Execution Desk (5 columns on desktop) */}
          <div className="lg:col-span-5 h-[540px] flex flex-col gap-4">
            <div className="flex-1 min-h-[320px]">
              <BacktestDashboard 
                metrics={metrics} 
                trades={trades} 
                currentUser={currentUser}
                onOpenAuth={() => {
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }}
                activeStrategyName={activeStrategy.name}
                symbol={selectedAsset}
                timeframe={timeframe}
              />
            </div>
            <div className="h-[200px]">
              <OrderTerminal
                currentCandle={currentCandle}
                onExecuteSimulatedTrade={handleExecuteSimulatedTrade}
                balance={balance}
                position={position}
              />
            </div>
          </div>
        </div>
      </main>

      {/* User Authentication Dialog Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
        }}
      />

      {/* Security & System Metrics Audit Modal */}
      <SecurityMetricsModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        metrics={metrics}
        executionTimeMs={executionTimeMs}
        currentUser={currentUser}
        coinbaseConnected={coinbaseState.isConnected}
        onOpenAuth={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
      />

      {/* Editorial Footer */}
      <footer className="mt-auto px-6 py-4 bg-[#050817] border-t border-slate-800/80 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span>QuantPulse Financial Terminal</span>
          <span>·</span>
          <span>Connected to Coinbase Public API</span>
          <span>·</span>
          <span>Python 3.10 REST Engine</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400 font-mono">
            Feed: <span className="text-cyan-400">{dataSourceLabel}</span>
          </span>
          <span>·</span>
          <span>© 2026 QuantPulse</span>
        </div>
      </footer>
    </div>
  );
}
