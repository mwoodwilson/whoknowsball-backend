import { Router, Request, Response } from 'express';
import { closingOddsJob } from '../../services/jobs/ClosingOddsJob';
import { staleGameDetectionJob } from '../../services/jobs/StaleGameDetectionJob';

const router = Router();

/**
 * GET /api/v1/jobs/closing-odds/status
 * Get the status of the closing odds capture job
 */
router.get('/closing-odds/status', async (req: Request, res: Response) => {
  try {
    const status = closingOddsJob.getStatus();
    const stats = await closingOddsJob.getStats();

    res.json({
      success: true,
      job: status,
      stats
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/jobs/closing-odds/start
 * Start the closing odds capture job
 */
router.post('/closing-odds/start', (req: Request, res: Response) => {
  try {
    closingOddsJob.start();

    res.json({
      success: true,
      message: 'Closing odds job started',
      status: closingOddsJob.getStatus()
    });
  } catch (error) {
    console.error('Error starting job:', error);
    res.status(500).json({
      error: 'Failed to start job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/jobs/closing-odds/stop
 * Stop the closing odds capture job
 */
router.post('/closing-odds/stop', (req: Request, res: Response) => {
  try {
    closingOddsJob.stop();

    res.json({
      success: true,
      message: 'Closing odds job stopped',
      status: closingOddsJob.getStatus()
    });
  } catch (error) {
    console.error('Error stopping job:', error);
    res.status(500).json({
      error: 'Failed to stop job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/jobs/closing-odds/run-now
 * Manually trigger a closing odds capture run
 */
router.post('/closing-odds/run-now', async (req: Request, res: Response) => {
  try {
    await closingOddsJob.runNow();

    res.json({
      success: true,
      message: 'Manual capture run completed'
    });
  } catch (error) {
    console.error('Error running manual capture:', error);
    res.status(500).json({
      error: 'Failed to run manual capture',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// =============================================================================
// STALE GAME DETECTION JOB ROUTES
// =============================================================================

/**
 * GET /api/v1/jobs/stale-games/status
 * Get the status of the stale game detection job
 */
router.get('/stale-games/status', (req: Request, res: Response) => {
  try {
    const status = staleGameDetectionJob.getStatus();

    res.json({
      success: true,
      job: status
    });
  } catch (error) {
    console.error('Error getting stale game job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/jobs/stale-games/start
 * Start the stale game detection job
 */
router.post('/stale-games/start', (req: Request, res: Response) => {
  try {
    staleGameDetectionJob.start();

    res.json({
      success: true,
      message: 'Stale game detection job started',
      status: staleGameDetectionJob.getStatus()
    });
  } catch (error) {
    console.error('Error starting stale game job:', error);
    res.status(500).json({
      error: 'Failed to start job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/jobs/stale-games/stop
 * Stop the stale game detection job
 */
router.post('/stale-games/stop', (req: Request, res: Response) => {
  try {
    staleGameDetectionJob.stop();

    res.json({
      success: true,
      message: 'Stale game detection job stopped',
      status: staleGameDetectionJob.getStatus()
    });
  } catch (error) {
    console.error('Error stopping stale game job:', error);
    res.status(500).json({
      error: 'Failed to stop job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/jobs/stale-games/run-now
 * Manually trigger a stale game detection run
 */
router.post('/stale-games/run-now', async (req: Request, res: Response) => {
  try {
    await staleGameDetectionJob.run();

    res.json({
      success: true,
      message: 'Stale game detection run completed - check server logs for results'
    });
  } catch (error) {
    console.error('Error running stale game detection:', error);
    res.status(500).json({
      error: 'Failed to run stale game detection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
