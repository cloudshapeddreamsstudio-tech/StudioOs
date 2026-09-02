@echo off
REM Runs the StudioOS Worker (the /api and /auth half) on :8787.
REM
REM Wrangler hard-refuses Bun's runtime ("Wrangler does not support the Bun
REM runtime"), so this must be npx, never bunx.
REM
REM This script used to live in a Claude session's temp directory, which got
REM cleaned up and broke `preview_start` with "The system cannot find the path
REM specified." It lives in the repo now so it survives.
cd /d E:\Swadharma\StudioOs\backend
npx wrangler dev --port 8787
