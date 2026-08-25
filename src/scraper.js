/**
 * NJ Transit DepartureVision Scraper
 * 
 * Scrapes the DepartureVision web pages to extract departure data.
 * Uses Puppeteer to render the JavaScript-heavy Vue.js pages.
 */

const puppeteer = require('puppeteer');
const { getTrainStops } = require('./route-stops');

// Station URLs — ONLY Penn Station NY and Jersey Avenue Station
const STATIONS = {
  nyPenn: {
    name: 'Penn Station New York',
    url: 'https://www.njtransit.com/dv-to/Penn%20Station%20New%20York',
    shortName: 'NY Penn'
  },
  jerseyAve: {
    name: 'Jersey Avenue Station',
    url: 'https://www.njtransit.com/dv-to/Jersey%20Avenue%20Station%20(Northeast%20Corridor)',
    shortName: 'Jersey Ave'
  }
};

let browser = null;

/**
 * Initialize the shared browser instance.
 */
async function initBrowser() {
  if (!browser || !browser.isConnected()) {
    const fs = require('fs');
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };

    // Fallback to system Chrome / Edge if available on Windows
    const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const systemEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    if (fs.existsSync(systemChrome)) {
      launchOptions.executablePath = systemChrome;
    } else if (fs.existsSync(systemEdge)) {
      launchOptions.executablePath = systemEdge;
    }

    browser = await puppeteer.launch(launchOptions);
    console.log('[Scraper] Browser launched using:', launchOptions.executablePath || 'default browser');
  }
  return browser;
}

/**
 * Close the shared browser instance.
 */
async function closeBrowser() {
  if (browser && browser.isConnected()) {
    await browser.close();
    browser = null;
    console.log('[Scraper] Browser closed');
  }
}

/**
 * Scrape a single DepartureVision station page.
 * 
 * @param {string} stationKey - Key from STATIONS object ('nyPenn', 'jerseyAve')
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<Array>} Array of departure objects
 */
async function scrapeDepartureBoard(stationKey, retries = 3) {
  const station = STATIONS[stationKey];
  if (!station) {
    throw new Error(`Unknown station key: ${stationKey}`);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    let page = null;
    try {
      console.log(`[Scraper] Scraping ${station.name} (attempt ${attempt}/${retries})...`);
      
      const b = await initBrowser();
      page = await b.newPage();

      // Set a reasonable viewport and user agent
      await page.setViewport({ width: 1280, height: 900 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navigate to the departure board
      await page.goto(station.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for the departure table to render
      await page.waitForFunction(() => {
        const tables = document.querySelectorAll('table');
        const rows = document.querySelectorAll('tr, .departure-row, [class*="departure"], [class*="dv-"]');
        return tables.length > 0 || rows.length > 3;
      }, { timeout: 20000 }).catch(() => {
        console.log(`[Scraper] Timeout waiting for departure table, trying to extract anyway...`);
      });

      // Give Vue.js a moment to finish rendering
      await new Promise(r => setTimeout(r, 2000));

      // Extract departure data from the page
      const departures = await page.evaluate((stationShortName) => {
        const results = [];

        // Strategy 1: Text-based parsing matching NJT DV pattern
        const fullText = document.body.innerText;
        let boardText = fullText;
        const startIdx = boardText.indexOf('GET REAL-TIME DEPARTURES');
        if (startIdx !== -1) boardText = boardText.substring(startIdx);
        const endIdx = boardText.indexOf('Last updated:');
        if (endIdx !== -1) boardText = boardText.substring(0, endIdx);

        const lines = boardText.split('\n').map(l => l.trim()).filter(Boolean);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trainMatch = line.match(/^([A-Z&]{2,6})\s*Train\s*([A-Z0-9]+)$/i);
          if (trainMatch) {
            const lineAbbrv = trainMatch[1];
            const trainNumber = trainMatch[2];

            let destination = '';
            if (i > 0) {
              let prev = lines[i - 1];
              if (prev !== 'View Stops' && !prev.includes('Filter')) {
                destination = prev.replace(/\s*-\s*SEC/i, '').replace(/[✈]/g, '').trim();
              }
            }

            let scheduledTime = '';
            let status = 'On Time';
            let track = '';

            for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
              const nextLine = lines[j];
              if (nextLine.match(/^([A-Z&]{2,6})\s*Train/i)) break;

              if (!scheduledTime && nextLine.match(/\d{1,2}:\d{2}\s*(AM|PM)/i)) {
                scheduledTime = nextLine;
              } else if (nextLine.match(/^Track\s*(\w+)$/i)) {
                track = nextLine.match(/^Track\s*(\w+)$/i)[1];
              } else if (nextLine.match(/(delayed|all aboard|boarding|cancelled|canceled|standby|on time)/i)) {
                status = nextLine;
              }
            }

            results.push({
              trainNumber,
              scheduledTime,
              destination,
              line: lineAbbrv,
              track,
              status,
              station: stationShortName
            });
          }
        }

        if (results.length > 0) {
          return results;
        }

        // Strategy 2: Look for table rows if text parsing yielded nothing
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr, tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
              const cellTexts = Array.from(cells).map(c => c.textContent.trim());
              const departure = parseDepartureRow(cellTexts, stationShortName);
              if (departure) results.push(departure);
            }
          }
        }

        return results;

        function parseDepartureRow(cells, station) {
          if (cells.length < 3) return null;
          let trainNumber = '', scheduledTime = '', destination = '', line = '', track = '', status = '';
          for (const cell of cells) {
            if (!trainNumber && /^\d{3,4}$/.test(cell)) trainNumber = cell;
            else if (!scheduledTime && /\d{1,2}:\d{2}\s*(AM|PM)?/i.test(cell)) scheduledTime = cell;
            else if (!track && /^(\d{1,2}[A-Z]?|[A-Z])$/i.test(cell) && cell.length <= 3) track = cell;
            else if (!status && /(on time|delayed|cancelled|canceled|in delay|all aboard|boarding|hold|departed|standby)/i.test(cell)) status = cell;
            else if (!line && /^[A-Z]{2,6}$/.test(cell)) line = cell;
            else if (!destination && cell.length > 3 && !/^\d+$/.test(cell)) destination = cell;
          }
          if (trainNumber || scheduledTime) {
            return { trainNumber, scheduledTime, destination, line, track, status, station };
          }
          return null;
        }
      }, station.shortName);

      console.log(`[Scraper] Found ${departures.length} departures at ${station.name}`);
      
      // Attach calculated intermediate stops to each departure
      for (const dep of departures) {
        dep.stops = getTrainStops(dep.line, dep.destination, station.shortName);
      }

      if (page) await page.close();
      return departures;

    } catch (error) {
      console.error(`[Scraper] Attempt ${attempt} failed for ${station.name}:`, error.message);
      if (page) {
        try { await page.close(); } catch (e) { /* ignore */ }
      }
      
      if (attempt === retries) {
        console.error(`[Scraper] All ${retries} attempts failed for ${station.name}`);
        return [];
      }
      
      // Wait before retrying
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return [];
}

/**
 * Scrape NY Penn & Jersey Ave stations ONLY.
 */
async function scrapeActiveStations() {
  console.log(`[Scraper] === Scrape NY Penn & Jersey Ave at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ===`);
  const [nyPenn, jerseyAve] = await Promise.all([
    scrapeDepartureBoard('nyPenn'),
    scrapeDepartureBoard('jerseyAve')
  ]);
  return {
    timestamp: new Date().toISOString(),
    stations: {
      nyPenn,
      jerseyAve
    }
  };
}

// Backward compatibility aliases
async function scrapeMorning() { return scrapeActiveStations(); }
async function scrapeAfternoon() { return scrapeActiveStations(); }

module.exports = {
  STATIONS,
  initBrowser,
  closeBrowser,
  scrapeDepartureBoard,
  scrapeActiveStations,
  scrapeMorning,
  scrapeAfternoon
};
