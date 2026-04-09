# Punchin Automation — Spec

## Goal

Automate daily attendance punch-in on the Neurealm Darwinbox portal using Playwright.

---

## Target URL

`https://neurealm.darwinbox.in/ms/time/432248/attendance`

---

## Flow

### 1. Launch browser and navigate
- Open a Chromium browser (headed or headless).
- Navigate to the attendance URL.

### 2. Detect login state
- If redirected to a login/SSO page, proceed with login.
- If already on the attendance page, skip login.

### 3. Login via Neurealm SSO (Microsoft OAuth)
- Click the "Neurealm SSO" link on the login page.
- Redirected to `login.microsoftonline.com` — enter email, then password.
- Handle the "Stay signed in?" prompt (click Yes).
- Wait for redirect back to Darwinbox (with a fallback timeout for manual 2FA/CAPTCHA).
- Save browser session to `auth/session.json` for reuse within 12 hours.

### 4. Check attendance status for today
- Look for a "Punched in" indicator in the top-right corner of the header.
- Also check if a leave is marked for today.
- If either condition is true → attendance is already recorded → exit without action.

### 5. Clock in
- If attendance/leave is NOT marked, locate the "Clock In" (or equivalent) button in the top-right header area.
- Click it.
- Wait for confirmation that punch-in was successful (e.g., "Punched in" text appears).

### 6. Report result
- Log the outcome to the console:
  - Already punched in / leave marked → `[SKIP] Attendance already recorded for today.`
  - Successfully punched in → `[OK] Punched in successfully.`
  - Any error → `[ERROR] <message>`

---

## Configuration

All sensitive values are read from environment variables (never hard-coded):

| Variable         | Description                        |
|------------------|------------------------------------|
| `DB_EMAIL`       | Darwinbox / SSO login email        |
| `DB_PASSWORD`    | SSO password                       |

A `.env` file (git-ignored) is used locally; CI can inject vars directly.

---

## Tech Stack

- **Runtime**: Node.js 20
- **Test framework / runner**: Playwright (with `@playwright/test`)
- **Language**: TypeScript
- **Environment loading**: `dotenv`

---

## Project Structure

```
punchin-automation/
├── .env                  # Local secrets (git-ignored)
├── .env.example          # Template with variable names, no values
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── spec.md               # This file
└── tests/
    └── punchin.spec.ts   # Main automation script
```

---

## Running

```bash
# Install dependencies
npm install

# Run the automation
npx playwright test

# Run headed (visible browser) for debugging
npx playwright test --headed
```

---

## Notes

- The script should be idempotent — running it multiple times on the same day is safe.
- SSO flow uses Microsoft (Azure AD) OAuth redirect; the script must handle the "Stay signed in?" prompt and potential MFA.
- Selectors should be resilient (prefer `role`, `text`, or `data-*` attributes over fragile CSS paths).
- On first run, use `npx playwright install chromium` to download the browser binary.
