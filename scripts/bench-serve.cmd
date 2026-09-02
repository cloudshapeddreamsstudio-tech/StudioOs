@echo off
REM Serves the Frappe bench on :8000 for local StudioOS development.
REM
REM Node is installed via nvm, which is sourced from .bashrc, so this must be an
REM INTERACTIVE shell (bash -ic). A login shell (bash -lc) has no node on PATH
REM and bench fails with a confusing error.
REM
REM This script used to live in a Claude session's temp directory, which got
REM cleaned up and broke `preview_start` with "The system cannot find the path
REM specified." It lives in the repo now so it survives.
wsl -e bash -ic "cd ~/frappe-bench && bench serve --port 8000"
