$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Check { if ($LASTEXITCODE -ne 0) { throw 'Setup command failed.' } }
if (!(Test-Path vendor/InfiniSplat)) {
    git clone https://github.com/zju3dv/InfiniSplat.git vendor/InfiniSplat
    Check
    git -C vendor/InfiniSplat checkout 694ec543d8a99d76cbc421bc6ba2aa071a8ef210
    Check
}
if (!(Test-Path vendor/ZipSplat)) {
    git clone https://github.com/cvg/ZipSplat.git vendor/ZipSplat
    Check
    git -C vendor/ZipSplat checkout 73ab63f048fcc15ee54ada4ef9cdd79b925611a8
    Check
}
if (!(Test-Path .venv-models/Scripts/python.exe)) {
    uv --cache-dir .cache/uv venv --python 3.12 .venv-models
    Check
}
uv --cache-dir .cache/uv pip install --python .venv-models/Scripts/python.exe torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
Check
uv --cache-dir .cache/uv pip install --python .venv-models/Scripts/python.exe -r requirements-models.txt -c constraints-models.txt --extra-index-url https://download.pytorch.org/whl/cu124
Check
# Triton is optional in the code but mandatory in upstream packaging. Windows uses
# its torch fallback and ba=False; do not install Linux-only Triton or replace torch.
uv --cache-dir .cache/uv pip install --python .venv-models/Scripts/python.exe --no-deps -e vendor/ZipSplat
Check
New-Item -ItemType Directory -Force data/models/infinisplat,data/models/hub/zipsplat | Out-Null
$downloads=@(
    @('https://huggingface.co/PLUS-WAVE/InfiniSplat/resolve/main/checkpoints/infinisplat_rgb.ckpt','data/models/infinisplat/infinisplat_rgb.ckpt'),
    @('https://huggingface.co/veichta/zipsplat/resolve/main/zipsplat-da3g-504.tar','data/models/hub/zipsplat/zipsplat-da3g-504.tar')
)
foreach ($item in $downloads) {
    if (!(Test-Path $item[1])) {
        Invoke-WebRequest -Uri $item[0] -OutFile ($item[1]+'.part')
        Move-Item -LiteralPath ($item[1]+'.part') -Destination $item[1]
    }
}
& ./.venv-models/Scripts/python.exe -c "import torch,zipsplat; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"
Check
Write-Host 'Alternative models installed. Restart the studio to use the comparison interface.'
