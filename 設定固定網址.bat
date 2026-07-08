@echo off
chcp 65001 >nul
title 密聊 - 設定固定網址（ngrok，一次性設定）
cd /d "%~dp0"

echo.
echo  ────────────────────────────────────────────────
echo   設定固定網址（只需做這一次）
echo   完成後，「一鍵啟動聊天室.bat」的網址將固定不變。
echo  ────────────────────────────────────────────────
echo.

rem ---- 1) 確認 / 安裝 ngrok --------------------------------------
where ngrok >nul 2>nul
if errorlevel 1 (
  echo  [1/4] 尚未安裝 ngrok，現在用 winget 安裝（過程若詢問請按 Y）…
  winget install --id ngrok.ngrok --source winget
  where ngrok >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  已安裝，但這個視窗還讀不到新程式（PATH 尚未生效）。
    echo  請「關閉此視窗」後，再點一次「設定固定網址.bat」繼續。
    echo.
    pause
    exit /b 1
  )
) else (
  echo  [1/4] 已安裝 ngrok，跳過安裝。
)

rem ---- 2) 註冊 + 取得 authtoken ----------------------------------
echo.
echo  [2/4] 瀏覽器將開啟 ngrok 註冊/登入頁（免費帳號即可）。
echo        登入後會看到你的 authtoken（一串長長的英數字）。
start "" https://dashboard.ngrok.com/get-started/your-authtoken
echo.
set /p TOKEN=  請把 authtoken 貼到這裡，然後按 Enter：
if "%TOKEN%"=="" (
  echo  沒有輸入，已取消。可隨時重新執行本檔。
  pause
  exit /b 1
)
ngrok config add-authtoken %TOKEN%
if errorlevel 1 (
  echo  authtoken 設定失敗，請確認貼上的內容是否完整，再重新執行本檔。
  pause
  exit /b 1
)
echo  authtoken 設定完成。

rem ---- 3) 取得免費固定網域 ---------------------------------------
echo.
echo  [3/4] 瀏覽器將開啟你的 Domains 頁面。
echo        每個免費帳號都有一個專屬固定網域，長得像：
echo        happy-cat-1234.ngrok-free.dev
start "" https://dashboard.ngrok.com/domains
echo.
set /p DOMAIN=  請把你的固定網域貼到這裡（不含 https://），然後按 Enter：
if "%DOMAIN%"=="" (
  echo  沒有輸入，已取消。可隨時重新執行本檔。
  pause
  exit /b 1
)

rem ---- 4) 寫入設定檔 ---------------------------------------------
node -e "const d=process.argv[1].replace(/^https?:\/\//,'').replace(/\/.*$/,'');require('fs').writeFileSync('share.config.json',JSON.stringify({provider:'ngrok',ngrokDomain:d},null,2));console.log('  share.config.json 已寫入：'+d)" %DOMAIN%
if errorlevel 1 (
  echo  寫入設定失敗（找不到 Node.js？），請先安裝 Node.js 後重試。
  pause
  exit /b 1
)

echo.
echo  ────────────────────────────────────────────────
echo   [4/4] 完成！
echo   以後直接點「一鍵啟動聊天室.bat」，
echo   固定網址就是： https://%DOMAIN%
echo  ────────────────────────────────────────────────
echo.
pause
