// PWA checks: manifest, service worker control, offline app shell.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] ?? 'http://localhost:3000';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
await p.goto(BASE);
const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
if (manifest.display !== 'standalone' || !manifest.icons.some((i) => i.sizes === '512x512')) fail('manifest');
const apple = await p.getAttribute('link[rel="apple-touch-icon"]', 'href');
const capable = await p.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').count();
if (!apple || !capable) fail('apple meta');
await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(() => p.reload());
await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 });
await p.waitForTimeout(2000);
await ctx.setOffline(true);
for (const path of ['/', '/projects', '/create', '/editor', '/settings']) {
  await p.goto(BASE + path);
  const h = await p.locator('main').innerText();
  if (h.length < 10) fail(`offline ${path} empty`);
  console.log('offline ok', path, '-', h.slice(0, 40).replace(/\n/g, ' '));
}
const offlineBadge = await p.getByText('Offline').count();
console.log('offline indicator visible:', offlineBadge > 0);
await b.close();
console.log('PWA PASSED');
