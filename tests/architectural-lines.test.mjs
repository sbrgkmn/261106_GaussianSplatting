import assert from 'node:assert/strict';
import {architecturalLines} from '../web/architectural-lines.mjs';
const paths=[{points:[[0,0],[20,0],[40,0]],strength:1},{points:[[43,1],[60,1]],strength:1},{points:[[100,0],[130,0]],strength:1},{points:[[5,5],[6,6],[7,5]],strength:1}];
const lines=architecturalLines(paths);
assert.equal(lines.length,2);assert.equal(lines[0].length,60);assert.equal(lines[1].length,30);
assert.deepEqual(lines,architecturalLines(paths));
assert.equal(architecturalLines([{points:[[0,0],[0,30]],strength:1}])[0].length,30);
console.log('Architectural strokes: collinear merge, limited gaps, fragment rejection, perspective direction and determinism passed.');
