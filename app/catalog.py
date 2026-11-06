"""Backend metadata shared by API and setup; inference stays in isolated processes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = {
    'sharp': {'name': 'SHARP', 'description': 'Detailed single-photo splats; nearby viewpoints.',
              'license': 'Non-commercial scientific research', 'environment': '.venv'},
    'infinisplat': {'name': 'InfiniSplat RGB', 'description': 'Single-image model targeting larger viewpoint changes; filtered floaters.',
                   'license': 'Personal/evaluation use; organizational projects require registration', 'environment': '.venv-models'},
    'zipsplat': {'name': 'ZipSplat 504', 'description': 'Predicts camera and splats. Feed-forward mode; refinement disabled on this Windows setup.',
                 'license': 'See upstream code and checkpoint terms', 'environment': '.venv-models'},
}

def python_for(model):
    env = ROOT / MODELS[model]['environment']
    return env / ('Scripts/python.exe' if __import__('os').name == 'nt' else 'bin/python')

def available(model):
    source = {'sharp':'ml-sharp', 'infinisplat':'InfiniSplat', 'zipsplat':'ZipSplat'}[model]
    return python_for(model).exists() and (ROOT / 'vendor' / source).is_dir()
