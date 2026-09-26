@echo off
REM Serves the local Frappe bench on :8000, for developing against a bench
REM instead of a live ERPNext site.
REM
REM Node is installed by nvm, which is sourced from .bashrc, so this must be an
REM INTERACTIVE shell (bash -ic). A login shell (bash -lc) has no node on PATH
REM and bench fails with a confusing error.
REM
REM Set BENCH_PATH if your bench is not at ~/frappe-bench.
if "%BENCH_PATH%"=="" set BENCH_PATH=~/frappe-bench
wsl -e bash -ic "cd %BENCH_PATH% && bench serve --port 8000"
