@echo off
REM Runs the StudioOS Worker (the /api and /auth half) on :8787.
REM
REM Start this from anywhere: the path is resolved from this script's own
REM location (%~dp0), not hardcoded. The previous version pinned one machine's
REM E:\ path and worked for nobody else.
REM
REM Wrangler refuses to run as Bun's runtime, so never `bunx wrangler`.
REM `bun run dev` is fine, because the package script shells out to Wrangler's
REM own node binary.
cd /d "%~dp0..\worker" || exit /b 1
bun run dev
