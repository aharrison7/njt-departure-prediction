const puppeteer = require('puppeteer');
const fs = require('fs');

async function inspectStopsNetwork() {
  const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(systemChrome) ? systemChrome : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Monitor network requests
  page.on('request', req => {
    if (req.url().includes('get') || req.url().includes('stop') || req.url().includes('api') || req.url().includes('json') || req.url().includes('xml')) {
      console.log('REQUEST:', req.method(), req.url());
    }
  });

  page.on('response', async res => {
    if (res.url().includes('get') || res.url().includes('stop') || res.url().includes('api') || res.url().includes('json') || res.url().includes('xml')) {
      console.log('RESPONSE:', res.status(), res.url());
      try {
        const text = await res.text();
        if (text.length < 2000) console.log('  BODY:', text.substring(0, 500));
      } catch (e) {}
    }
  });

  console.log('Navigating to Penn Station page...');
  await page.goto('https://www.njtransit.com/dv-to/Penn%20Station%20New%20York', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Find all elements containing "View Stops" and click the first one
  console.log('Attempting click on View Stops...');
  const clickRes = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const viewStopsEl = all.find(el => el.children.length === 0 && el.textContent.trim() === 'View Stops');
    if (viewStopsEl) {
      viewStopsEl.click();
      if (viewStopsEl.parentElement) viewStopsEl.parentElement.click();
      return 'Found and clicked View Stops element';
    }
    return 'Could not find View Stops element';
  });

  console.log('Click result:', clickRes);
  await new Promise(r => setTimeout(r, 4000));

  await browser.close();
}

inspectStopsNetwork().catch(console.error);
