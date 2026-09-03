import { test, expect } from '@playwright/test';

const ATTENDANCE_URL = '/ms/time/432248/attendance';

test('punch in attendance', async ({ page }) => {
  // Navigate to attendance page — session is already loaded via storageState
  await page.goto(ATTENDANCE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  // Check if already punched in — wait for the clock component to fully hydrate
  const clockElement = page.locator('dbx-ds-bluebar-clock');
  await expect(clockElement).toBeVisible({ timeout: 10_000 });

  // Read text from shadow DOM since "Punched In" is rendered inside it
  const clockText = await clockElement.evaluate((el) => {
    return el.shadowRoot?.textContent ?? '';
  });
  const isPunchedIn = /punched\s*in/i.test(clockText);

  if (isPunchedIn) {
    console.log('[SKIP] Attendance already recorded for today.');
    return;
  }

  // Get today's date number in IST
  const todayDate = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
  });

  // Find the calendar cell containing today's date number
  const calendarCells = page.locator('ui-calender-cell');
  const cellCount = await calendarCells.count();
  let todayCell = null;

  for (let i = 0; i < cellCount; i++) {
    const cell = calendarCells.nth(i);
    const titleSpan = cell.locator('.cell-title span.title');
    const text = await titleSpan.textContent({ timeout: 3_000 }).catch(() => '');
    if (text?.trim() === todayDate) {
      todayCell = cell;
      break;
    }
  }

  if (todayCell) {
    // Check both ui-attendance-status elements (statuses + attendance-statuses)
    const statusElements = todayCell.locator('ui-attendance-status');
    const statusCount = await statusElements.count();

    for (let i = 0; i < statusCount; i++) {
      const statusText = await statusElements
        .nth(i)
        .textContent({ timeout: 3_000 })
        .catch(() => '');
      if (/on\s*leave/i.test(statusText || '') || /holiday/i.test(statusText || '')) {
        console.log(
          `[SKIP] Today (${todayDate}) has leave/holiday status: "${statusText?.trim()}"`,
        );
        return;
      }
    }
    console.log(`[OK] No leave/holiday found for today (${todayDate}).`);
  } else {
    console.log(`[WARN] Could not find calendar cell for date ${todayDate}, proceeding anyway.`);
  }

  // Click the Clock In button in the header to open the dialog
  const clockButton = page.locator('dbx-ds-bluebar-clock');
  await expect(clockButton).toBeVisible({ timeout: 10_000 });
  await clockButton.click();

  // Wait for the clock-in dialog to appear
  const dialog = page.locator('.dialog-container');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Verify dialog header contains "Let's Get to Work"
  const dialogHeader = dialog.locator('.dialog-header .main-heading');
  await expect(dialogHeader).toContainText("Let's Get to Work", { timeout: 5_000 });

  // Verify dialog content contains today's date in format e.g. "Thu, 09 Apr 2026"
  // Build the string from parts to match UI ordering/abbreviations exactly.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(now);
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const todayFormatted = `${partMap.weekday}, ${partMap.day} ${partMap.month} ${partMap.year}`;
  const contentSlot = page.locator('.content-wrapper[slot="content"] .date-wrapper');
  await expect(contentSlot).toContainText(todayFormatted, { timeout: 5_000 });

  // Click the "Clockin" button in the dialog footer (slotted into footer)
  const clockInBtn = page.locator('[slot="footer"] dbx-ds-button');
  await expect(clockInBtn).toBeVisible({ timeout: 5_000 });
  await clockInBtn.click();

  // Verify punch was successful — "Punched In" text appears in shadow DOM
  await expect
    .poll(
      async () => {
        const text = await clockButton.evaluate((el) => el.shadowRoot?.textContent ?? '');
        return /punched\s*in/i.test(text);
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();

  console.log('[OK] Punched in successfully.');
});
