import assert from 'node:assert/strict';
import {projectionFromIntrinsics,fitFrame} from '../web/projection.mjs';
// A known camera-space point must project to the original photo's pixel.
const meta={width:1448,height:1086,intrinsics:[[1100,0,700],[0,1000,530],[0,0,1]]};
const p=projectionFromIntrinsics(meta);
for(const [u,v] of [[0,0],[700,530],[1448,1086],[200,800]]){
 const z=10,x=(u-700)/1100*z,y=-(v-530)/1000*z;
 const nx=(p[0]*x+p[8]*-z)/z,ny=(p[5]*y+p[9]*-z)/z;
 assert.ok(Math.abs(nx-(u/meta.width*2-1))<1e-10);
 assert.ok(Math.abs(ny-(1-v/meta.height*2))<1e-10);
}
for(const [w,h] of [[300,600],[1000,300],[1448,1086]]){
 const f=fitFrame(w,h,1448,1086);
 assert.ok(Math.abs(f.width/f.height-1448/1086)<1e-10);
 assert.ok(f.x>=0&&f.y>=0&&f.width<=w&&f.height<=h);
}
console.log('Camera projection and source-aspect framing checks passed');
