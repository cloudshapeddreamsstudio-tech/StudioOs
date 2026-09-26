@echo off
REM Runs the StudioOS Worker (the /api and /auth half) on :8787.
REM
REM Start this from anywhere: the path is resolved from this script's own
REM location (%~dp0), not hardcoded. The previous version pinned one machine's
REM E:\ path and worked for nobody else.
REM
REM Bun runs everything here, Wrangler included. Older notes in this repository
REM said never to use `bunx wrangler`. That was true once and is not true now.
cd /d "%~dp0..\worker" || exit /b 1
bun run dev
