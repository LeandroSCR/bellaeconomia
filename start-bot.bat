@echo off
cd /d "D:\Documentos\Claude\teuscupons"

if not exist "logs" mkdir logs

echo [%date% %time%] Iniciando TeusCupons bot... >> logs\bot.log

call npm run build >> logs\bot.log 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] ERRO: build falhou, abortando. >> logs\bot.log
    exit /b 1
)

node dist/index.js >> logs\bot.log 2>&1
