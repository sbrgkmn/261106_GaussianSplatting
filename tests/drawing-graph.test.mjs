import assert from 'node:assert/strict';
import {buildGraph} from '../web/drawing-graph.mjs';
const p=new Float32Array([0,0,0,.02,0,0,.04,0,0,1,0,0,1.02,0,0,NaN,0,0]);
const g=buildGraph(p,{cell:.01,neighbors:2,maxLength:.05});
assert.equal(g.nodes,5);assert.equal(g.edges,4);
const seen=new Set();
for(let i=0;i<g.vertices.length;i+=6){const a=Array.from(g.vertices.slice(i,i+3)),b=Array.from(g.vertices.slice(i+3,i+6));assert.ok(Math.hypot(...a.map((v,k)=>v-b[k]))<=.050001);const key=[a.join(','),b.join(',')].sort().join(':');assert.ok(!seen.has(key));seen.add(key);}
assert.deepEqual(buildGraph(p,{cell:.01,neighbors:2,maxLength:.05}),g);
const grid=new Float32Array(Array.from({length:3000},(_,i)=>Math.sin(i)*.5));
assert.ok(buildGraph(grid,{maxNodes:30}).nodes<=30);
const empty=buildGraph(new Float32Array());assert.equal(empty.edges,0);
console.log('Drawing graph: finite geometry, unique bounded edges, deterministic output, node budget passed.');
