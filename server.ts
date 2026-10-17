import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_API_PORT = 5001;

function startPythonRestApi(): ChildProcess {
  const scriptPath = path.join(__dirname, 'python_backend', 'api_server.py');
  const pyProc = spawn('python3', [scriptPath], {
    env: { ...process.env, PYTHON_API_PORT: String(PYTHON_API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pyProc.stdout?.on('data', (d) => {
    console.log(`[Python REST stdout] ${d.toString().trim()}`);
  });

  pyProc.stderr?.on('data', (d) => {
    console.error(`[Python REST stderr] ${d.toString().trim()}`);
  });

  pyProc.on('exit', (code) => {
    console.warn(`[Python REST process exited with code ${code}]`);
  });

  return pyProc;
}

// Reverse proxy helper function to route HTTP requests to Python API server
function proxyToPython(req: express.Request, res: express.Response) {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: PYTHON_API_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PYTHON_API_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Python REST API service unavailable',
        details: err.message,
      });
    }
  });

  if (req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }

  proxyReq.end();
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Start the Python REST API server in background
  const pyProcess = startPythonRestApi();

  process.on('exit', () => {
    pyProcess.kill();
  });
  process.on('SIGINT', () => {
    pyProcess.kill();
    process.exit();
  });

  app.use(express.json({ limit: '10mb' }));

  // Route Authentication, Market, Portfolio, and Backtest endpoints directly to Python REST API
  app.all('/api/auth/*', (req, res) => proxyToPython(req, res));
  app.all('/api/market/*', (req, res) => proxyToPython(req, res));
  app.all('/api/portfolio/*', (req, res) => proxyToPython(req, res));
  app.all('/api/quant/backtest', (req, res) => proxyToPython(req, res));

  // Python Quant Engine execution endpoint for dynamic scripts
  app.post('/api/python/execute', async (req, res) => {
    const { code, data, params } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Python code is required' });
    }

    const payload = JSON.stringify({
      candles: data || [],
      params: params || {},
    });

    const startTime = Date.now();

    const pythonProcess = spawn('python3', ['-c', code]);

    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      pythonProcess.kill();
    }, 8000);

    pythonProcess.stdin.write(payload);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    pythonProcess.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    pythonProcess.on('close', (exitCode) => {
      clearTimeout(timeout);
      const executionTimeMs = Date.now() - startTime;

      if (timedOut) {
        return res.status(408).json({
          error: 'Execution timed out after 8 seconds',
          executionTimeMs,
          stderr: stderrData,
          stdout: stdoutData,
        });
      }

      if (exitCode !== 0) {
        return res.status(422).json({
          error: `Python process exited with code ${exitCode}`,
          stderr: stderrData,
          stdout: stdoutData,
          executionTimeMs,
        });
      }

      try {
        const trimmed = stdoutData.trim();
        let parsedResult = null;
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0]);
        } else {
          parsedResult = { rawOutput: stdoutData };
        }

        return res.json({
          success: true,
          result: parsedResult,
          stdout: stdoutData,
          stderr: stderrData,
          executionTimeMs,
        });
      } catch {
        return res.json({
          success: true,
          rawOutput: stdoutData,
          stderr: stderrData,
          parseWarning: 'Output was not pure JSON, returned as raw text',
          executionTimeMs,
        });
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timeout);
      return res.status(500).json({
        error: `Failed to spawn Python process: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
      });
    });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      pythonRestPort: PYTHON_API_PORT,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount Vite in development mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuantPulse] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[QuantPulse] Failed to start server:', err);
  process.exit(1);
});
