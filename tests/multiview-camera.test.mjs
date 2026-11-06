import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeScene,captureTransform,viewMatrix} from '../web/multiview-camera.mjs';
import {projectionFromIntrinsics} from '../web/projection.mjs';

const rows=m=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>m.elements[j*4+i]));
const first=rows(new THREE.Matrix4().makeRotationY(.23).setPosition(.1,.2,.3));
const second=rows(new THREE.Matrix4().makeRotationY(-.4).setPosition(-1,.3,.4));
const normalizer=normalizeScene({depth:4,world_to_camera:first});
for(const pose of [first,second]){
 const meta={width:800,height:600,intrinsics:[[650,0,380],[0,680,310],[0,0,1]],world_to_camera:pose};
 const capture=captureTransform(normalizer,meta);
 // Remove uniform scene scale, as a Three camera has unit scale.
 const camera=new THREE.PerspectiveCamera();camera.position.setFromMatrixPosition(capture);
 camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(capture));
 camera.projectionMatrix.fromArray(projectionFromIntrinsics(meta));camera.updateMatrixWorld(true);
 const cvPoint=new THREE.Vector3(.4,-.2,3);
 const world=cvPoint.clone().applyMatrix4(viewMatrix(pose).invert()).applyMatrix4(normalizer);
 const screen=world.project(camera);
 assert.ok(Math.abs((screen.x+1)*400-(650*.4/3+380))<1e-8);
 assert.ok(Math.abs((1-screen.y)*300-(680*-.2/3+310))<1e-8);
}
assert.ok(new THREE.Vector3().setFromMatrixPosition(captureTransform(normalizer,{world_to_camera:first})).length()<1e-8);
console.log('Multi-view camera transforms preserve source pixel projections and first-camera origin');
