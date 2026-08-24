/**
 * Test script — runs a single scrape against a DepartureVision page.
 * Usage: node scripts/test-scrape.js [jerseyAve|nyPenn|edison]
 */

require('dotenv').config();
const { scrapeDepartureBoard, initBrowser, closeBrowser } = require('../src/scraper');

const station = process.argv[2] || 'nyPenn';

async function main() {
  console.log(`\nTest scraping station: ${station}\n`);
  
  try {
    const departures = await scrapeDepartureBoard(station);
    
    if (departures.length === 0) {
      console.log('No departures found. The scraper may need adjustment for the current page structure.');
      console.log('Consider running the server and using the dashboard demo mode to test the UI.');
    } else {
      console.log(`\nFound ${departures.length} departures:\n`);
      console.table(departures.map(d => ({
        Train: d.trainNumber,
        Time: d.scheduledTime,
        To: d.destination,
        Line: d.line,
        Track: d.track || '—',
        Status: d.status
      })));
    }
  } catch (error) {
    console.error('Scrape failed:', error.message);
  } finally {
    await closeBrowser();
    process.exit(0);
  }
}

main();
