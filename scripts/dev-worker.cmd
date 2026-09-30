@echo off
REM Builds the SPA, then runs the StudioOS Worker on :8787. The Worker serves
REM the SPA and the API on one origin.
REM
REM Start this from anywhere: the path is resolved from this script's own
REM location (%~dp0), not hardcoded. The previous version pinned one machine's
REM E:\ path and worked for nobody else.
REM
REM Bun runs everything here, Wrangler included. Older notes in this repository
REM said never to use `bunx wrangler`. That was true once and is not true now.
cd /d "%~dp0.." || exit /b 1
bun run start
