@echo off
REM Runs the StudioOS SPA on :5173. It proxies /api and /auth to the Worker on
REM :8787, so start dev-worker.cmd first or the sign-in button does nothing.
cd /d "%~dp0..\app" || exit /b 1
bun run dev
