# Registra o bot TeusCupons no Task Scheduler do Windows para iniciar ao login.
# Execute este script UMA VEZ como Administrador.
# Para remover: Unregister-ScheduledTask -TaskName "TeusCupons Bot" -Confirm:$false

$TaskName = "TeusCupons Bot"
$VbsPath  = "D:\Documentos\Claude\teuscupons\start-bot-silent.vbs"

# Remove tarefa anterior com o mesmo nome, se existir
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
    -Execute "wscript.exe" `
    -Argument "`"$VbsPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Inicia o bot TeusCupons automaticamente ao fazer login no Windows" `
    -RunLevel Highest

Write-Host ""
Write-Host "Tarefa '$TaskName' registrada com sucesso!" -ForegroundColor Green
Write-Host "O bot vai iniciar automaticamente no proximo login."
Write-Host ""
Write-Host "Para verificar: Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "Para remover:  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
