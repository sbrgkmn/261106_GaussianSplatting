import * as THREE from 'three';

export function viewMatrix(rows){return new THREE.Matrix4().set(...rows.flat());}
export function normalizeScene(meta){
 const scale=1/Math.max(meta.depth,.001);
 return new THREE.Matrix4().makeScale(scale,-scale,-scale).multiply(viewMatrix(meta.world_to_camera));
}
export function captureTransform(normalizer,capture){
 // Model world -> normalized viewer world, then OpenCV -> Three camera axes.
 return normalizer.clone().multiply(viewMatrix(capture.world_to_camera).invert())
  .multiply(new THREE.Matrix4().makeScale(1,-1,-1));
}
