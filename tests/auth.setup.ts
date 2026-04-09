import { test as setup } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const SESSION_FILE = path.resolve('auth/session.json');
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
const ATTENDANCE_URL = 'https://neurealm.darwinbox.in/ms/time/432248/attendance';

function isSessionFresh(): boolean {
  if (!fs.existsSync(SESSION_FILE)) return false;
  const stat = fs.statSync(SESSION_FILE);
  const age = Date.now() - stat.mtimeMs;
  return age < SESSION_MAX_AGE_MS;
}

setup('authenticate via Microsoft SSO', async ({ page }) => {
  // Skip login if session is still fresh
  if (isSessionFresh()) {
    console.log('[AUTH] Reusing saved session (< 12h old).');
    return;
  }

  const email = process.env.DB_EMAIL;
  const password = process.env.DB_PASSWORD;
  if (!email || !password) {
    throw new Error('DB_EMAIL and DB_PASSWORD must be set in .env');
  }

  console.log('[AUTH] Session expired or missing. Logging in via Microsoft SSO...');

  // Navigate to attendance — Darwinbox will redirect to login if not authenticated
  await page.goto(ATTENDANCE_URL, { waitUntil: 'networkidle' });

  // Check if we landed on the attendance page (already authenticated)
  const isOnAttendancePage = await page
    .getByText(/punched\s*in|clock\s*in|attendance/i)
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (isOnAttendancePage) {
    console.log('[AUTH] Already authenticated.');
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    await page.context().storageState({ path: SESSION_FILE });
    return;
  }

  // We're on a login page — click the "Neurealm SSO" link
  const ssoLink = page
    .getByRole('link', { name: /neurealm sso/i })
    .or(page.locator('a').filter({ hasText: /neurealm sso/i }));
  await ssoLink.first().click();

  // --- Microsoft OAuth flow ---
  await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 30_000 });

  // Enter email
  await page
    .getByPlaceholder(/email.*phone.*skype/i)
    .or(page.locator('input[type="email"]'))
    .first()
    .fill(email);
  await page.getByRole('button', { name: /next/i }).click();

  // Enter password
  await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Handle "Stay signed in?" prompt
  const staySignedIn = page.locator('input[type="submit"][value="Yes"]');
  await staySignedIn.waitFor({ state: 'visible', timeout: 10_000 });
  await staySignedIn.click();

  // Wait for redirect back to Darwinbox
  try {
    await page.waitForURL(/neurealm\.darwinbox\.in/, { timeout: 60_000 });
  } catch {
    console.log('[AUTH] Waiting for manual 2FA/CAPTCHA completion...');
    await page.waitForURL(/neurealm\.darwinbox\.in/, { timeout: 120_000 });
  }

  // Wait for page to fully load so all cookies are set
  await page.waitForLoadState('networkidle');

  console.log('[AUTH] Login successful. Saving session...');

  // Save session from the same context Playwright manages
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  await page.context().storageState({ path: SESSION_FILE });
});
