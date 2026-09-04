@echo off
setlocal
cd /d %~dp0
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Installing server dependencies...
  call npm install
)
if not exist client\node_modules (
  echo Installing client dependencies...
  call npm --prefix client install
)
echo Starting AK Crackers...
call npm run dev
