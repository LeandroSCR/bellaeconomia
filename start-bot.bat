@echo off
ping -n 21 127.0.0.1 > nul 2>&1
cd /d "D:\Documentos\Claude\bellaeconomia"
call "C:\Users\leand\AppData\Roaming\npm\pm2.cmd" resurrect 2>nul
if %errorlevel% neq 0 (
  call "C:\Users\leand\AppData\Roaming\npm\pm2.cmd" start dist\index.js --name bellaeconomia
)
exit 0
