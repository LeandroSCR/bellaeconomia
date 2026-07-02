@echo off
timeout /t 20 /nobreak > nul
cd /d "D:\Documentos\Claude\bellaeconomia"
call "C:\Users\leand\AppData\Roaming\npm\pm2.cmd" resurrect 2>nul
if %errorlevel% neq 0 (
  call "C:\Users\leand\AppData\Roaming\npm\pm2.cmd" start dist\index.js --name bellaeconomia
)
