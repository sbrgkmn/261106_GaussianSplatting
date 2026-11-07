"""Photos/video -> verified camera alignment -> trained splats -> Atelier library.

Uses the official portable Spirula CLI. Work is isolated in a new run folder.
No shell command interpolation; source files are never modified.
"""
import argparse
import json
import shutil
import struct
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / 'vendor/spirula/spirula.exe'

def run_command(command, log):
    print('Running:', subprocess.list2cmdline([str(s) for s in command]), flush=True)
    with log.open('w', encoding='utf-8') as stream:
        process = subprocess.run([str(s) for s in command], stdout=stream, stderr=subprocess.STDOUT, cwd=ROOT)
    if process.returncode:
        raise RuntimeError(f'Command exited {process.returncode}. Inspect {log}. Alignment failures are not silently trained.')

def registered_images(sparse):
    binary = sparse / 'images.bin'
    if binary.exists():
        with binary.open('rb') as f: return struct.unpack('<Q', f.read(8))[0]
    text = sparse / 'images.txt'
    if text.exists():
        lines = [s for s in text.read_text().splitlines() if not s.startswith('#')]
        return len(lines) // 2
    return 0

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Image folder or video file')
    parser.add_argument('--title', default='Architectural capture')
    parser.add_argument('--iterations', type=int, default=30000)
    parser.add_argument('--max-splats', type=int, default=1000000)
    parser.add_argument('--fps', type=float, default=1, help='Video sampling rate')
    parser.add_argument('--max-frames', type=int, default=250)
    parser.add_argument('--preset', choices=['3dgs', 'in-the-wild', 'meshing'], default='3dgs')
    parser.add_argument('--align-only', action='store_true')
    args = parser.parse_args()
    if not EXE.exists(): parser.error('Install the official Windows Spirula portable release in vendor/spirula first.')
    if not args.source.exists(): parser.error('Source does not exist')
    if not 1 <= args.iterations <= 100000 or not 10000 <= args.max_splats <= 10000000: parser.error('Invalid training budget')
    if not .1 <= args.fps <= 10 or not 3 <= args.max_frames <= 1000: parser.error('Invalid frame extraction limits')
    source = args.source.resolve()
    # Avoid competing with the server GPU queue; the CLI itself also uses one project lock.
    for state in (ROOT / 'data/jobs').glob('*/job.json'):
        if json.loads(state.read_text()).get('status') in ('running', 'queued'):
            parser.error('Wait for the existing GPU reconstruction queue to finish.')
    lock = ROOT / 'data/reconstruction.lock'
    try: lock.touch(exist_ok=False)
    except FileExistsError: parser.error('Another photogrammetry run owns data/reconstruction.lock. Check its process before removing a stale lock.')
    identity = 'capture-' + uuid.uuid4().hex[:12]
    work = ROOT / 'data/reconstructions' / identity
    work.mkdir(parents=True)
    state = {'id':identity,'title':args.title,'source':str(source),'status':'preparing','started':time.time()}
    def save(**fields): state.update(fields);(work/'status.json').write_text(json.dumps(state,indent=2))
    try:
        images=work/'images';images.mkdir()
        if source.is_dir():
            files=sorted(p for p in source.iterdir() if p.suffix.lower() in ('.jpg','.jpeg','.png','.webp'))
            if not 3 <= len(files) <= 1000: raise ValueError('Choose 3–1000 images; a coherent 50–250 photo capture is a practical starting point.')
            for i,p in enumerate(files):shutil.copy2(p,images/f'{i:05d}{p.suffix.lower()}')
        else:
            ffmpeg=shutil.which('ffmpeg')
            if not ffmpeg:raise ValueError('ffmpeg is required for video input')
            run_command([ffmpeg,'-nostdin','-i',source,'-vf',f'fps={args.fps}','-frames:v',args.max_frames,'-q:v','2',images/'%05d.jpg'],work/'frames.log')
        total=len(list(images.iterdir()));save(status='aligning',input_views=total)
        kind='internet' if args.preset=='in-the-wild' else 'individual' if source.is_dir() else 'video'
        run_command([EXE,'sfm','auto',images,'-o',work,'--quality','medium','--data-type',kind],work/'alignment.log')
        registered=registered_images(work/'sparse/0');save(registered_views=registered)
        if registered<3 or registered/total<.8:raise ValueError(f'Only {registered}/{total} images align in the largest component. Inspect alignment before training.')
        if args.align_only:save(status='aligned');print('Alignment ready:',work);return
        save(status='training')
        run_command([EXE,'train',args.preset,'--data',work,'--data-format','colmap','--colmap-recon-dir','sparse/0',
                     '--output-dir-prefix',work/'training','--output-dir-name','run','--num-iterations',args.iterations,
                     '--cap-max',args.max_splats,'--train-resolution-divisor','2','--save-eval-images','1',
                     '--disable-viewer','1','--keep-viewer-alive','0'],work/'training.log')
        from plyfile import PlyData
        candidates=[]
        for path in (work/'training').rglob('*.ply'):
            try:
                vertex=PlyData.read(path,mmap=True)['vertex']
                if {'opacity','scale_0','rot_0'}.issubset(vertex.data.dtype.names):candidates.append(path)
            except (ValueError,KeyError):continue
        if not candidates:raise ValueError('Trainer did not produce a Gaussian PLY. Inspect training.log.')
        ply=max(candidates,key=lambda p:p.stat().st_mtime)
        library=ROOT/'data/library'/identity;library.mkdir(parents=True)
        shutil.copy2(ply,library/'scene.ply')
        metadata={'title':args.title,'credit':'Local capture · aligned and trained with Spirula Studio','source':'/capture.html',
                  'input_views':total,'registered_views':registered,'iterations':args.iterations,'preset':args.preset,'work_directory':str(work)}
        (library/'manifest.json').write_text(json.dumps(metadata,indent=2))
        save(status='complete',library_id=identity,seconds=round(time.time()-state['started'],2))
        print('Ready in Atelier: http://127.0.0.1:8000/drawing.html',flush=True)
    except Exception as e:
        save(status='failed',error=str(e));raise
    finally:lock.unlink(missing_ok=True)

if __name__=='__main__':main()
