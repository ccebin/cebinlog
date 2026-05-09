const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', error => {
    console.log('BROWSER PAGE ERROR:', error.message);
  });
  
  await page.goto('http://localhost:5173/dashboard');
  
  // Try clicking a target pill
  try {
    await page.waitForSelector('button.group\\/target', { timeout: 3000 });
    await page.click('button.group\\/target');
    // wait a bit to see if it crashes
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.log("Could not click button:", e.message);
  }
  
  await browser.close();
})();
