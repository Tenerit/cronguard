<#
  Observe des tâches planifiées Windows SANS les modifier et envoie leur résultat à CronGuard.

  Limite : une tâche lancée via wscript ne remonte pas le code de son script. Pour celles-là,
  seul le fait qu'elle tourne est fiable, sauf si un log est configuré.

  Config (hors repo, contient les clés de ping) : %LOCALAPPDATA%\CronGuard\observer.json
    { "url": "http://localhost:3000",
      "tasks": [ { "task": "NomDeLaTache", "pingKey": "...", "log": "C:\\chemin\\optionnel.log" } ] }

  Usage : powershell -File windows-observer.ps1 [-ConfigPath x] | -SelfTest
#>
param(
  [string]$ConfigPath = "$env:LOCALAPPDATA\CronGuard\observer.json",
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'

$ERROR_PATTERN = '\b(ERROR|CRITICAL)\b|Traceback \(most recent call last\)'
$MAX_OUTPUT    = 3500   # l'API plafonne output à 4000 caractères
$TASK_RUNNING  = 267009
$TASK_NEVER    = 267011

# Décide du ping pour une exécution terminée. $newLog = texte ajouté au log depuis le dernier passage.
function Get-PingPayload([string]$taskName, [long]$result, [string]$newLog) {
  $lines = @($newLog -split "`r?`n")
  $first = -1
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -cmatch $ERROR_PATTERN) { $first = $i; break } }

  $body = @{ status = 'success' }
  if ($result -ne 0) { $body.status = 'fail' }
  if ($first -ge 0)  { $body.status = 'fail' }
  if ($body.status -eq 'success') { return $body }

  # Un résultat Windows (0x8...) dépasse la plage acceptée pour exit_code : on le garde en texte.
  $notes = @()
  if ($result -ge -999 -and $result -le 999) { $body.exit_code = [int]$result }
  else { $notes += ("Scheduled task {0} ended with Windows result 0x{1:X8}" -f $taskName, ([int64]$result -band 0xFFFFFFFFL)) }
  if ($first -ge 0) { $notes += (($lines[$first..($lines.Count - 1)] -join "`n").Trim()) }
  if ($notes.Count) {
    $text = $notes -join "`n"
    if ($text.Length -gt $MAX_OUTPUT) { $text = $text.Substring(0, $MAX_OUTPUT) }
    $body.output = $text
  }
  return $body
}

# Lit ce qui a été ajouté au log depuis $offset. FileShare.ReadWrite : le job peut être en train d'écrire.
function Read-NewLog([string]$path, [long]$offset) {
  if (-not (Test-Path -LiteralPath $path)) { return @{ text = ''; offset = 0L } }
  $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
  try {
    if ($fs.Length -lt $offset) { $offset = 0L }   # log tourné
    [void]$fs.Seek($offset, 'Begin')
    $reader = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
    return @{ text = $reader.ReadToEnd(); offset = $fs.Length }
  } finally { $fs.Dispose() }
}

function Invoke-SelfTest {
  $fails = 0
  function Assert([string]$name, [bool]$ok) { if ($ok) { "OK   $name" } else { "FAIL $name"; $script:fails++ } }
  $script:fails = 0

  $p = Get-PingPayload 't' 0 "2026 INFO tout va bien`n2026 WARNING lent"
  Assert 'succès : code 0, sans erreur, WARNING ignoré' ($p.status -eq 'success' -and -not $p.ContainsKey('output'))

  $p = Get-PingPayload 't' 3 ''
  Assert 'échec : petit code conservé, sans texte inventé' ($p.status -eq 'fail' -and $p.exit_code -eq 3 -and -not $p.ContainsKey('output'))

  $p = Get-PingPayload 't' 2147806724 ''
  Assert 'échec : code Windows en texte, pas en exit_code' ($p.status -eq 'fail' -and -not $p.ContainsKey('exit_code') -and $p.output -match '0x80')

  $p = Get-PingPayload 't' 0 "2026 INFO ok`n2026 ERROR cycle en echec`nTraceback (most recent call last):`n  boom"
  Assert 'code 0 mais ERROR au log : échec, log depuis la 1re erreur' ($p.status -eq 'fail' -and $p.output -notmatch 'INFO ok' -and $p.output -match 'boom')

  $p = Get-PingPayload 't' 0 'no error here, errors=0'
  Assert 'mots contenant error en minuscules : pas un échec' ($p.status -eq 'success')

  $p = Get-PingPayload 't' 0 ("ERROR x`n" + ('y' * 9000))
  Assert 'sortie plafonnée' ($p.output.Length -le $MAX_OUTPUT)

  $tmp = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($tmp, 'ancien')
    $r1 = Read-NewLog $tmp 0
    [IO.File]::AppendAllText($tmp, ' nouveau')
    $r2 = Read-NewLog $tmp $r1.offset
    Assert 'log : seul le nouveau texte est lu' ($r2.text -eq ' nouveau')
    [IO.File]::WriteAllText($tmp, 'z')
    $r3 = Read-NewLog $tmp $r2.offset
    Assert 'log tourné : relu depuis le début' ($r3.text -eq 'z')
  } finally { Remove-Item -LiteralPath $tmp -Force }
  Assert 'log absent : vide' ((Read-NewLog 'C:\n-existe-pas.log' 0).text -eq '')

  if ($script:fails) { throw "$script:fails test(s) en échec" }
  'TOUT OK'
}

if ($SelfTest) { Invoke-SelfTest; return }

$config    = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$dir       = Split-Path -Parent $ConfigPath
$statePath = Join-Path $dir (([IO.Path]::GetFileNameWithoutExtension($ConfigPath)) + '-state.json')
$logPath   = Join-Path $dir (([IO.Path]::GetFileNameWithoutExtension($ConfigPath)) + '.log')
function Write-ObserverLog([string]$m) { Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ((Get-Date -Format s) + " $m") }

$state = @{ runs = @{}; offsets = @{} }
if (Test-Path -LiteralPath $statePath) {
  $saved = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($n in $saved.runs.PSObject.Properties)    { $state.runs[$n.Name]    = $n.Value }
  foreach ($n in $saved.offsets.PSObject.Properties) { $state.offsets[$n.Name] = [long]$n.Value }
}

foreach ($t in $config.tasks) {
  try {
    # 1er passage sur un log : on part de la fin, les anciennes erreurs ne sont pas de nouvelles pannes.
    if ($t.log -and -not $state.offsets.ContainsKey($t.log) -and (Test-Path -LiteralPath $t.log)) {
      $state.offsets[$t.log] = (Get-Item -LiteralPath $t.log).Length
    }
    $task = Get-ScheduledTask -TaskName $t.task
    $info = $task | Get-ScheduledTaskInfo
    if ($task.State -eq 'Running' -or $info.LastTaskResult -eq $TASK_RUNNING -or $info.LastTaskResult -eq $TASK_NEVER) { continue }
    $run = $info.LastRunTime.ToUniversalTime().ToString('o')
    if ($state.runs[$t.task] -eq $run) { continue }

    $newLog = ''; $newOffset = $null
    if ($t.log) {
      $off = 0L; if ($state.offsets.ContainsKey($t.log)) { $off = $state.offsets[$t.log] }
      $read = Read-NewLog $t.log $off
      $newLog = $read.text; $newOffset = $read.offset
    }

    $body = Get-PingPayload $t.task ([long]$info.LastTaskResult) $newLog
    # Corps en UTF-8 explicite : PowerShell 5.1 abîmerait les accents des logs.
    $bytes = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
    [void](Invoke-RestMethod -Method Post -Uri "$($config.url)/ping/$($t.pingKey)" -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 15)

    # État mis à jour seulement après un ping réussi : sinon on réessaie au prochain passage.
    $state.runs[$t.task] = $run
    if ($null -ne $newOffset) { $state.offsets[$t.log] = $newOffset }
    Write-ObserverLog "$($t.task) -> $($body.status)"
  } catch {
    Write-ObserverLog "$($t.task) ERREUR $($_.Exception.Message)"
  }
}

$state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
