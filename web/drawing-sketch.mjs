import {buildGraph} from './drawing-graph.mjs';
// Object-space strokes follow each Gaussian's principal tangent, with repeated pencil passes.
// Deterministic variation keeps the drawing stable while orbiting or scrubbing time.
export function buildSketch(positions, tangents, normals, colors, {cell=.012,passes=3,length=.045,roughness=.35,maxNodes=22000,extension=.6,connections=2,weightVariation=.7}={}) {
  const nodes=[],occupied=new Set();
  for(let i=0;i<positions.length;i+=3){const p=Array.from(positions.slice(i,i+3));if(!p.every(Number.isFinite))continue;const key=p.map(v=>Math.floor(v/cell)).join(',');if(!occupied.has(key)){occupied.add(key);nodes.push(i);}}
  if(nodes.length>maxNodes)return buildSketch(positions,tangents,normals,colors,{cell:cell*1.2,passes,length,roughness,maxNodes,extension,connections,weightVariation});
  const vertices=[],orders=[],weights=[],surfaceNormals=[],captureColors=[],widths=[];
  let low=Infinity,high=-Infinity;for(const i of nodes){low=Math.min(low,positions[i+1]);high=Math.max(high,positions[i+1]);}
  const rand=(i,k)=>{const x=Math.sin(i*12.9898+k*78.233)*43758.5453;return x-Math.floor(x);};
  const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  for(const i of nodes){
    const p=Array.from(positions.slice(i,i+3)),t=unit(Array.from(tangents.slice(i,i+3))),n=unit(Array.from(normals.slice(i,i+3))),b=unit(cross(n,t));
    const luminance=.2126*colors[i]+.7152*colors[i+1]+.0722*colors[i+2];
    const order=(p[1]-low)/(high-low||1);
    for(let pass=0;pass<Math.max(1,Math.min(6,passes));pass++){
      const angle=pass===0?0:(rand(i,pass)-.5)*roughness*1.8;
      const dir=t.map((v,k)=>v*Math.cos(angle)+b[k]*Math.sin(angle));
      const len=length*(.3+.7*rand(i,pass+10))*(1+extension*2);
      const offset=(rand(i,pass+30)-.5)*cell*roughness;
      const path=[];
      for(let s=0;s<4;s++){const u=s/3-.5,jitter=(rand(i+s,pass+50)-.5)*cell*roughness*.35;path.push(p.map((v,k)=>v+dir[k]*u*len+b[k]*(offset+jitter)));}
      for(let s=0;s<3;s++){vertices.push(...path[s],...path[s+1]);orders.push(order,order);const w=(.25+.65*(1-luminance))*(pass===0?1:.65);weights.push(w,w);surfaceNormals.push(...n,...n);captureColors.push(...colors.slice(i,i+3),...colors.slice(i,i+3));const width=.8*(1-weightVariation)+(.3+Math.pow(rand(i,pass+70),2)*2.3)*weightVariation;const taper=s===1?1:.6;widths.push(width*taper,width*taper);}
    }
  }
  // A sparse proximity scaffold adds longer searching/construction lines across the scan.
  // Restrict connections to short distances; never connect separated scene components.
  let connectionEdges=0;
  if(connections>0){
    const scaffold=buildGraph(positions,{cell:cell*2,neighbors:connections,maxLength:Math.max(cell*3,length*1.5),maxNodes:6500});
    // Attribute lookup uses a small spatial hash because scaffold sampling differs from stroke sampling.
    const lookup=new Map();for(let i=0;i<positions.length;i+=3)lookup.set(Array.from(positions.slice(i,i+3)).join(','),i);
    for(let e=0;e<scaffold.vertices.length;e+=6){
      const a=Array.from(scaffold.vertices.slice(e,e+3)),z=Array.from(scaffold.vertices.slice(e+3,e+6));
      const ia=lookup.get(a.join(','))??0,ib=lookup.get(z.join(','))??ia;
      const d=z.map((v,k)=>v-a[k]);
      for(let pass=0;pass<2;pass++){
        const extra=extension*(.25+.6*rand(e,pass+90));
        const jitter=cell*roughness*(pass? .45:.1);
        const start=a.map((v,k)=>v-d[k]*extra+(rand(e+k,pass+99)-.5)*jitter);
        const end=z.map((v,k)=>v+d[k]*extra+(rand(e+k,pass+109)-.5)*jitter);
        vertices.push(...start,...end);orders.push(scaffold.orders[e/3],scaffold.orders[e/3+1]);
        const opacity=(pass?.18:.38)*(.7+.3*rand(e,5));weights.push(opacity,opacity);
        const width=(pass?.35:.7)*(1+weightVariation*rand(e,8));widths.push(width,width);
        surfaceNormals.push(...normals.slice(ia,ia+3),...normals.slice(ib,ib+3));
        captureColors.push(...colors.slice(ia,ia+3),...colors.slice(ib,ib+3));connectionEdges++;
      }
    }
  }
  return {vertices:new Float32Array(vertices),orders:new Float32Array(orders),weights:new Float32Array(weights),surfaceNormals:new Float32Array(surfaceNormals),captureColors:new Float32Array(captureColors),widths:new Float32Array(widths),connectionEdges,nodes:nodes.length,edges:vertices.length/6,cell};
}
