$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Check { if ($LASTEXITCODE -ne 0) { throw 'Setup command failed. See output above.' } }
if (!(Test-Path vendor/ml-sharp/pyproject.toml)) {
    git clone https://github.com/apple-aiml-research/ml-sharp.git vendor/ml-sharp
    Check
    git -C vendor/ml-sharp checkout aed6527499ef91cba3b54c18d49a870f25947190
    Check
}
if (!(Test-Path .venv/Scripts/python.exe)) { uv --cache-dir .cache/uv venv --python 3.12 .venv; Check }
uv --cache-dir .cache/uv pip install --python .venv/Scripts/python.exe torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
Check
uv --cache-dir .cache/uv pip install --python .venv/Scripts/python.exe -r requirements.txt -c constraints.txt -e vendor/ml-sharp
Check
npm ci --no-audit --no-fund
Check
& ./.venv/Scripts/python.exe -c "import torch; from sharp.cli.predict import predict_image; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"
Check
Write-Host 'Ready. Run ./scripts/start.ps1 and open http://127.0.0.1:8000'
