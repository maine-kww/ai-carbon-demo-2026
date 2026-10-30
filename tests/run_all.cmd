@echo off
REM ============================================================
REM Full regression: 16 probes + 3 audit probes + smoke + 2 lints
REM Any failure exits non-zero.
REM ============================================================
setlocal
if defined MIMO_NODE (set "NODE=%MIMO_NODE%") else (set "NODE=node")
if defined MIMO_PYTHON (set "PY=%MIMO_PYTHON%") else (set "PY=python")
cd /d "%~dp0.."

echo === [1/3] Probes ===
for %%t in (probe_batchA probe_batchB probe_batchC probe_batchD probe_batchE probe_f3 probe_f4 probe_f5 probe_f6 probe_f8 probe_f9 probe_f10 probe_f13 probe_f14 probe_scale probe_pains probe_diag) do (
  "%NODE%" tests\%%t.js >nul 2>&1
  if errorlevel 1 ( echo   FAIL %%t & exit /b 1 ) else ( echo   PASS %%t )
)

echo === [2/3] Repo audit probes ===
for %%t in (verify_gaps audit_windows audit_cement) do (
  "%NODE%" tests\%%t.js >nul 2>&1
  if errorlevel 1 ( echo   FAIL %%t & exit /b 1 ) else ( echo   PASS %%t )
)

echo === [3/3] Smoke + lints ===
"%NODE%" tests\smoke.js >nul 2>&1
if errorlevel 1 ( echo   FAIL smoke & exit /b 1 ) else ( echo   PASS smoke )
"%PY%" tests\ci_lint_page_quality.py index.html --has-database >nul 2>&1
if errorlevel 1 ( echo   FAIL lint_page_quality & exit /b 1 ) else ( echo   PASS lint_page_quality )
"%PY%" tests\ci_lint_database_sdk_usage.py index.html >nul 2>&1
if errorlevel 1 ( echo   FAIL lint_database_sdk & exit /b 1 ) else ( echo   PASS lint_database_sdk )

echo.
echo ALL_GREEN
exit /b 0
