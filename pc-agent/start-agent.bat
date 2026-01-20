@echo off
title PocketClaude Agent
cd /d "%~dp0"
set RELAY_URL=wss://pocketclaude-production.up.railway.app
set RELAY_TOKEN=bdf2858f0e664e1e882cdb19814800fdc27effd53a4db61ae1effb47f7e5900c
echo Starting PocketClaude Agent...
echo.
echo This window must stay open for PocketClaude to work.
echo Minimize it if needed.
echo.
node dist\index.js
pause
