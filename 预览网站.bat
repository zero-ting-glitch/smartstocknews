@echo off
rem ============================================================
rem  SmartStock local preview (same content as the live site)
rem  Double-click this file to preview; close the server window
rem  named "SmartStock Preview" to stop.
rem ============================================================
cd /d "%~dp0"

rem Kill any stale process still holding port 8080 (learned the hard way)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)

rem Start the static server in its own window
start "SmartStock Preview" "C:\Program Files\nodejs\node.exe" scripts\preview-server.js

rem Give it a moment, then open the browser
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/smartstocknews/"

echo Preview is running at http://localhost:8080/smartstocknews/
echo To stop: close the black window named "SmartStock Preview".
timeout /t 5 >nul
