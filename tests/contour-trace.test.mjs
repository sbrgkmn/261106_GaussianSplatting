import assert from 'node:assert/strict';
import {traceContours} from '../web/contour-trace.mjs';
const w=96,h=96,p=new Uint8Array(w*h*4).fill(255);
assert.equal(traceContours(p,w,h).length,0);
for(let y=24;y<72;y++)for(let x=24;x<72;x++){const i=(y*w+x)*4;p[i]=p[i+1]=p[i+2]=30;}
const paths=traceContours(p,w,h,{threshold:.08,minLength:12});
assert.ok(paths.length>0);assert.ok(paths.some(p=>p.length>30));
for(const path of paths){assert.ok(path.points.length<path.length);for(const [x,y] of path.points){assert.ok(x>15&&x<80&&y>15&&y<80);}}
assert.deepEqual(paths,traceContours(p,w,h,{threshold:.08,minLength:12}));
assert.equal(traceContours(p,w,h,{threshold:2}).length,0);
console.log('Contour tests: blank images, connected boundaries, simplification, determinism and threshold suppression passed.');

assert.equal(traceContours(p,w,h,{geometry:new Float32Array(w*h)}).length,0);
