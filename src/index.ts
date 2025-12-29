//
//  index.ts
//  bks-backend
//
//  Created by Matthew Wilson on 10/4/25.
//
import dotenv from 'dotenv';
dotenv.config();

// ALL OTHER IMPORTS MUST COME AFTER DOTENV
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { BKSCalculator } from './services/bks/BKSCalculator';
import { BetInput } from './services/bks/types';
import authRoutes from './routes/auth.routes';
import authRoutesV1 from './api/routes/v1/auth.routes';
import testRoutes from './api/routes/test.routes';
import betsRoutes from './api/routes/bets.routes';
import bksRoutes from './api/routes/bks.routes';
import oddsRoutes from './api/routes/odds.routes';
import jobsRoutes from './api/routes/jobs.routes';
import metricsRoutes from './api/routes/metrics.routes';
import searchRoutes from './api/routes/search.routes';
import teamsRoutes from './api/routes/teams.routes';
import leaderboardRoutes from './api/routes/leaderboard.routes';
import healthRoutes from './api/routes/health.routes';
import usersRoutes from './api/routes/users.routes';
import supportRoutes from './api/routes/support.routes';
import { initRedis } from './config/redis';
import { globalRateLimiter, sanitizeBKSResponse, apiKeyAuth } from './middleware/security.middleware';
import './services/jobs/ClosingOddsJob';
import './services/jobs/SettlementJob';
// GameCreationJob, OddsMatchingJob, and ScoresJob are initialized asynchronously below
// Note: GameSyncJob deprecated in favor of dual-source architecture (API-Sports primary + Odds API secondary)

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize BKS Calculator
const bksCalculator = new BKSCalculator();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"], // Allow inline scripts for email verification page
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://your-frontend.com']
    : true, // Allow all in development
  credentials: true,
};
app.use(cors(corsOptions));

// API Key authentication (for ngrok security)
// Enable by setting API_KEY_ENABLED=true in .env
app.use(apiKeyAuth);

// Rate limiting
app.use(globalRateLimiter);

// BKS response sanitization
app.use(sanitizeBKSResponse);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/v1/auth', authRoutesV1);
app.use('/api/test', testRoutes);
app.use('/api/bets', betsRoutes);
app.use('/api/v1/bets', bksRoutes);
app.use('/api/v1/odds', oddsRoutes);
app.use('/api/v1/jobs', jobsRoutes);
app.use('/api/v1/metrics', metricsRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/teams', teamsRoutes);
app.use('/api/v1/leaderboard', leaderboardRoutes);
app.use('/api/v1', leaderboardRoutes); // For stats endpoint
app.use('/api/v1/health', healthRoutes); // API-Sports quota monitoring
app.use('/api/v1/users', usersRoutes); // User management endpoints
app.use('/api/v1/support', supportRoutes); // Support & help endpoints

// Root route - also handles Supabase auth callbacks
app.get('/', (req: Request, res: Response) => {
  // Check if this is a browser request (not an API call)
  const userAgent = req.headers['user-agent'] || '';
  const acceptHeader = req.headers['accept'] || '';
  const isBrowser = userAgent.includes('Mozilla') || acceptHeader.includes('text/html');

  // Serve HTML page for browser requests (handles hash parameters client-side)
  if (isBrowser) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verification - WhoKnowsBall</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
          }
          .icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          .success { color: #10b981; }
          .error { color: #ef4444; }
          .loading { color: #3b82f6; }
          h1 {
            color: #1f2937;
            margin-bottom: 16px;
          }
          p {
            color: #6b7280;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .button {
            background: #667eea;
            color: white;
            padding: 12px 32px;
            border-radius: 8px;
            text-decoration: none;
            display: inline-block;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon loading" id="icon">⏳</div>
          <h1 id="title">Verifying your email...</h1>
          <p id="message">Please wait while we verify your email address.</p>
          <a href="#" id="action" class="button" style="display: none;">Return to App</a>
        </div>
        <script>
          async function handleAuth() {
            try {
              console.log('Starting email verification...');
              console.log('Current URL:', window.location.href);

              const params = new URLSearchParams(window.location.hash.substring(1));
              const queryParams = new URLSearchParams(window.location.search);

              console.log('Hash params:', Object.fromEntries(params));
              console.log('Query params:', Object.fromEntries(queryParams));

              const error = params.get('error') || queryParams.get('error');
              const errorDescription = params.get('error_description') || queryParams.get('error_description');
              const accessToken = params.get('access_token');
              const tokenHash = queryParams.get('token_hash');
              const type = queryParams.get('type') || params.get('type');

              console.log('Extracted values:', { error, errorDescription, accessToken, tokenHash, type });

              const icon = document.getElementById('icon');
              const title = document.getElementById('title');
              const message = document.getElementById('message');
              const action = document.getElementById('action');

              if (error) {
                console.log('Error in URL params:', error, errorDescription);
                icon.className = 'icon error';
                icon.textContent = '❌';
                title.textContent = 'Verification Failed';
                message.textContent = errorDescription || 'This verification link is invalid or has expired. Please request a new verification email.';
                action.style.display = 'inline-block';
                action.textContent = 'Request New Link';
                action.href = 'whoknowsball://auth/resend';
              } else if (accessToken) {
                console.log('Access token found, verification successful');
                icon.className = 'icon success';
                icon.textContent = '✅';
                title.textContent = 'Email Verified!';
                message.textContent = 'Your email has been successfully verified. You can now close this window and return to the app.';
                action.style.display = 'inline-block';
                action.textContent = 'Open App';
                action.href = 'whoknowsball://auth/verified';
              } else if (tokenHash && type === 'email') {
                console.log('Token hash found, calling verification API...');
                // This is a verification link, verify it with the backend
                try {
                  const url = '/api/v1/auth/verify?token=' + encodeURIComponent(tokenHash) + '&type=email';
                  console.log('Calling API:', url);
                  const response = await fetch(url);
                  console.log('API response status:', response.status);
                  const data = await response.json();
                  console.log('API response data:', data);

                  if (data.success) {
                    console.log('Verification successful');
                    icon.className = 'icon success';
                    icon.textContent = '✅';
                    title.textContent = 'Email Verified!';
                    message.textContent = 'Your email has been successfully verified. You can now close this window and return to the app to log in.';
                  } else {
                    console.log('Verification failed:', data.message);
                    icon.className = 'icon error';
                    icon.textContent = '❌';
                    title.textContent = 'Verification Failed';
                    message.textContent = data.message || 'This verification link is invalid or has expired.';
                  }
                } catch (err) {
                  console.error('API call error:', err);
                  icon.className = 'icon error';
                  icon.textContent = '❌';
                  title.textContent = 'Verification Failed';
                  message.textContent = 'An error occurred while verifying your email. Please try again. Error: ' + err.message;
                }
                action.style.display = 'inline-block';
                action.textContent = 'Return to App';
                action.href = 'whoknowsball://';
              } else {
                console.log('No valid auth params found');
                // No auth params found
                icon.className = 'icon error';
                icon.textContent = '⚠️';
                title.textContent = 'Invalid Link';
                message.textContent = 'This link appears to be invalid. Please use the verification link sent to your email.';
                action.style.display = 'inline-block';
                action.textContent = 'Return to App';
                action.href = 'whoknowsball://';
              }
            } catch (err) {
              console.error('handleAuth error:', err);
              const icon = document.getElementById('icon');
              const title = document.getElementById('title');
              const message = document.getElementById('message');
              const action = document.getElementById('action');

              icon.className = 'icon error';
              icon.textContent = '❌';
              title.textContent = 'Error';
              message.textContent = 'An unexpected error occurred: ' + err.message;
              action.style.display = 'inline-block';
              action.textContent = 'Return to App';
              action.href = 'whoknowsball://';
            }
          }

          handleAuth().catch(err => console.error('Unhandled error in handleAuth:', err));
        </script>
      </body>
      </html>
    `);
  }

  // Default API response
  res.json({ message: 'BKS Backend API v3.1.5' });
});

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    message: 'BKS Backend is running!',
    timestamp: new Date().toISOString(),
    version: '3.1.5'
  });
});

// BKS calculation endpoint using the real calculator
app.post('/api/calculate-bks', (req: Request, res: Response) => {
  try {
    const { user_id, game_id, sport_key, bet_type, odds, stake, selection, team, line } = req.body;

    // Validate required fields
    if (!user_id || !game_id || !sport_key || !bet_type || !odds || !stake) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['user_id', 'game_id', 'sport_key', 'bet_type', 'odds', 'stake']
      });
    }

    // Create bet input
    const betData: BetInput = {
      user_id,
      game_id,
      sport_key,
      bet_type,
      odds,
      stake,
      selection,
      team,
      line
    };

    // Calculate BKS
    const result = bksCalculator.calculate(betData);

    res.json({
      success: true,
      bks_score: result.bks_provisional,
      base_score: result.base_score,
      components: result.components,
      multiplier: result.m_provisional,
      signature: result.signature,
      version: '3.1.5'
    });
  } catch (error) {
    console.error('BKS calculation error:', error);
    res.status(500).json({
      error: 'BKS calculation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Initialize Redis connection
  try {
    await initRedis();
    console.log('✅ Redis connected successfully');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    console.log('⚠️  Server will continue without Redis (caching disabled)');
  }

  // Sequential job initialization with new dual-source architecture
  // API-Sports (primary): GameCreationJob creates games with API-Sports IDs
  // Odds API (secondary): OddsMatchingJob adds odds data to existing games
  // ScoresJob: Uses direct ID matching with API-Sports (no more team name matching!)
  (async () => {
    try {
      console.log('\n🔄 Initializing background jobs with dual-source architecture...');
      console.log('[Architecture] API-Sports = PRIMARY (game creation), Odds API = SECONDARY (odds data only)');

      // Step 1: Initialize and run GameCreationJob first (API-Sports primary source)
      console.log('[Jobs] Starting GameCreationJob (creates games from API-Sports)...');
      const { default: GameCreationJobClass } = await import('./services/jobs/GameCreationJob');
      const gameCreationJob = new GameCreationJobClass();
      await gameCreationJob.run(); // Run once immediately on startup
      console.log('✅ [Jobs] GameCreationJob initial run completed');

      // Schedule GameCreationJob to run daily at 2 AM
      // (Full sync once per day is sufficient - games don't change frequently)
      const scheduleGameCreation = () => {
        const now = new Date();
        const next2AM = new Date(now);
        next2AM.setHours(2, 0, 0, 0);
        if (next2AM <= now) {
          next2AM.setDate(next2AM.getDate() + 1);
        }
        const msUntil2AM = next2AM.getTime() - now.getTime();

        setTimeout(() => {
          const job = new GameCreationJobClass();
          job.run();
          // Re-schedule for next day
          scheduleGameCreation();
        }, msUntil2AM);

        console.log(`✅ [Jobs] GameCreationJob scheduled for next run at ${next2AM.toLocaleString()}`);
      };
      scheduleGameCreation();

      // Step 2: Initialize and run OddsMatchingJob (matches Odds API odds to API-Sports games)
      console.log('[Jobs] Starting OddsMatchingJob (matches odds to games)...');
      const { default: OddsMatchingJobClass } = await import('./services/jobs/OddsMatchingJob');
      const oddsMatchingJob = new OddsMatchingJobClass();
      await oddsMatchingJob.run(); // Run once immediately
      console.log('✅ [Jobs] OddsMatchingJob initial run completed');

      // Schedule OddsMatchingJob every 40 seconds (matches live odds frequency)
      setInterval(() => {
        const job = new OddsMatchingJobClass();
        job.run();
      }, 40 * 1000);
      console.log('✅ [Jobs] OddsMatchingJob scheduled (every 40s for live odds)');

      // Step 3: Wait 5 seconds before starting ScoresJob
      console.log('[Jobs] Waiting 5 seconds before starting ScoresJob...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Step 4: Initialize and run ScoresJob with dynamic polling
      console.log('[Jobs] Starting ScoresJob (updates scores with dynamic polling)...');
      const { default: ScoresJobClass } = await import('./services/jobs/ScoresJob');
      const scoresJob = new ScoresJobClass();

      // DYNAMIC POLLING: Run every 30 seconds
      // - LIVE + IMMINENT games (<15 min): Updated every cycle (30s)
      // - FUTURE games (>15 min): Updated every 10 cycles (5 min)
      // - Reduces quota usage by ~80% while maintaining real-time UX for active games
      scoresJob.run(); // Initial run

      setInterval(() => {
        scoresJob.run();
      }, 30000); // 30 seconds

      console.log('✅ [Jobs] ScoresJob scheduled (every 30s with dynamic polling)');

      console.log('✅ All background jobs initialized with dual-source architecture\n');

    } catch (error) {
      console.error('❌ Error initializing background jobs:', error);
      console.log('⚠️  Server will continue without some background jobs');
    }
  })();

  console.log(`📍 Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   POST http://localhost:${PORT}/api/calculate-bks`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`   GET  http://localhost:${PORT}/api/auth/me`);
  console.log(`   POST http://localhost:${PORT}/api/v1/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/v1/auth/login`);
  console.log(`   POST http://localhost:${PORT}/api/v1/auth/oauth`);
  console.log(`   POST http://localhost:${PORT}/api/v1/auth/refresh`);
  console.log(`   POST http://localhost:${PORT}/api/v1/auth/logout`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/auth/verify`);
  console.log(`   GET  http://localhost:${PORT}/api/test/current-games`);
  console.log(`   POST http://localhost:${PORT}/api/bets`);
  console.log(`   GET  http://localhost:${PORT}/api/bets/validate-game/:game_id`);
  console.log(`   POST http://localhost:${PORT}/api/v1/bets/calculate`);
  console.log(`   POST http://localhost:${PORT}/api/v1/bets/validate`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/bets/version`);
  console.log(`   POST http://localhost:${PORT}/api/v1/bets (place bet - requires auth)`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/bets (list bets - requires auth)`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/bets/:betId (requires auth)`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/odds/:sport`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/odds/upcoming/all`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/jobs/closing-odds/status`);
  console.log(`   POST http://localhost:${PORT}/api/v1/jobs/closing-odds/start`);
  console.log(`   POST http://localhost:${PORT}/api/v1/jobs/closing-odds/stop`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/metrics/activity`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/metrics/leaderboard`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/search?q=<query>`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/teams/:teamName/logo`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/leaderboard/global`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/leaderboard/sport/:sportKey`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/leaderboard/friends`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/stats/user/:username`);
});
