import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Candle, SignalMarker, TechnicalIndicators } from '../types/market';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Eye, Sliders, Layers } from 'lucide-react';

interface FinancialChartProps {
  candles: Candle[];
  indicators: TechnicalIndicators;
  signals: SignalMarker[];
  is3DMode: boolean;
  onToggle3D: () => void;
  selectedAsset: string;
  timeframe: string;
  isStreaming: boolean;
}

export const FinancialChart: React.FC<FinancialChartProps> = ({
  candles,
  indicators,
  signals,
  is3DMode,
  onToggle3D,
  selectedAsset,
  timeframe,
  isStreaming,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport / zoom / pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // 3D Angle tilt parameters (allowing user to fine-tune the perspective like the image!)
  const [tiltX, setTiltX] = useState<number>(14);
  const [tiltY, setTiltY] = useState<number>(-8);
  const [perspectiveDist, setPerspectiveDist] = useState<number>(1100);

  // Crosshair state
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Overlay visibility toggles
  const [showFastEma, setShowFastEma] = useState<boolean>(true);
  const [showSlowEma, setShowSlowEma] = useState<boolean>(true);
  const [showBaseline, setShowBaseline] = useState<boolean>(true);
  const [showSignals, setShowSignals] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showGridLabels, setShowGridLabels] = useState<boolean>(true);
  const [neonTheme, setNeonTheme] = useState<boolean>(true); // Cyan/Magenta neon vs Classic Green/Red

  // Visible candles range based on zoom and pan
  const visibleRange = useMemo(() => {
    const total = candles.length;
    if (total === 0) return { start: 0, end: 0, count: 0 };

    const baseCount = Math.min(total, 65);
    const count = Math.max(20, Math.min(total, Math.floor(baseCount / zoomLevel)));
    
    // Default pan shows the rightmost candles
    const maxOffset = total - count;
    const effectivePan = Math.max(0, Math.min(maxOffset, Math.floor(maxOffset + panOffset)));
    const start = effectivePan;
    const end = Math.min(total, start + count);

    return { start, end, count: end - start };
  }, [candles.length, zoomLevel, panOffset]);

  // Main rendering loop onto HTML5 Canvas
  const renderChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    // Resize canvas buffer for crisp high-DPI retina display
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Deep cyber gradient backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#040714');
    bgGrad.addColorStop(0.5, '#070d24');
    bgGrad.addColorStop(1, '#03050e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const visibleCandles = candles.slice(visibleRange.start, visibleRange.end);
    if (visibleCandles.length === 0) {
      ctx.restore();
      return;
    }

    // Layout dimensions
    const priceScaleWidth = 90;
    const timeScaleHeight = 30;
    const volumeHeight = showVolume ? Math.floor(height * 0.18) : 0;
    const chartHeight = height - timeScaleHeight - volumeHeight;
    const chartWidth = width - priceScaleWidth;

    // Determine min/max price for visible window
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    // Check indicators in visible range
    if (showFastEma && indicators.fastEma) {
      for (let i = visibleRange.start; i < visibleRange.end; i++) {
        const val = indicators.fastEma[i];
        if (val !== null && val !== undefined) {
          if (val < minPrice) minPrice = val;
          if (val > maxPrice) maxPrice = val;
        }
      }
    }

    // Add padding to price scale (8%)
    const priceRange = maxPrice - minPrice || 1;
    const paddedMin = minPrice - priceRange * 0.08;
    const paddedMax = maxPrice + priceRange * 0.08;
    const effectivePriceRange = paddedMax - paddedMin;

    // Coordinate conversion helpers
    const priceToY = (price: number): number => {
      return chartHeight - ((price - paddedMin) / effectivePriceRange) * chartHeight;
    };

    const indexToX = (localIndex: number): number => {
      const step = chartWidth / visibleCandles.length;
      return localIndex * step + step / 2;
    };

    // 1. Draw glowing grid lines (Horizontal price levels & Vertical time markers)
    // We explicitly generate grid lines matching key reference image levels if applicable
    const gridStepCount = 9;
    const priceStep = effectivePriceRange / gridStepCount;
    ctx.lineWidth = 1;

    for (let i = 0; i <= gridStepCount; i++) {
      const p = paddedMin + i * priceStep;
      const y = Math.floor(priceToY(p)) + 0.5;

      // Glowing horizontal grid line
      ctx.beginPath();
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(28, 58, 120, 0.45)' : 'rgba(18, 38, 80, 0.3)';
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Horizontal price tag badge on the right
      if (showGridLabels) {
        ctx.fillStyle = 'rgba(125, 160, 220, 0.85)';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(p.toFixed(2), chartWidth + 12, y + 4);
      }
    }

    // Vertical time grid lines
    const timeStep = Math.max(1, Math.floor(visibleCandles.length / 8));
    for (let i = 0; i < visibleCandles.length; i += timeStep) {
      const x = Math.floor(indexToX(i)) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(22, 45, 95, 0.3)';
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - timeScaleHeight);
      ctx.stroke();

      // Time label at bottom
      ctx.fillStyle = 'rgba(100, 130, 185, 0.7)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const candle = visibleCandles[i];
      if (candle) {
        ctx.fillText(candle.time || candle.date, x, height - 10);
      }
    }

    // 2. Draw Volume histogram in bottom region
    if (showVolume && maxVolume > 0) {
      const volTop = chartHeight + 10;
      const volAreaHeight = volumeHeight - 16;
      const candleWidth = Math.max(2, (chartWidth / visibleCandles.length) * 0.75);

      visibleCandles.forEach((c, idx) => {
        const x = indexToX(idx);
        const barHeight = (c.volume / maxVolume) * volAreaHeight;
        const y = volTop + volAreaHeight - barHeight;
        const isBullish = c.close >= c.open;

        ctx.fillStyle = isBullish
          ? (neonTheme ? 'rgba(0, 229, 255, 0.45)' : 'rgba(34, 197, 94, 0.45)')
          : (neonTheme ? 'rgba(244, 63, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)');

        ctx.fillRect(x - candleWidth / 2, y, candleWidth, barHeight);
      });

      // Volume boundary divider
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(30, 58, 110, 0.5)';
      ctx.moveTo(0, chartHeight);
      ctx.lineTo(chartWidth, chartHeight);
      ctx.stroke();
    }

    // 3. Draw Candlesticks
    const candleWidth = Math.max(3, (chartWidth / visibleCandles.length) * 0.72);
    visibleCandles.forEach((c, idx) => {
      const x = indexToX(idx);
      const isBullish = c.close >= c.open;
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);
      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(openY - closeY));

      const bullColor = neonTheme ? '#00e5ff' : '#22c55e';
      const bearColor = neonTheme ? '#f43f5e' : '#ef4444';
      const bullFill = neonTheme ? 'rgba(0, 229, 255, 0.85)' : 'rgba(34, 197, 94, 0.85)';
      const bearFill = neonTheme ? 'rgba(244, 63, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';

      // Draw High/Low Wick
      ctx.beginPath();
      ctx.strokeStyle = isBullish ? bullColor : bearColor;
      ctx.lineWidth = 1.5;
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Draw Candle Body with subtle outer neon glow
      ctx.save();
      if (neonTheme) {
        ctx.shadowColor = isBullish ? 'rgba(0, 229, 255, 0.5)' : 'rgba(244, 63, 94, 0.5)';
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = isBullish ? bullFill : bearFill;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);

      // Delicate candle border
      ctx.strokeStyle = isBullish ? bullColor : bearColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.restore();
    });

    // Helper to draw smooth indicator lines
    const drawIndicatorLine = (
      series: (number | null)[],
      color: string,
      glowColor: string,
      lineWidth: number
    ) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      let started = false;

      for (let i = 0; i < visibleCandles.length; i++) {
        const globalIdx = visibleRange.start + i;
        const val = series[globalIdx];
        if (val === null || val === undefined) continue;

        const x = indexToX(i);
        const y = priceToY(val);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.restore();
    };

    // 4. Draw Baseline (Cyan/Teal)
    if (showBaseline && indicators.baseline) {
      drawIndicatorLine(indicators.baseline, '#06b6d4', 'rgba(6, 182, 212, 0.5)', 2);
    }

    // 5. Draw Slow EMA (Purple / Magenta)
    if (showSlowEma && indicators.slowEma) {
      drawIndicatorLine(indicators.slowEma, '#c026d3', 'rgba(192, 38, 211, 0.6)', 2.5);
    }

    // 6. Draw Fast EMA (Yellow Trend Line - Hero line from photo!)
    if (showFastEma && indicators.fastEma) {
      drawIndicatorLine(indicators.fastEma, '#facc15', 'rgba(250, 204, 21, 0.8)', 3);

      // Render floating numeric rate tags along the yellow curve (as seen in reference image: 11.47, 13.12, 14.37, 16.02, 17.27)
      const tagInterval = Math.max(4, Math.floor(visibleCandles.length / 5));
      for (let i = 2; i < visibleCandles.length; i += tagInterval) {
        const globalIdx = visibleRange.start + i;
        const val = indicators.fastEma[globalIdx];
        if (val !== null && val !== undefined) {
          const x = indexToX(i);
          const y = priceToY(val);
          // Calculate an authentic momentum / derivative rate value
          const prevVal = indicators.fastEma[globalIdx - 2] || val;
          const rateVal = Math.abs(((val - prevVal) / prevVal) * 1000).toFixed(2);

          // Draw yellow tag pill with subtle dark backing
          ctx.save();
          ctx.fillStyle = 'rgba(5, 10, 25, 0.85)';
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1;
          const text = `${rateVal}`;
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(text).width;
          const px = x + 6;
          const py = y - 18;

          ctx.fillRect(px - 4, py - 12, textWidth + 8, 16);
          ctx.strokeRect(px - 4, py - 12, textWidth + 8, 16);

          ctx.fillStyle = '#fef08a';
          ctx.fillText(text, px, py);
          ctx.restore();
        }
      }
    }

    // 7. Draw Visual Signals & Badges (Matching photo)
    if (showSignals) {
      signals.forEach((sig) => {
        const localIdx = sig.candleIndex - visibleRange.start;
        if (localIdx < 0 || localIdx >= visibleCandles.length) return;

        const x = indexToX(localIdx);
        const y = priceToY(sig.price);

        ctx.save();
        if (sig.type === 'buy') {
          // Upward Glowing Triangle (Yellow/Green)
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.shadowColor = 'rgba(250, 204, 21, 0.9)';
          ctx.shadowBlur = 10;

          const size = 11;
          ctx.beginPath();
          ctx.moveTo(x, y - size); // top tip
          ctx.lineTo(x - size, y + size * 0.7);
          ctx.lineTo(x + size, y + size * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Green secondary indicator triangle beneath
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(x, y + size * 1.1);
          ctx.lineTo(x - size * 0.7, y + size * 2.2);
          ctx.lineTo(x + size * 0.7, y + size * 2.2);
          ctx.closePath();
          ctx.fill();
        } else if (sig.type === 'sell') {
          // Downward Glowing Triangle (Magenta/Rose)
          ctx.fillStyle = '#f43f5e';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.shadowColor = 'rgba(244, 63, 94, 0.9)';
          ctx.shadowBlur = 10;

          const size = 11;
          ctx.beginPath();
          ctx.moveTo(x, y + size); // bottom tip
          ctx.lineTo(x - size, y - size * 0.7);
          ctx.lineTo(x + size, y - size * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (sig.type === 'target') {
          // Magenta target circle disc (● as in photo)
          ctx.fillStyle = '#ec4899';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = 'rgba(236, 72, 153, 0.9)';
          ctx.shadowBlur = 12;

          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (sig.label) {
            ctx.fillStyle = '#fbcfe8';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(sig.label, x, y - 12);
          }
        }
        ctx.restore();
      });
    }

    // 8. Draw Crosshair & Tooltip
    if (mousePos && mousePos.x <= chartWidth && mousePos.y <= chartHeight) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height - timeScaleHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(chartWidth, mousePos.y);
      ctx.stroke();

      // Price badge on right
      const cursorPrice = paddedMax - (mousePos.y / chartHeight) * effectivePriceRange;
      ctx.setLineDash([]);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(chartWidth + 4, mousePos.y - 10, priceScaleWidth - 8, 20);
      ctx.strokeStyle = '#00e5ff';
      ctx.strokeRect(chartWidth + 4, mousePos.y - 10, priceScaleWidth - 8, 20);

      ctx.fillStyle = '#00e5ff';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(cursorPrice.toFixed(2), chartWidth + 10, mousePos.y + 4);
      ctx.restore();
    }

    // 9. Right Scale separator
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(30, 58, 110, 0.6)';
    ctx.lineWidth = 1;
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, height);
    ctx.stroke();

    ctx.restore();
  }, [
    candles,
    indicators,
    signals,
    visibleRange,
    showFastEma,
    showSlowEma,
    showBaseline,
    showSignals,
    showVolume,
    showGridLabels,
    neonTheme,
    mousePos,
  ]);

  // Request Animation Frame sync for ultra-fluid rendering
  useEffect(() => {
    let animId: number;
    const triggerRender = () => {
      renderChart();
    };
    animId = requestAnimationFrame(triggerRender);
    return () => cancelAnimationFrame(animId);
  }, [renderChart]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      renderChart();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderChart]);

  // Mouse interaction handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    // Handle panning if dragging
    if (isDragging) {
      const deltaX = x - dragStartX;
      const sensitivity = 0.4;
      setPanOffset((prev) => prev - deltaX * sensitivity);
      setDragStartX(x);
      return;
    }

    // Identify hovered candle
    const priceScaleWidth = 90;
    const chartWidth = rect.width - priceScaleWidth;
    if (x <= chartWidth && visibleRange.count > 0) {
      const step = chartWidth / visibleRange.count;
      const localIdx = Math.max(0, Math.min(visibleRange.count - 1, Math.floor(x / step)));
      const globalIdx = visibleRange.start + localIdx;
      const candle = candles[globalIdx] || null;
      setHoveredCandle(candle);
    } else {
      setHoveredCandle(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStartX(e.clientX - rect.left);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setMousePos(null);
    setHoveredCandle(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((prev) => Math.max(0.4, Math.min(3.5, prev + zoomDelta)));
  };

  const resetView = () => {
    setZoomLevel(1);
    setPanOffset(0);
  };

  // Active HUD candle (either hovered or the latest current candle)
  const displayCandle = hoveredCandle || candles[candles.length - 1];
  const priceChange = displayCandle ? displayCandle.close - displayCandle.open : 0;
  const priceChangePct = displayCandle ? (priceChange / displayCandle.open) * 100 : 0;

  return (
    <div className="relative flex flex-col w-full h-full bg-[#050814] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Chart Top HUD & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-[#080d22] border-b border-slate-800/80 z-20">
        {/* Left: Asset and OHLCV Data HUD */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-wide text-white">{selectedAsset}</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-800 text-cyan-400 rounded">
              {timeframe}
            </span>
            {isStreaming && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          {displayCandle && (
            <div className="hidden lg:flex items-center gap-3 text-slate-300">
              <span>O: <span className="text-white tabular-nums">{displayCandle.open.toFixed(2)}</span></span>
              <span>H: <span className="text-white tabular-nums">{displayCandle.high.toFixed(2)}</span></span>
              <span>L: <span className="text-white tabular-nums">{displayCandle.low.toFixed(2)}</span></span>
              <span>C: <span className={`font-semibold tabular-nums ${priceChange >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>{displayCandle.close.toFixed(2)}</span></span>
              <span className={`tabular-nums ${priceChange >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
              </span>
              <span>Vol: <span className="text-slate-400 tabular-nums">{displayCandle.volume.toLocaleString()}</span></span>
            </div>
          )}
        </div>

        {/* Right: Interactive Chart Feature Toggles */}
        <div className="flex items-center gap-2 text-xs">
          {/* Neon vs Classic Palette */}
          <button
            onClick={() => setNeonTheme(!neonTheme)}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              neonTheme ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Toggle Neon Cyber Glow (Photo Mode) vs Classic Theme"
          >
            {neonTheme ? 'Cyber Neon' : 'Classic'}
          </button>

          {/* Indicators dropdown / pill toggles */}
          <button
            onClick={() => setShowFastEma(!showFastEma)}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              showFastEma ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-slate-800/80 text-slate-400'
            }`}
            title="Toggle Yellow Fast Trend EMA"
          >
            <span className="w-2 h-0.5 bg-amber-400 inline-block" />
            EMA-9
          </button>

          <button
            onClick={() => setShowSlowEma(!showSlowEma)}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              showSlowEma ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40' : 'bg-slate-800/80 text-slate-400'
            }`}
            title="Toggle Purple Slow Trend EMA"
          >
            <span className="w-2 h-0.5 bg-fuchsia-500 inline-block" />
            EMA-21
          </button>

          <button
            onClick={() => setShowBaseline(!showBaseline)}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              showBaseline ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800/80 text-slate-400'
            }`}
            title="Toggle Cyan Baseline"
          >
            <span className="w-2 h-0.5 bg-cyan-400 inline-block" />
            EMA-50
          </button>

          <button
            onClick={() => setShowSignals(!showSignals)}
            className={`px-2 py-1 rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              showSignals ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800/80 text-slate-400'
            }`}
            title="Toggle Buy & Sell Triangles"
          >
            ▲▼ Signals
          </button>

          {/* 3D Perspective Mode Toggle (Matches the uploaded reference image angle!) */}
          <button
            onClick={onToggle3D}
            className={`px-3 py-1 font-medium rounded flex items-center gap-1.5 transition-all whitespace-nowrap ${
              is3DMode
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="Toggle 3D Perspective Grid Camera View"
          >
            <Layers className="w-3.5 h-3.5" />
            {is3DMode ? '3D Angled' : '2D Flat'}
          </button>

          {/* Zoom & Reset Controls */}
          <div className="flex items-center bg-slate-800/80 rounded border border-slate-700/60 overflow-hidden">
            <button
              onClick={() => setZoomLevel((z) => Math.min(3.5, z + 0.2))}
              className="p-1 hover:bg-slate-700 text-slate-300"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.2))}
              className="p-1 hover:bg-slate-700 text-slate-300"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetView}
              className="p-1 hover:bg-slate-700 text-slate-300"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3D Angle Tuning Drawer (Only visible when 3D mode is active) */}
      {is3DMode && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a1029] border-b border-indigo-900/50 text-[11px] text-indigo-200">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-indigo-400">3D Perspective Camera:</span>
            <label className="flex items-center gap-1.5">
              Pitch (X):
              <input
                type="range"
                min="0"
                max="35"
                value={tiltX}
                onChange={(e) => setTiltX(Number(e.target.value))}
                className="w-20 accent-indigo-400 h-1 cursor-pointer"
              />
              <span className="font-mono">{tiltX}°</span>
            </label>
            <label className="flex items-center gap-1.5">
              Yaw (Y):
              <input
                type="range"
                min="-25"
                max="25"
                value={tiltY}
                onChange={(e) => setTiltY(Number(e.target.value))}
                className="w-20 accent-indigo-400 h-1 cursor-pointer"
              />
              <span className="font-mono">{tiltY}°</span>
            </label>
          </div>
          <button
            onClick={() => { setTiltX(14); setTiltY(-8); }}
            className="hover:text-white underline text-[10px]"
          >
            Reset Angle to Photo Match
          </button>
        </div>
      )}

      {/* Main Chart Canvas Viewport */}
      <div
        ref={containerRef}
        className={`relative flex-1 w-full overflow-hidden ${
          is3DMode ? 'perspective-container p-4 md:p-6' : 'p-0'
        }`}
      >
        <div
          className={`w-full h-full relative ${
            is3DMode ? 'perspective-chart-3d shadow-2xl ring-1 ring-cyan-500/20 rounded-xl' : 'perspective-chart-flat'
          }`}
          style={
            is3DMode
              ? {
                  transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(0.96)`,
                  transformStyle: 'preserve-3d',
                }
              : undefined
          }
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            className="w-full h-full cursor-crosshair block select-none"
          />

          {/* Floating watermarked key price indicators for visual fidelity */}
          <div className="absolute top-4 left-4 pointer-events-none opacity-40 font-mono text-[10px] text-cyan-400">
            <span>GRID LEVEL: 8942.08 · AUTO SIGNAL RADAR</span>
          </div>
        </div>
      </div>
    </div>
  );
};
