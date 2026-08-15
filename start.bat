@echo off
rem ============================================================
rem  Universal LPC Spritesheet Character Generator
rem  Dev mode: start Vite dev server and open the browser
rem  Default URL: http://localhost:5173
rem ============================================================
title Universal LPC Spritesheet Character Generator - Dev Server
setlocal
cd /d "%~dp0"

rem --- Check Node.js ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install it from https://nodejs.org/
    pause
    exit /b 1
)

rem --- Install dependencies on first run ---
if not exist "node_modules" (
    echo [INFO] First run: installing dependencies, this may take a few minutes...
    where pnpm >nul 2>nul
    if not errorlevel 1 (
        call pnpm install
        if errorlevel 1 goto :install_failed
    ) else (
        call npm install
        if errorlevel 1 goto :install_failed
    )
)

rem --- Pick package manager ---
set "PM=npm"
where pnpm >nul 2>nul
if not errorlevel 1 set "PM=pnpm"

echo [INFO] Starting Vite dev server with %PM% ...
echo [INFO] URL: http://localhost:5173  (press Ctrl+C to stop)
echo.
call %PM% run serve:open
if errorlevel 1 (
    echo [ERROR] Failed to start the dev server.
)

echo.
echo [EXIT] Dev server stopped.
pause
endlocal
exit /b 0

:install_failed
echo [ERROR] Dependency install failed. Check your network and try again.
pause
endlocal
exit /b 1
