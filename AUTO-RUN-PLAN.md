# Auto-Run Punchin Automation on System Startup

## Context

The punchin-automation project runs `npx playwright test --headed` to automatically clock in on Darwinbox HR portal. Currently it must be run manually. The user wants it to run automatically when they start/open their Mac each morning.

Key constraint: the script uses a **headed (visible) browser**, so it needs the macOS GUI session to be fully ready before launching.

## Recommended Approach: macOS LaunchAgent + Wrapper Script

LaunchAgent is the best option because:

- Native macOS mechanism, runs in the user's GUI session (headed browser works)
- Triggers both **at login** and at a **daily scheduled time** (09:30)
- If the Mac was asleep at 09:30, launchd fires the job when it wakes -- no missed punch-ins
- The script is idempotent, so double-firing is safe
- Easy to manage via `launchctl` commands

### Files to Create

| File                                                  | Purpose                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `scripts/run-punchin.sh`                              | Wrapper script (sets NVM PATH, skips weekends, waits for GUI, logs output) |
| `~/Library/LaunchAgents/com.gauravsali.punchin.plist` | LaunchAgent plist (triggers at login + 09:30 daily)                        |

### Files to Modify

| File         | Change                             |
| ------------ | ---------------------------------- |
| `.gitignore` | Add `logs/` and `scripts/` entries |

---

## Implementation Steps

### Step 1: Create `scripts/run-punchin.sh`

```bash
#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/gauravsali/Gaurav/Work/My-Work/punchin-automation"
LOG_FILE="$PROJECT_DIR/logs/punchin-$(date +%Y-%m-%d).log"
NVM_DIR="/Users/gauravsali/.nvm"
NODE_BIN="$NVM_DIR/versions/node/v20.19.3/bin"

export PATH="$NODE_BIN:$PATH"

# Skip weekends
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -eq 6 ] || [ "$DAY_OF_WEEK" -eq 7 ]; then
    echo "[$(date)] Skipping — weekend." >> "$LOG_FILE"
    exit 0
fi

mkdir -p "$PROJECT_DIR/logs"

# Wait for GUI session (headed browser needs WindowServer)
for i in $(seq 1 30); do
    pgrep -x "WindowServer" > /dev/null 2>&1 && break
    sleep 2
done
sleep 10

# Clean logs older than 30 days
find "$PROJECT_DIR/logs" -name "punchin-*.log" -mtime +30 -delete 2>/dev/null || true

echo "========================================" >> "$LOG_FILE"
echo "[$(date)] Starting punchin automation..." >> "$LOG_FILE"

cd "$PROJECT_DIR"
npx playwright test --headed >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] Punchin completed successfully." >> "$LOG_FILE"
else
    echo "[$(date)] Punchin failed with exit code $EXIT_CODE." >> "$LOG_FILE"
fi
exit $EXIT_CODE
```

Make executable: `chmod +x scripts/run-punchin.sh`

### Step 2: Create LaunchAgent plist

File: `~/Library/LaunchAgents/com.gauravsali.punchin.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.gauravsali.punchin</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/gauravsali/Gaurav/Work/My-Work/punchin-automation/scripts/run-punchin.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/gauravsali/Gaurav/Work/My-Work/punchin-automation/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/gauravsali/Gaurav/Work/My-Work/punchin-automation/logs/launchd-stderr.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/gauravsali/Gaurav/Work/My-Work/punchin-automation</string>
    <key>KeepAlive</key>
    <false/>
    <key>ThrottleInterval</key>
    <integer>60</integer>
</dict>
</plist>
```

### Step 3: Update `.gitignore`

Add `logs/` to `.gitignore`.

### Step 4: Load the agent

```bash
mkdir -p /Users/gauravsali/Gaurav/Work/My-Work/punchin-automation/logs
launchctl load ~/Library/LaunchAgents/com.gauravsali.punchin.plist
```

---

## Management Commands

```bash
# Check status
launchctl list | grep punchin

# Manual trigger
launchctl start com.gauravsali.punchin

# Disable
launchctl unload ~/Library/LaunchAgents/com.gauravsali.punchin.plist

# Re-enable
launchctl load ~/Library/LaunchAgents/com.gauravsali.punchin.plist

# View today's logs
tail -50 logs/punchin-$(date +%Y-%m-%d).log
```

---

## Verification

1. Create the wrapper script and make it executable
2. Run `./scripts/run-punchin.sh` manually to verify it works
3. Create the plist and load it with `launchctl load`
4. Run `launchctl start com.gauravsali.punchin` to trigger manually
5. Check `logs/punchin-*.log` for success output
6. Log out and log back in to verify it auto-triggers on login

---

## Notes

- If Node.js version changes via NVM, update `NODE_BIN` path in `run-punchin.sh`
- First run after session expiry (12h) may require manual 2FA -- the headed browser window will be visible for this
- The 09:30 daily trigger acts as a safety net if login happened before that time
- Weekend skipping is handled in the wrapper script
