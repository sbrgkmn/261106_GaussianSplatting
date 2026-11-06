"""Submit a local image folder to the running studio; preserves sorted filename order."""
import argparse
from pathlib import Path
import time
import httpx

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
parser.add_argument('--server', default='http://127.0.0.1:8000')
parser.add_argument('--wait', action='store_true')
args = parser.parse_args()
paths = sorted(p for p in args.folder.iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))
if not 2 <= len(paths) <= 16:
    parser.error('Folder must contain 2-16 images')
from contextlib import ExitStack
with httpx.Client(timeout=180) as client:
    with ExitStack() as stack:
        files = [('images', (p.name, stack.enter_context(p.open('rb')), 'application/octet-stream')) for p in paths]
        response = client.post(args.server + '/api/multiview/jobs', files=files)
    response.raise_for_status()
    job = response.json()
    print(job['id'], flush=True)
    if args.wait:
        previous = None
        while job['status'] in ('queued', 'running'):
            if job['status'] != previous:
                print(job['status'], flush=True)
                previous = job['status']
            time.sleep(3)
            response = client.get(args.server + '/api/jobs/' + job['id'])
            response.raise_for_status()
            job = response.json()
        print(job, flush=True)
        if job['status'] != 'complete':
            raise SystemExit(1)
