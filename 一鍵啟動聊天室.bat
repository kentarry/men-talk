@echo off
chcp 65001 >nul
title 密聊 - 一鍵啟動
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [錯誤] 找不到 Node.js。請先安裝： https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo  ────────────────────────────────────────────
echo   密聊 · 一鍵啟動
echo   正在啟動伺服器與分享隧道，瀏覽器將自動開啟…
echo.
echo   使用期間請保持此視窗開啟。
echo   關閉此視窗 = 關閉聊天室與分享網址。
echo  ────────────────────────────────────────────
echo.

node tools\share.js

echo.
echo  已停止。按任意鍵關閉視窗…
pause >nul
