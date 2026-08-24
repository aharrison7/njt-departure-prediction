const puppeteer = require('puppeteer');
const fs = require('fs');

async function findStopsDOM() {
  const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(systemChrome) ? systemChrome : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await page.goto('https://www.njtransit.com/dv-to/Penn%20Station%20New%20York', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  // Inspect Vue root component or Vue components on the page
  const vueData = await page.evaluate(() => {
    const el = document.querySelector('#app') || document.querySelector('[data-v-]') || document.body;
    
    // Find any Vue instance
    function getVueData(node) {
      if (node.__vue__) {
        return node.__vue__.$data || node.__vue__._data;
      }
      for (const child of node.children) {
        const res = getVueData(child);
        if (res) return res;
      }
      return null;
    }

    // Check all window variables for schedule / station / stops data
    const globalKeys = Object.keys(window).filter(k => 
      k.toLowerCase().includes('data') || k.toLowerCase().includes('train') || k.toLowerCase().includes('schedule')
    );

    return {
      vueData: getVueData(document.body),
      globalKeys
    };
  });

  console.log('Vue data found:', JSON.stringify(vueData, null, 2).substring(0, 1000));

  // Find all elements containing text "View" or "Stops"
  const elementsWithStops = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(el => el.innerText && el.innerText.includes('Stops'))
      .map(el => ({
        tag: el.tagName,
        className: el.className,
        innerText: el.innerText.substring(0, 100),
        id: el.id
      })).slice(0, 10);
  });

  console.log('Elements containing "Stops":', elementsWithStops);

  await browser.close();
}

findStopsDOM().catch(console.error);
