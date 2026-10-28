@echo off
title SolarLayout
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call npm install
)
echo Abrindo o SolarLayout em http://localhost:5173  (feche esta janela para parar)
call npm run dev
pause
