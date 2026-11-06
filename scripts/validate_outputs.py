"""Validate model exports for one comparison without loading neural networks."""
import argparse
import json
from pathlib import Path
import numpy as np
from plyfile import PlyData

parser=argparse.ArgumentParser()
parser.add_argument('comparison')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'data/jobs'
found=[]
for path in root.glob('*/job.json'):
    job=json.loads(path.read_text())
    if job.get('comparison')!=args.comparison:continue
    assert job['status']=='complete', f"{job.get('model')}: {job['status']}"
    vertex=PlyData.read(str(path.parent/'scene.ply'))['vertex'].data
    required={'x','y','z','f_dc_0','f_dc_1','f_dc_2','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3','opacity'}
    assert required.issubset(vertex.dtype.names)
    assert len(vertex)==job['scene']['count']
    for name in required:assert np.isfinite(vertex[name]).all(), f"Non-finite {name} in {job['model']}"
    assert np.isfinite(np.asarray(job['scene']['intrinsics'])).all()
    if job.get('mode') == 'multiview':
        cameras = json.loads((path.parent/'cameras.json').read_text())['cameras']
        assert len(cameras) == len(job['views']) == job['scene']['view_count']
        centers = []
        for camera, source in zip(cameras, job['views']):
            assert camera['file'] == source['file']
            k = np.asarray(camera['intrinsics'])
            view = np.asarray(camera['world_to_camera'])
            assert k.shape == (3,3) and view.shape == (4,4)
            assert np.isfinite(k).all() and np.isfinite(view).all()
            assert k[0,0] > 0 and k[1,1] > 0
            assert np.allclose(view[3], [0,0,0,1])
            assert np.allclose(view[:3,:3] @ view[:3,:3].T, np.eye(3), atol=1e-4)
            assert np.isclose(np.linalg.det(view[:3,:3]), 1, atol=1e-4)
            centers.append(np.linalg.inv(view)[:3,3])
        print('Multi-view camera center spread (model units):', np.ptp(centers,axis=0).tolist())
    found.append({'model':job['model'],'splats':len(vertex),'seconds':job['seconds'],
                  'peak_GiB':job['scene']['peak_vram_gb'],'bytes':(path.parent/'scene.ply').stat().st_size})
assert found,'No matching comparison'
print(json.dumps(found,indent=2))
