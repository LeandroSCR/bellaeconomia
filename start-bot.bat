@echo off
setlocal
set LOG=D:\Documentos\Claude\bellaeconomia\boot-log.txt
echo [%date% %time%] start-bot.bat iniciado> "%LOG%"

rem Aguarda ~20s para rede/servicos subirem (ping funciona em sessao nao interativa)
ping -n 21 127.0.0.1 > nul 2>&1

cd /d "D:\Documentos\Claude\bellaeconomia"

rem PM2 local do projeto (disco D:) — o Task Scheduler nao enxerga
rem C:\Users\...\AppData\Roaming\npm (MODULE_NOT_FOUND), entao nada de global
set NODE_EXE=C:\Program Files\nodejs\node.exe
set PM2_JS=D:\Documentos\Claude\bellaeconomia\node_modules\pm2\bin\pm2

if not exist "%PM2_JS%" echo [%date% %time%] ERRO: pm2 local nao encontrado em %PM2_JS%>> "%LOG%"

echo [%date% %time%] chamando pm2 resurrect>> "%LOG%"
"%NODE_EXE%" "%PM2_JS%" resurrect >> "%LOG%" 2>&1
echo [%date% %time%] resurrect errorlevel=%errorlevel%>> "%LOG%"

rem Se o resurrect nao trouxe o bot, inicia do zero
"%NODE_EXE%" "%PM2_JS%" describe bellaeconomia > nul 2>&1
if %errorlevel% neq 0 (
  echo [%date% %time%] resurrect nao trouxe o processo, iniciando do zero>> "%LOG%"
  "%NODE_EXE%" "%PM2_JS%" start dist\index.js --name bellaeconomia >> "%LOG%" 2>&1
  echo [%date% %time%] start errorlevel=%errorlevel%>> "%LOG%"
)

echo [%date% %time%] start-bot.bat concluido>> "%LOG%"
exit 0
