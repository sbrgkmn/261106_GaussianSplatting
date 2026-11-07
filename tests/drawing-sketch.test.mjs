import {buildSketch} from '../web/drawing-sketch.mjs';
import assert from 'node:assert/strict';
const p=new Float32Array([0,0,0,.03,0,0,.06,0,0]);
const t=new Float32Array([1,0,0,1,0,0,1,0,0]),n=new Float32Array([0,1,0,0,1,0,0,1,0]),c=new Float32Array(9).fill(.4);
const g=buildSketch(p,t,n,c,{passes:3,roughness:0,length:.04,connections:0});
assert.equal(g.edges,27);assert.equal(g.captureColors.length,g.vertices.length);assert.ok(g.captureColors.every(v=>Math.abs(v-.4)<1e-6));assert.ok(g.vertices.every(Number.isFinite));
for(let i=0;i<g.vertices.length;i+=6){assert.equal(g.vertices[i+1],0);assert.equal(g.vertices[i+4],0);assert.equal(g.vertices[i+2],0);assert.equal(g.vertices[i+5],0);}
assert.deepEqual(buildSketch(p,t,n,c,{passes:3,roughness:0,length:.04,connections:0}),g);
assert.equal(buildSketch(new Float32Array(),t,n,c).edges,0);
console.log('Sketch strokes follow surface tangent, retain plane, overlap deterministically and handle empty input.');

const short=buildSketch(p,t,n,c,{connections:0,extension:0});
const extended=buildSketch(p,t,n,c,{connections:0,extension:1});
assert.ok(Math.max(...extended.vertices)>Math.max(...short.vertices));
const connected=buildSketch(p,t,n,c,{connections:2});
assert.ok(connected.connectionEdges>0);assert.ok(connected.edges>short.edges);
assert.ok(new Set(connected.widths).size>3);assert.equal(connected.widths.length,connected.orders.length);
const isolated=buildSketch(new Float32Array([0,0,0,10,0,0]),t,n,c,{connections:2});
assert.equal(isolated.connectionEdges,0);
console.log('Extensions, variable widths, local connections and separation checks passed.');
