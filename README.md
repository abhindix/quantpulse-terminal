# QuantPulse - Quantitative Trading Terminal & Financial Chart Engine

A high-performance quantitative trading terminal and financial chart engine featuring live Coinbase market data streaming, 3D interactive chart visualization, multi-indicator technical analysis, custom Python strategy execution & backtesting engine, Firebase Cloud Firestore sync, and an ACID-compliant ledger.

---

## 🌟 Key Features

- **Live Coinbase WebSocket Sync**: Real-time ticker and order book streaming directly from `wss://ws-feed.exchange.coinbase.com` across multiple pairs (`BTC-USD`, `ETH-USD`, `SOL-USD`, `AVAX-USD`, `LINK-USD`, etc.).
- **Interactive Candlestick Engine**:
  - High-performance canvas and SVG rendering with zoom, pan, and real-time candle updates.
  - Interactive **3D Perspective Mode** with tilt, pitch, and depth visualization.
  - Technical Overlays: EMA (9/21/50/200), SMA (20/50), Bollinger Bands, RSI (14), MACD, Volume Delta profile, and automated signal detection (RSI Divergence, MACD Crosses, Golden/Death Crosses).
- **Python Strategy Sandbox & Backtester**:
  - In-browser code editor with presets for Dual Moving Average, RSI Mean Reversion, Bollinger Breakout, and Momentum Trend Following.
  - Detailed performance metrics: Total Return %, Annualized Return, Sharpe Ratio, Sortino Ratio, Maximum Drawdown %, Win Rate %, Profit Factor, and trade log timeline.
  - **Export to CSV**: Instant one-click export of complete backtest performance metrics, statistical summaries, and trade execution logs into standardized CSV files.
  - **Cloud Strategy & Backtest Persistence**: Save and load custom algorithms and historical backtest runs directly to Google Cloud Firestore.
- **Dual Authentication & Security Architecture**:
  - **Firebase Authentication & Google Sign-In**: Enterprise OAuth with single-click sign-in and encrypted session handling.
  - **Python SQLite PBKDF2 Engine**: Local self-hosted authentication option using 100,000-iteration PBKDF2-SHA256 password hashing with unique 32-byte salts and JWT/bearer session tokens.
  - **Firestore Granular Security Rules**: Role-based and user-isolated subcollections (`users/{userId}/strategies`, `users/{userId}/backtests`, `users/{userId}/orders`) strictly protected against unauthenticated read/write.
- **Paper Trading & Simulated Order Execution**:
  - Live order placement (Market & Limit) with configurable slippage, position sizing, and leverage.
  - Real-time portfolio tracking with unrealized/realized PnL, margin utilization, and order history.

---

## 🏗️ Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │              React 19 Frontend               │
                      │  (Vite + TypeScript + Tailwind CSS + Lucide) │
                      └───────┬──────────────┬──────────────┬────────┘
                              │              │              │
                              ▼              ▼              ▼
     ┌────────────────────────┴───┐   ┌──────┴─────────┐   ┌┴───────────────────────────┐
     │ Coinbase WebSocket Stream  │   │ Firebase Auth  │   │ Python Backend (FastAPI)   │
     │ wss://ws-feed.exchange...  │   │ & Firestore DB │   │ - Strategy Runner          │
     │ (Real-time L2 Ticker Feed) │   │ (Cloud Sync)   │   │ - SQLite3 PBKDF2 Ledger    │
     └────────────────────────────┘   └────────────────┘   └────────────────────────────┘
```

---

## 🚀 Quick Start & Installation

### Prerequisites
- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm** or **bun** / **yarn**
- **Python**: v3.10 or later (with `pip`)

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/quantpulse-terminal.git
cd quantpulse-terminal
```

### 2. Frontend & Node Services Setup
```bash
# Install npm dependencies
npm install

# Setup environment variables
cp .env.example .env
```

### 3. Python Backend Setup
```bash
# Optional: create a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install required Python packages
pip install fastapi uvicorn pydantic numpy pandas
```

### 4. Running the Development Servers

**Run the Frontend Dev Server:**
```bash
npm run dev
# Server will start on http://localhost:3000
```

**Run the Python Quantitative Engine:**
```bash
python3 python_backend/api_server.py
# Backend API will start on http://127.0.0.1:8000
```

---

## 📁 Project Structure

```
├── python_backend/
│   ├── api_server.py           # FastAPI server: strategy execution, PBKDF2 auth & SQLite ledger
├── src/
│   ├── components/
│   │   ├── BacktestDashboard.tsx     # Performance analytics, trade logs & CSV exporter
│   │   ├── FinancialChart.tsx        # High-FPS canvas/SVG chart with 3D tilt & indicators
│   │   ├── PythonCodePanel.tsx       # In-browser strategy editor & cloud sync
│   │   ├── OrderForm.tsx             # Paper trading & execution panel
│   │   ├── AuthModal.tsx             # Dual Firebase Google + PBKDF2 SQLite Auth modal
│   │   ├── SecurityMetricsModal.tsx  # Interactive security & architectural inspector
│   │   ├── Header.tsx                # Status bars, connection badges, account controls
│   │   └── ...
│   ├── services/
│   │   ├── authService.ts            # Authentication manager & API clients
│   │   ├── coinbaseService.ts        # WebSocket listener & REST market candle historical sync
│   │   ├── firebase.ts               # Firebase initialization, Google Auth & Firestore client
│   │   ├── pythonStrategies.ts       # Strategy templates & Python engine bridge
│   │   └── marketData.ts             # Indicator mathematical calculators (EMA, RSI, MACD, etc.)
│   ├── types/
│   │   └── market.ts                 # TypeScript data contracts & schema definitions
│   ├── App.tsx                       # Root application component & layout state
│   └── main.tsx                      # Vite React entry point
├── firestore.rules                   # Strict Firestore document security rules
├── firebase-blueprint.json           # Declarative Firestore schema specification
├── .env.example                      # Sample configuration variables
├── package.json                      # Node dependencies & project metadata
└── tsconfig.json                     # TypeScript strict compiler options
```

---

## 🔒 Security & Privacy

1. **Client-Side & Server-Side Security**:
   - No exchange private API keys or trading secrets are stored on client browsers.
   - Password hashing uses standard PBKDF2 (HMAC-SHA256, 100,000 iterations) with cryptographic 32-byte salts.
2. **Firestore Rules Enforcement**:
   - Validates user identity through Firebase Auth UID verification (`request.auth.uid == userId`).
   - Rejects unauthorized document manipulation or schema tampering.

---

## 📜 License

MIT License. Feel free to use, modify, and distribute for personal or commercial trading research.
