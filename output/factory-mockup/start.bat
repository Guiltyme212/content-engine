@echo off
setlocal
REM ── Content Factory: start the local server and open the console ──────────────
REM Double-click this file. It launches the generator server (which holds the
REM OpenAI key server-side and runs the live "clone viral slides" pipeline),
REM then opens the console in your browser. Close the server window to stop it.

cd /d "%~dp0"

REM Find node.exe without depending on PATH (common install locations first).
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\nvm\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\nvm\nodejs\node.exe"
REM Fall back to whatever "node" is on PATH.
if not defined NODE_EXE set "NODE_EXE=node"

echo Starting Content Factory server on http://localhost:5178 ...
echo (using: %NODE_EXE%)
start "Content Factory server" cmd /k ""%NODE_EXE%" _gen\server.mjs"

REM give the server a moment to bind the port, then open the console
timeout /t 2 /nobreak >nul
start "" "http://localhost:5178/#carousels"

echo.
echo  Console opening in your browser.
echo  Keep the "Content Factory server" window OPEN while you use it.
echo  Close that window to stop the server.
endlocal
