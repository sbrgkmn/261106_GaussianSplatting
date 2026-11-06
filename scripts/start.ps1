param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:TORCH_HOME = Join-Path (Get-Location) 'data/models'
& ./.venv/Scripts/python.exe -m uvicorn app.server:app --host 127.0.0.1 --port $Port
