# Punchin Automation

Automate daily attendance punch-in on the Neurealm Darwinbox portal using Playwright.

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
# Install dependencies
npm install

# Install Chromium browser (first time only)
npx playwright install chromium

# Create .env file from template
cp .env.example .env
```

Add your credentials to `.env`:

```
DB_EMAIL=your-email@company.com
DB_PASSWORD=your-password
```

## Usage

```bash
# Run punch-in (headed browser)
npm run punchin

# Run in default mode
npm test

# Run headed with debug visibility
npm run test:headed
```

## How It Works

1. **Session check** — Reuses saved browser session if less than 12 hours old, skipping login entirely.
2. **SSO login** — If session is expired, logs in via Microsoft SSO (handles email, password, and "Stay signed in?" prompt). Supports manual 2FA/CAPTCHA with an extended timeout.
3. **Status check** — Reads the clock component's shadow DOM for "Punched In" status. Also checks the attendance calendar for leave or holiday.
4. **Clock in** — Opens the clock-in dialog, verifies the date, and clicks "Clockin". Confirms success by polling for "Punched In" text.

The script is **idempotent** — safe to run multiple times per day.

## Project Structure

```
punchin-automation/
├── .env                    # Credentials (git-ignored)
├── .env.example            # Template
├── playwright.config.ts    # Playwright configuration
├── IMPLEMENTATION.md       # Detailed implementation notes
├── auth/
│   └── session.json        # Saved browser session (git-ignored)
└── tests/
    ├── auth.setup.ts       # Microsoft SSO authentication
    └── punchin.spec.ts     # Punch-in automation
```

## Notes

- All date checks use IST (`Asia/Kolkata`) timezone.
- On first run or after session expiry, you may need to complete 2FA/CAPTCHA manually in the browser window (120s timeout).
- Credentials are never hard-coded — always loaded from environment variables.
