import { chromium } from '@playwright/test';

const base = process.env.APP_URL || 'https://modelodeteste.lovable.app';
const failures = [];
const observations = [];
const browser = await chromium.launch({ headless: true });

async function auditPage(context, route, { protectedRoute = false } = {}) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`));
  try {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
    const status = response?.status() ?? 0;
    const bodyText = (await page.locator('body').innerText()).trim();
    const finalUrl = page.url();
    if (status >= 500 || status === 0) failures.push(`${route}: HTTP ${status}`);
    if (bodyText.length < 20) failures.push(`${route}: body vazio/curto (${bodyText.length})`);
    if (pageErrors.length) failures.push(`${route}: pageerror => ${pageErrors.join(' | ')}`);
    const significantConsole = consoleErrors.filter((x) => !/favicon|Failed to load resource.*404/i.test(x));
    if (significantConsole.length) observations.push(`${route}: console errors => ${significantConsole.join(' | ')}`);
    if (failedRequests.length) observations.push(`${route}: requests failed => ${failedRequests.slice(0, 8).join(' | ')}`);
    if (protectedRoute && !/\/auth(?:\?|$)/.test(finalUrl)) failures.push(`${route}: rota protegida não redirecionou para /auth (final ${finalUrl})`);
    console.log(`ROUTE\t${route}\t${status}\t${finalUrl}\tbody=${bodyText.length}`);
    return { page, status, finalUrl, bodyText };
  } catch (error) {
    failures.push(`${route}: navegação falhou: ${error.message}`);
    await page.close();
    return null;
  }
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
for (const route of ['/', '/catalogo', '/agendar', '/auth', '/termos', '/privacidade', '/redefinir-senha']) {
  const result = await auditPage(desktop, route);
  if (result) await result.page.close();
}
for (const route of ['/profissional', '/admin', '/admin/acessos', '/admin/catalogo', '/admin/clientes', '/admin/disponibilidade', '/admin/equipe', '/admin/financeiro']) {
  const result = await auditPage(desktop, route, { protectedRoute: true });
  if (result) await result.page.close();
}

// Public click flow: catalog -> first service -> booking.
{
  const page = await desktop.newPage();
  try {
    await page.goto(`${base}/catalogo`, { waitUntil: 'networkidle', timeout: 45000 });
    const serviceLink = page.locator('a[href^="/servico/"]').first();
    if (!(await serviceLink.count())) failures.push('catalogo: nenhum link de serviço encontrado');
    else {
      await serviceLink.click();
      await page.waitForLoadState('networkidle');
      if (!/\/servico\//.test(page.url())) failures.push(`catalogo -> detalhe: URL inesperada ${page.url()}`);
      const bookingLink = page.locator('a[href^="/agendar"]').first();
      if (!(await bookingLink.count())) failures.push('detalhe: nenhum link para agendamento encontrado');
      else {
        await bookingLink.click();
        await page.waitForLoadState('networkidle');
        if (!/\/agendar/.test(page.url())) failures.push(`detalhe -> agendar: URL inesperada ${page.url()}`);
      }
    }
  } catch (error) { failures.push(`fluxo catalogo/detalhe/agendar: ${error.message}`); }
  await page.close();
}

// Invalid login should fail safely and stay on auth.
{
  const page = await desktop.newPage();
  try {
    await page.goto(`${base}/auth`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.locator('#email').fill('qa-invalid-user@jrclinic.invalid');
    await page.locator('#senha').fill('invalid-password-qa');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForTimeout(1800);
    if (!/\/auth/.test(page.url())) failures.push(`login inválido saiu de /auth: ${page.url()}`);
  } catch (error) { failures.push(`login inválido: ${error.message}`); }
  await page.close();
}

// Mobile overflow and core pages.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
for (const route of ['/', '/catalogo', '/agendar', '/auth']) {
  const result = await auditPage(mobile, route);
  if (!result) continue;
  const overflow = await result.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 4) failures.push(`${route}: overflow horizontal mobile de ${overflow}px`);
  console.log(`MOBILE\t${route}\toverflow=${overflow}`);
  await result.page.close();
}

await desktop.close();
await mobile.close();
await browser.close();

console.log('\n=== OBSERVATIONS ===');
for (const item of observations) console.log(item);
console.log('\n=== FAILURES ===');
for (const item of failures) console.log(item);
if (failures.length) {
  console.error(`\nDeep browser QA failed with ${failures.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log('\nDeep browser QA passed public/protected smoke checks.');
}
