import numpy as np
import math

def describe(positions, width, height, intrinsics):
    points = np.asarray(positions).reshape(-1, 3)
    points = points[np.isfinite(points).all(axis=1) & (points[:, 2] > 1e-5)]
    k = np.asarray(intrinsics)
    # Orbit about the central architecture, rather than the sky/background median.
    if len(points):
        uv = points[:, :2] / points[:, 2:3] * [k[0, 0], k[1, 1]] + [k[0, 2], k[1, 2]]
        center = (abs(uv[:, 0] - width/2) < width*.22) & (abs(uv[:, 1] - height/2) < height*.22)
        depths = points[center, 2] if center.sum() > 100 else points[:, 2]
        depth = float(np.median(depths))
    else:
        raise ValueError('Model produced no finite forward-facing geometry')
    return {'count': len(positions.reshape(-1, 3)), 'depth': depth,
            'width': int(width), 'height': int(height), 'intrinsics': k.tolist(),
            'fov': math.degrees(2*math.atan(height/(2*k[1, 1]))),
            'coordinates': 'OpenCV: x right, y down, z forward'}
