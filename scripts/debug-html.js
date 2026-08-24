const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function debugHTML() {
  const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(systemChrome) ? systemChrome : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log('Navigating to Penn Station page...');
  await page.goto('https://www.njtransit.com/dv-to/Penn%20Station%20New%20York', { waitUntil: 'networkidle2', timeout: 30000 });

  await new Promise(r => setTimeout(r, 5000));

  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  const text = await page.evaluate(() => document.body.innerText);

  const debugDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });

  fs.writeFileSync(path.join(debugDir, 'debug_page.html'), bodyHTML);
  fs.writeFileSync(path.join(debugDir, 'debug_page.txt'), text);

  console.log('Saved debug_page.html and debug_page.txt');
  console.log('Page text snippet (first 1000 chars):');
  console.log(text.substring(0, 1000));

  await browser.close();
}

debugHTML().catch(console.error);
