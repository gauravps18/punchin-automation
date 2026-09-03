# Auto-Run Punchin Automation on System Startup

## Context

The punchin-automation project runs `npx playwright test --headed` to automatically clock in on Darwinbox HR portal. Currently it must be run manually. The goal is to run it automatically when the machine starts/the user logs in each morning.

Key constraint: the script uses a **headed (visible) browser**, so it needs the OS GUI session to be fully ready before launching.

---

## macOS: LaunchAgent + Wrapper Script

LaunchAgent is the best option because:

- Native macOS mechanism, runs in the user's GUI session (headed browser works)
- Triggers both **at login** and at a **daily scheduled time** (09:30)
- If the Mac was asleep at 09:30, launchd fires the job when it wakes — no missed punch-ins
- The script is idempotent, so double-firing is safe
- Easy to manage via `launchctl` commands

### Files to Create

| File                                                  | Purpose                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `scripts/run-punchin.sh`                              | Wrapper script (sets NVM PATH, skips weekends, waits for GUI, logs output) |
| `~/Library/LaunchAgents/com.gauravsali.punchin.plist` | LaunchAgent plist (triggers at login + 09:30 daily)                        |

### Files to Modify

| File         | Change              |
| ------------ | ------------------- |
| `.gitignore` | Add `logs/` entry   |

---

### Step 1: Create `scripts/run-punchin.sh`

```bash
#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/gauravsali/Work/GS/punchin-automation"
LOG_FILE="$PROJECT_DIR/logs/punchin-$(date +%Y-%m-%d).log"
NVM_DIR="/Users/gauravsali/.nvm"
NODE_BIN="$NVM_DIR/versions/node/v24.15.0/bin"

export PATH="$NODE_BIN:$PATH"

mkdir -p "$PROJECT_DIR/logs"

# Skip weekends
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -eq 6 ] || [ "$DAY_OF_WEEK" -eq 7 ]; then
    echo "[$(date)] Skipping — weekend." >> "$LOG_FILE"
    exit 0
fi

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
        <string>/Users/gauravsali/Work/GS/punchin-automation/scripts/run-punchin.sh</string>
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
    <string>/Users/gauravsali/Work/GS/punchin-automation/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/gauravsali/Work/GS/punchin-automation/logs/launchd-stderr.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/gauravsali/Work/GS/punchin-automation</string>
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
mkdir -p /Users/gauravsali/Work/GS/punchin-automation/logs
launchctl load ~/Library/LaunchAgents/com.gauravsali.punchin.plist
```

### macOS Management Commands

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

### macOS Verification

1. Create the wrapper script and make it executable
2. Run `./scripts/run-punchin.sh` manually to verify it works
3. Create the plist and load it with `launchctl load`
4. Run `launchctl start com.gauravsali.punchin` to trigger manually
5. Check `logs/punchin-*.log` for success output
6. Log out and log back in to verify it auto-triggers on login

---

## Windows: Task Scheduler + PowerShell Script

Windows Task Scheduler is the equivalent of macOS LaunchAgent:

- Runs in the user's interactive session (headed browser works)
- Triggers both **at logon** and at a **daily scheduled time** (09:30)
- If the PC was sleeping at 09:30, Task Scheduler fires the missed task on wake
- Easy to manage via `schtasks` commands or the Task Scheduler GUI

### Files to Create

| File                        | Purpose                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `scripts/run-punchin.ps1`   | PowerShell wrapper script (skips weekends, waits for Explorer, logs output)         |
| `scripts/punchin-task.xml`  | Task Scheduler XML (import once to register both logon + 09:30 triggers)            |

---

### Step 1: Create `scripts/run-punchin.ps1`

> Update `$ProjectDir` to the actual Windows path before running.

```powershell
$ErrorActionPreference = "Stop"

$ProjectDir = "C:\Users\gauravsali\Work\GS\punchin-automation"
$LogDir     = "$ProjectDir\logs"
$LogFile    = "$LogDir\punchin-$(Get-Date -Format 'yyyy-MM-dd').log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Skip weekends
$day = (Get-Date).DayOfWeek
if ($day -eq "Saturday" -or $day -eq "Sunday") {
    Add-Content -Path $LogFile -Value "[$(Get-Date)] Skipping — weekend."
    exit 0
}

# Wait for Explorer (signals GUI session is ready)
$retries = 0
while ($retries -lt 30) {
    if (Get-Process -Name "explorer" -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Seconds 2
    $retries++
}
Start-Sleep -Seconds 10

# Clean logs older than 30 days
Get-ChildItem -Path $LogDir -Filter "punchin-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

Add-Content -Path $LogFile -Value "========================================"
Add-Content -Path $LogFile -Value "[$(Get-Date)] Starting punchin automation..."

Set-Location $ProjectDir
try {
    $output = & npx playwright test --headed 2>&1
    $output | ForEach-Object { Add-Content -Path $LogFile -Value $_ }
    Add-Content -Path $LogFile -Value "[$(Get-Date)] Punchin completed successfully."
} catch {
    Add-Content -Path $LogFile -Value "[$(Get-Date)] Punchin failed: $_"
    exit 1
}
```

### Step 2: Create `scripts/punchin-task.xml`

> Update the `<Author>`, `<UserId>`, and `<Arguments>` paths to match the actual Windows username and project path.

```xml
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Auto punch-in on Darwinbox at login and 09:30 daily.</Description>
    <Author>gauravsali</Author>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>gauravsali</UserId>
    </LogonTrigger>
    <CalendarTrigger>
      <StartBoundary>2024-01-01T09:30:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
  </Settings>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-ExecutionPolicy Bypass -NonInteractive -File "C:\Users\gauravsali\Work\GS\punchin-automation\scripts\run-punchin.ps1"</Arguments>
      <WorkingDirectory>C:\Users\gauravsali\Work\GS\punchin-automation</WorkingDirectory>
    </Exec>
  </Actions>
  <Principals>
    <Principal>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
</Task>
```

### Step 3: Register the Task

Open **PowerShell as Administrator** and run:

```powershell
# Import the task from XML
schtasks /create /tn "PunchinAutomation" /xml "C:\Users\gauravsali\Work\GS\punchin-automation\scripts\punchin-task.xml" /f

# Allow running PowerShell scripts (if not already set)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Step 4: Update `.gitignore`

Add `logs/` to `.gitignore` (already present from macOS setup).

### Windows Management Commands

```powershell
# Check task status
schtasks /query /tn "PunchinAutomation" /fo LIST

# Manual trigger
schtasks /run /tn "PunchinAutomation"

# Disable
schtasks /change /tn "PunchinAutomation" /disable

# Re-enable
schtasks /change /tn "PunchinAutomation" /enable

# Delete
schtasks /delete /tn "PunchinAutomation" /f

# View today's log (PowerShell)
Get-Content "logs\punchin-$(Get-Date -Format 'yyyy-MM-dd').log" -Tail 50
```

### Windows Verification

1. Update `$ProjectDir` in `run-punchin.ps1` and paths in `punchin-task.xml` to match actual Windows path
2. Run `.\scripts\run-punchin.ps1` manually in PowerShell to verify it works
3. Import the task: `schtasks /create /tn "PunchinAutomation" /xml "scripts\punchin-task.xml" /f`
4. Trigger manually: `schtasks /run /tn "PunchinAutomation"`
5. Check `logs\punchin-*.log` for success output
6. Log out and log back in to verify it auto-triggers on logon

---

## Notes

- If Node.js version changes via NVM, update `NODE_BIN` path in `run-punchin.sh` (macOS)
- On Windows, Node must be in the system/user PATH; if using nvm-windows, ensure the active version is set before running
- First run after session expiry (12h) may require manual 2FA — the headed browser window will be visible for this
- The 09:30 daily trigger acts as a safety net if login happened before that time
- Weekend skipping is handled in the wrapper script on both platforms
- `StartWhenAvailable` in the Windows task XML ensures missed triggers (e.g. machine was off at 09:30) fire on next wake
