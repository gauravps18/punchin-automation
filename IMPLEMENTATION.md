# Punchin Automation — Implementation Details

## Overview

Automated daily attendance punch-in on the Neurealm Darwinbox portal using Playwright with TypeScript. The automation handles Microsoft SSO login, session persistence, and idempotent clock-in.

---

## Architecture

The project uses Playwright's **multi-project setup** with two projects that run sequentially:

1. **`setup`** — Handles authentication (`tests/auth.setup.ts`)
2. **`chromium`** — Runs the punch-in test (`tests/punchin.spec.ts`), depends on `setup`

The `chromium` project reuses the saved session via Playwright's `storageState`, so login only happens when the session has expired.

---

## Authentication (`tests/auth.setup.ts`)

### Session Reuse

- Sessions are saved to `auth/session.json`.
- On each run, the file's modification time is checked — if it's less than **12 hours old**, login is skipped entirely.
- This avoids unnecessary SSO flows and reduces the chance of triggering MFA prompts.

### Microsoft SSO Login Flow

1. Navigate to the attendance URL — Darwinbox redirects to login if unauthenticated.
2. Check if already on the attendance page (session still valid in browser). If yes, save session and exit.
3. Click the **"Neurealm SSO"** link on the Darwinbox login page.
4. Redirected to `login.microsoftonline.com`:
   - Fill email in the email/phone/skype input field.
   - Click **Next**.
   - Fill password in the password input field.
   - Click **Sign in**.
5. Handle the **"Stay signed in?"** prompt — click **Yes**.
6. Wait for redirect back to `neurealm.darwinbox.in` (60s timeout, extended to 120s if manual 2FA/CAPTCHA is needed).
7. Wait for `networkidle` to ensure all cookies are set.
8. Save the browser context's storage state to `auth/session.json`.

---

## Punch-In (`tests/punchin.spec.ts`)

### Step 1: Check if Already Punched In

- Locates the `dbx-ds-bluebar-clock` custom web component in the page header.
- Reads text from its **shadow DOM** (since "Punched In" is rendered inside shadow root).
- If "Punched In" is found → logs `[SKIP]` and exits.

### Step 2: Check for Leave or Holiday

- Gets today's date number in IST (`Asia/Kolkata` timezone).
- Iterates through all `ui-calender-cell` elements in the attendance calendar.
- Finds the cell where `.cell-title span.title` matches today's date.
- Checks all `ui-attendance-status` elements within that cell for "On Leave" or "Holiday" text.
- If found → logs `[SKIP]` with the status and exits.

### Step 3: Clock In

1. Click the `dbx-ds-bluebar-clock` component to open the clock-in dialog.
2. Wait for `.dialog-container` to become visible.
3. Verify the dialog header (`.dialog-header .main-heading`) contains **"Let's Get to Work"**.
4. Verify the date in `[slot="content"] .date-wrapper` matches today's date formatted as `"Thu, 09 Apr 2026"` (en-GB, IST timezone).
5. Click the **"Clockin"** button located at `[slot="footer"] dbx-ds-button`.
6. Poll the shadow DOM of `dbx-ds-bluebar-clock` until "Punched In" text appears (15s timeout).
7. Log `[OK] Punched in successfully.`

---

## Configuration

| Variable      | Description               |
|---------------|---------------------------|
| `DB_EMAIL`    | Darwinbox / SSO email     |
| `DB_PASSWORD` | SSO password              |

Stored in `.env` (git-ignored). See `.env.example` for the template.

---

## Playwright Configuration (`playwright.config.ts`)

| Setting             | Value                                    |
|---------------------|------------------------------------------|
| Base URL            | `https://neurealm.darwinbox.in`          |
| Test timeout        | 120 seconds                              |
| Action timeout      | 30 seconds                               |
| Navigation timeout  | 60 seconds                               |
| Viewport            | 1280 x 720                               |
| Headless            | `false` (runs with visible browser)      |
| Workers             | 1 (sequential execution)                 |
| Retries             | 0                                        |

---

## Project Structure

```
punchin-automation/
├── .env                    # Secrets (git-ignored)
├── .env.example            # Template
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── SPEC.md                 # Feature specification
├── IMPLEMENTATION.md       # This file
├── auth/
│   └── session.json        # Saved browser session (git-ignored)
└── tests/
    ├── auth.setup.ts       # SSO authentication setup
    └── punchin.spec.ts     # Main punch-in automation
```

---

## Running

```bash
# Install dependencies
npm install

# Install Chromium browser (first time only)
npx playwright install chromium

# Run automation (headed)
npm run punchin

# Run automation (default mode)
npm test
```

---

## Key Implementation Details

- **Shadow DOM access**: The Darwinbox clock component (`dbx-ds-bluebar-clock`) renders its content inside shadow DOM. Standard Playwright locators can't see this text, so `element.evaluate()` is used to read `shadowRoot.textContent`.
- **IST timezone**: All date checks use `Asia/Kolkata` timezone to match the portal's expected dates regardless of the machine's local timezone.
- **Idempotent**: Safe to run multiple times per day — it checks status before acting.
- **2FA/CAPTCHA fallback**: If the SSO redirect doesn't complete within 60 seconds (e.g., manual 2FA required), the timeout extends to 120 seconds with a console log prompting the user.
