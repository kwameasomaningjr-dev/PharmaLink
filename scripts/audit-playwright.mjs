import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createApp } from '../dist/app.js';

const ARTIFACT_DIR = 'C:/Users/kwame/.gemini/antigravity/brain/2e1c2016-311e-49ab-847b-29ce0b38c3d0';
const PORT = 4005;

async function runAudit() {
  console.log('[Playwright Audit] Starting local Express app on port ' + PORT + '...');
  const app = createApp(() => true);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log('[Playwright Audit] Server listening at http://127.0.0.1:' + PORT);

  console.log('[Playwright Audit] Launching Chromium browser (channel: chrome)...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-sandbox'] });
  } catch (err) {
    console.log('[Playwright Audit] Chrome channel failed, falling back to default chromium...', err.message);
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox'] });
  }

  // Mobile viewport: iPhone 14 (390 x 844, 2x DPR)
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();

  // Block heavy external assets to prevent network stalls
  await page.route('**/{fonts.googleapis.com,fonts.gstatic.com,js.paystack.co}/**', (route) => route.abort());

  console.log('\n--- AUDIT 1: Mobile Customer Discovery View ---');
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Skip splash if visible so we inspect the actual app interface
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video) video.pause();
    const skipBtn = document.querySelector('.splash-skip-btn');
    if (skipBtn) skipBtn.click();
  });
  await page.waitForTimeout(500);

  const customerOverflow = await page.evaluate(() => {
    return {
      windowWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  console.log('[Audit 1] Customer Viewport geometry:', JSON.stringify(customerOverflow));

  const homeScreenshot = path.join(ARTIFACT_DIR, 'audit-mobile-customer.png');
  await page.screenshot({ path: homeScreenshot });
  console.log('[Audit 1] Captured customer view screenshot:', homeScreenshot);

  console.log('\n--- AUDIT 2: Mobile Platform Operations Admin ---');
  // Inject demo Platform Ops admin credentials
  await page.evaluate(() => {
    window.localStorage.setItem(
      'pharmalink-user',
      JSON.stringify({
        id: 'usr_ops_audit',
        full_name: 'Richard Asomaning',
        email: 'ops@pharmalink.com',
        role: 'PLATFORM_OPS',
      })
    );
    window.localStorage.setItem('pharmalink-auth-token', 'mock_jwt_audit');
  });

  await page.goto(`http://127.0.0.1:${PORT}/admin/platform/network`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const adminMetrics = await page.evaluate(() => {
    const topbar = document.querySelector('.admin-topbar');
    const sidebar = document.querySelector('.admin-sidebar');
    const statGrid = document.querySelector('.admin-stat-grid');
    const tableWrap = document.querySelector('.admin-table-wrap');
    const touchCards = document.querySelector('.admin-touch-cards');

    const topbarHeight = topbar ? Math.round(topbar.getBoundingClientRect().height) : 0;
    const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
    const statGridCols = statGrid ? window.getComputedStyle(statGrid).gridTemplateColumns : null;
    const tableDisplay = tableWrap ? window.getComputedStyle(tableWrap).display : null;
    const touchCardsDisplay = touchCards ? window.getComputedStyle(touchCards).display : null;

    return {
      topbarHeight: topbarHeight + 'px',
      sidebarOverflowX: sidebarStyle ? sidebarStyle.overflowX : null,
      sidebarFlexDirection: sidebarStyle ? sidebarStyle.flexDirection : null,
      statGridCols,
      tableDisplay,
      touchCardsDisplay,
    };
  });

  console.log('[Audit 2] Mobile Admin Metrics:', JSON.stringify(adminMetrics, null, 2));

  const adminScreenshot = path.join(ARTIFACT_DIR, 'audit-mobile-platform-ops.png');
  await page.screenshot({ path: adminScreenshot });
  console.log('[Audit 2] Captured mobile Platform Ops screenshot:', adminScreenshot);

  console.log('\n--- AUDIT 3: Dispensary Operations (Touch Cards & Shelf) ---');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'pharmalink-user',
      JSON.stringify({
        id: 'usr_pharm_audit',
        full_name: 'Akosua Mensah, BPharm',
        email: 'dispensary@pharmalink.com',
        role: 'PHARMACY_ADMIN',
      })
    );
    window.localStorage.setItem(
      'pharmalink-pharmacy',
      JSON.stringify({
        id: 'pharm_ridge_01',
        display_name: 'Ridge Hospital Dispensary',
        city: 'Accra',
      })
    );
  });

  await page.goto(`http://127.0.0.1:${PORT}/admin/pharmacy/overview`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const dispensaryMetrics = await page.evaluate(() => {
    const orderCards = document.querySelector('.dispensary-order-cards');
    const tableWrap = document.querySelector('.table-responsive-wrapper');
    return {
      orderCardsDisplay: orderCards ? window.getComputedStyle(orderCards).display : 'not_rendered',
      tableDisplay: tableWrap ? window.getComputedStyle(tableWrap).display : 'not_rendered',
    };
  });
  console.log('[Audit 3] Mobile Dispensary Metrics:', JSON.stringify(dispensaryMetrics, null, 2));

  const dispensaryScreenshot = path.join(ARTIFACT_DIR, 'audit-mobile-dispensary.png');
  await page.screenshot({ path: dispensaryScreenshot });
  console.log('[Audit 3] Captured mobile Dispensary screenshot:', dispensaryScreenshot);

  await browser.close();
  server.close();

  console.log('\n[Playwright Audit] All audits completed successfully!');
}

runAudit().catch((err) => {
  console.error('[Playwright Audit] Error:', err);
  process.exit(1);
});
