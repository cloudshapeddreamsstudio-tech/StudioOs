@echo off
REM The development server on :8787. Vite serves the SPA with hot reload, and
REM runs the StudioOS Worker inside it, in workerd. One process, one origin.
REM See docs/adr/0004-the-development-loop.md.
REM
REM To test what production does, use dev-worker.cmd instead. Both use :8787,
REM so run one at a time.
cd /d "%~dp0.." || exit /b 1
bun run dev
