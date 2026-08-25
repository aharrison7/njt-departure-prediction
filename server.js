/**
 * NJ Transit Departure Prediction Server
 * 
 * Main entry point. Orchestrates scraping, data processing, prediction,
 * and Google Drive sync on a weekday schedule.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const { initBrowser, closeBrowser, scrapeActiveStations } = require('./src/scraper');
const DataStore = require('./src/data-store');
const DepartedTracker = require('./src/departed-tracker');
const Scheduler = require('./src/scheduler');
const { generatePredictions, getRecentCancellations } = require('./src/predictor');
const { getAllStationStops } = require('./src/route-stops');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize components
const dataStore = new DataStore();
const departedTracker = new DepartedTracker();

app.use(express.json());

// Serve dashboard static files
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Root redirect to dashboard
app.get('/', (req, res) => res.redirect('/dashboard/'));

// Health check endpoint for Render / cloud hosts
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// Also serve local data files for dev/testing
app.use('/data', express.static(path.join(__dirname, 'data')));

// ─── Scrape Handler ──────────────────────────────────────────────────

/**
 * Process a scrape: Penn Station New York + Jersey Avenue Station ONLY.
 */
async function handleScrape() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[Server] LIVE SCRAPE (Penn Station + Jersey Ave) — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

  try {
    const result = await scrapeActiveStations();
    const pennDepartures = result.stations.nyPenn || [];
    const jerseyAveDepartures = result.stations.jerseyAve || [];

    // Combine departures from Penn Station NY & Jersey Avenue
    const currentBoard = [...pennDepartures, ...jerseyAveDepartures];

    console.log(`[Server] Scraped ${pennDepartures.length} departures from NY Penn, ${jerseyAveDepartures.length} from Jersey Ave`);

    // Update recently departed tracker
    const recentlyDeparted = departedTracker.update(currentBoard, 'NJ Transit');

    // Update history for Penn & Jersey Ave trains
    const history = await dataStore.updateHistory(currentBoard);

    // Record cancellations
    const cancellations = await dataStore.recordCancellations(currentBoard);

    // Update track registry with valid tracks used at Penn & Jersey Ave
    const trackRegistry = await dataStore.updateTrackRegistry(currentBoard);

    // Generate predictions for current active trains
    const predictions = generatePredictions(currentBoard, history, trackRegistry);

    // Get recent cancellations (last 7 days)
    const recentCancellations = getRecentCancellations(cancellations);

    // Build and write api_data.json
    const apiData = {
      lastUpdated: new Date().toISOString(),
      activeStation: 'Penn Station NY & Jersey Ave',
      activeWindow: 'live',
      scrapeTime: `${Date.now() - startTime}ms`,
      currentBoard,
      recentlyDeparted,
      predictions,
      cancellations: {
        recentByTrain: recentCancellations
      },
      enRouteCancellations: [],
      trackRegistry: trackRegistry.tracks || [],
      allStops: getAllStationStops()
    };

    await dataStore.writeApiData(apiData);
    console.log(`[Server] Live scrape complete in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[Server] Live scrape failed:', error);
  }
}

// ─── HTTP Routes ─────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.redirect('/dashboard/');
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    scheduler: scheduler.getStatus(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    publicDataUrl: dataStore.getPublicUrl('api_data.json')
  });
});

app.get('/api/data', async (req, res) => {
  try {
    const data = await dataStore.readJSON('api_data.json');
    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'No data available yet' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger endpoints
app.post('/api/scrape', async (req, res) => {
  res.json({ message: 'Live scrape started' });
  await handleScrape();
});
app.post('/api/scrape/morning', async (req, res) => {
  res.json({ message: 'Live scrape started' });
  await handleScrape();
});
app.post('/api/scrape/afternoon', async (req, res) => {
  res.json({ message: 'Live scrape started' });
  await handleScrape();
});

// ─── Startup ─────────────────────────────────────────────────────────

const scheduler = new Scheduler(handleScrape);

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║    NJ Transit Departure Prediction Server               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Initialize data store
  await dataStore.init();

  // Initialize browser
  try {
    await initBrowser();
  } catch (err) {
    console.warn('[Server] Could not pre-launch browser on startup:', err.message);
  }

  // Start scheduler
  scheduler.start();

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`\n[Server] HTTP server listening on http://localhost:${PORT}`);
    console.log(`[Server] Dashboard: http://localhost:${PORT}/dashboard/`);
    console.log(`[Server] API data:  http://localhost:${PORT}/api/data`);
    console.log(`[Server] Status:    http://localhost:${PORT}/api/status`);
    console.log(`[Server] Manual scrape: POST /api/scrape`);
  });

  // Run initial scrape on startup so board is populated immediately
  if (process.env.SCRAPE_ON_STARTUP !== 'false') {
    handleScrape().catch(e => console.error('[Server] Initial startup scrape error:', e.message));
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  scheduler.stop();
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] Shutting down...');
  scheduler.stop();
  await closeBrowser();
  process.exit(0);
});

main().catch(error => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});
