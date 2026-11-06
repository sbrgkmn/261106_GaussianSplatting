"""Resume a partial official checkpoint using validated HTTP byte ranges."""
import concurrent.futures
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'data/models/hub/zipsplat/zipsplat-da3g-504.tar'
URL='https://huggingface.co/veichta/zipsplat/resolve/main/zipsplat-da3g-504.tar'
TOTAL=6002349727
CHUNK=64*1024*1024

def main():
    partial=TARGET.with_suffix('.tar.part')
    if TARGET.exists():
        if TARGET.stat().st_size==TOTAL:
            print('Already complete');return
        if partial.exists():
            raise RuntimeError('Both final and partial files exist; inspect before resuming')
        TARGET.replace(partial)
    offset=partial.stat().st_size if partial.exists() else 0
    if offset>TOTAL:
        raise RuntimeError('Unexpected checkpoint length')
    chunks=ROOT/'data/download-parts'
    chunks.mkdir(exist_ok=True)
    def fetch(start):
        end=min(start+CHUNK,TOTAL)-1
        dest=chunks/f'{start}.part'
        if dest.exists() and dest.stat().st_size==end-start+1:
            return dest
        for attempt in range(3):
            try:
                req=urllib.request.Request(URL,headers={'Range':f'bytes={start}-{end}'})
                with urllib.request.urlopen(req,timeout=120) as response,dest.open('wb') as out:
                    if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{end}/{TOTAL}':
                        raise RuntimeError('Server returned unexpected byte range')
                    while data:=response.read(1024*1024):out.write(data)
                if dest.stat().st_size!=end-start+1:raise RuntimeError('Truncated range')
                print(f'Fetched {end+1}/{TOTAL}',flush=True)
                return dest
            except Exception:
                if attempt==2:raise
    starts=list(range(offset,TOTAL,CHUNK))
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        parts=list(pool.map(fetch,starts))
    with partial.open('ab') as out:
        for part in parts:
            with part.open('rb') as source:
                while data:=source.read(8*1024*1024):out.write(data)
    if partial.stat().st_size!=TOTAL:raise RuntimeError('Final checkpoint size mismatch')
    partial.replace(TARGET)
    # Only remove the exact temporary range files created by this invocation.
    for part in parts:part.unlink()
    print('Checkpoint complete',flush=True)

if __name__=='__main__':main()
