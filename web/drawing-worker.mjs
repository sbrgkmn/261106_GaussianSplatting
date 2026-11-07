import {buildGraph} from './drawing-graph.mjs';
self.onmessage=({data})=>{
  try {
    const result=buildGraph(data.positions,data.options);
    const lookup=new Map();
    for(let i=0;i<data.positions.length;i+=3)lookup.set(`${data.positions[i]},${data.positions[i+1]},${data.positions[i+2]}`,i);
    result.captureColors=new Float32Array(result.vertices.length);
    result.surfaceNormals=new Float32Array(result.vertices.length);
    result.weights=new Float32Array(result.orders.length).fill(1);
    result.widths=new Float32Array(result.orders.length).fill(1);
    for(let i=0;i<result.vertices.length;i+=3){
      const j=lookup.get(`${result.vertices[i]},${result.vertices[i+1]},${result.vertices[i+2]}`);
      if(j!==undefined){result.captureColors.set(data.colors.subarray(j,j+3),i);result.surfaceNormals.set(data.normals.subarray(j,j+3),i);}
    }
    self.postMessage({id:data.id,...result},Object.values(result).filter(v=>ArrayBuffer.isView(v)).map(v=>v.buffer));
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
