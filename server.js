/**
 * NJ Transit Departure Prediction Server
 * 
 * Main entry point. Orchestrates scraping, data processing, prediction,
 * and Google Drive sync on a weekday schedule.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const { scrapeMorning, scrapeAfternoon, initBrowser, closeBrowser } = require('./src/scraper');
const DataStore = require('./src/data-store');
const DepartedTracker = require('./src/departed-tracker');
const { generatePredictions, detectEnRouteCancellations, getRecentCancellations } = require('./src/predictor');
const { getAllStationStops } = require('./src/route-stops');
const Scheduler = require('./src/scheduler');

// ─── Configuration ───────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';

// ─── Initialize Services ────────────────────────────────────────────

const dataStore = new DataStore(CREDENTIALS_PATH, FOLDER_ID);
const departedTracker = new DepartedTracker();
const app = express();

// Serve dashboard static files
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Also serve local data files for dev/testing
app.use('/data', express.static(path.join(__dirname, 'data')));

// ─── Scrape Handlers ────────────────────────────────────────────────

/**
 * Process a morning scrape: Jersey Ave Station.
 */
async function handleMorningScrape() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[Server] MORNING SCRAPE — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

  try {
    const result = await scrapeMorning();
    const departures = result.stations.jerseyAve || [];
    
    console.log(`[Server] Scraped ${departures.length} departures from Jersey Ave`);

    // Update recently departed tracker
    const recentlyDeparted = departedTracker.update(departures, 'Jersey Ave');
    console.log(`[Server] ${recentlyDeparted.length} recently departed trains`);

    // Update history
    const history = await dataStore.updateHistory(departures);

    // Record cancellations
    const cancellations = await dataStore.recordCancellations(departures);

    // Update track registry
    const trackRegistry = await dataStore.updateTrackRegistry(departures);

    // Generate predictions
    const predictions = generatePredictions(departures, history, trackRegistry);

    // Get recent cancellations (last 7 days)
    const recentCancellations = getRecentCancellations(cancellations);

    // Build and write api_data.json
    const apiData = {
      lastUpdated: new Date().toISOString(),
      activeStation: 'Jersey Avenue Station',
      activeWindow: 'morning',
      scrapeTime: `${Date.now() - startTime}ms`,
      currentBoard: departures,
      recentlyDeparted: recentlyDeparted,
      predictions,
      cancellations: {
        recentByTrain: recentCancellations
      },
      enRouteCancellations: [],
      trackRegistry: trackRegistry.tracks || [],
      allStops: getAllStationStops()
    };

    await dataStore.writeApiData(apiData);
    console.log(`[Server] Morning scrape complete in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[Server] Morning scrape failed:', error);
  }
}

/**
 * Process an afternoon scrape: Penn Station + Edison Station.
 */
async function handleAfternoonScrape() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[Server] AFTERNOON SCRAPE — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

  try {
    const result = await scrapeAfternoon();
    const pennDepartures = result.stations.nyPenn || [];
    const edisonDepartures = result.stations.edison || [];

    console.log(`[Server] Scraped ${pennDepartures.length} departures from Penn, ${edisonDepartures.length} from Edison`);

    // Update recently departed tracker (Penn Station)
    const recentlyDeparted = departedTracker.update(pennDepartures, 'NY Penn');
    console.log(`[Server] ${recentlyDeparted.length} recently departed trains`);

    // Update history (Penn departures are the primary tracking)
    const history = await dataStore.updateHistory(pennDepartures);

    // Record cancellations from both stations
    const allDepartures = [...pennDepartures, ...edisonDepartures];
    const cancellations = await dataStore.recordCancellations(allDepartures);

    // Update track registry
    const trackRegistry = await dataStore.updateTrackRegistry(pennDepartures);

    // Generate predictions for Penn Station board
    const predictions = generatePredictions(pennDepartures, history, trackRegistry);

    // Detect en-route cancellations (departed Penn but cancelled at Edison)
    const enRouteCancellations = detectEnRouteCancellations(pennDepartures, edisonDepartures);
    if (enRouteCancellations.length > 0) {
      console.log(`[Server] ⚠ ${enRouteCancellations.length} en-route cancellations detected!`);
    }

    // Get recent cancellations (last 7 days)
    const recentCancellations = getRecentCancellations(cancellations);

    // Build and write api_data.json
    const apiData = {
      lastUpdated: new Date().toISOString(),
      activeStation: 'Penn Station New York',
      activeWindow: 'afternoon',
      scrapeTime: `${Date.now() - startTime}ms`,
      currentBoard: pennDepartures,
      recentlyDeparted: recentlyDeparted,
      edisonBoard: edisonDepartures,
      predictions,
      cancellations: {
        recentByTrain: recentCancellations
      },
      enRouteCancellations,
      trackRegistry: trackRegistry.tracks || [],
      allStops: getAllStationStops()
    };

    await dataStore.writeApiData(apiData);
    console.log(`[Server] Afternoon scrape complete in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[Server] Afternoon scrape failed:', error);
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

// Manual trigger endpoints (useful for testing)
app.post('/api/scrape/morning', async (req, res) => {
  res.json({ message: 'Morning scrape started' });
  await handleMorningScrape();
});

app.post('/api/scrape/afternoon', async (req, res) => {
  res.json({ message: 'Afternoon scrape started' });
  await handleAfternoonScrape();
});

// ─── Startup ─────────────────────────────────────────────────────────

const scheduler = new Scheduler(handleMorningScrape, handleAfternoonScrape);

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
    console.log(`[Server] Manual scrape: POST /api/scrape/morning or /api/scrape/afternoon`);
  });

  // Run immediate scrape if configured
  if (process.env.SCRAPE_ON_STARTUP === 'true') {
    const window = Scheduler.getCurrentWindow();
    console.log(`\n[Server] Startup scrape requested (current window: ${window})`);
    if (window === 'morning') {
      await handleMorningScrape();
    } else if (window === 'afternoon') {
      await handleAfternoonScrape();
    } else {
      console.log('[Server] Outside active hours — running afternoon scrape for testing');
      await handleAfternoonScrape();
    }
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
