// Canny-style thinning, hysteresis, connected tracing and polyline simplification.
export function traceContours(rgba,w,h,{threshold=.075,minLength=18,detail=1,geometry=null}={}){
  const n=w*h,gray=new Float32Array(n),blur=new Float32Array(n),temp=new Float32Array(n);
  for(let i=0;i<n;i++)gray[i]=(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])/255;
  for(let y=0;y<h;y++)for(let x=2;x<w-2;x++){const i=y*w+x;temp[i]=(gray[i-2]+4*gray[i-1]+6*gray[i]+4*gray[i+1]+gray[i+2])/16;}
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;blur[i]=(temp[i-2*w]+4*temp[i-w]+6*temp[i]+4*temp[i+w]+temp[i+2*w])/16;}
  const strength=new Float32Array(n),direction=new Uint8Array(n);
  for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){
    const i=y*w+x;if(geometry&&!geometry[i])continue;const gx=(blur[i+1-w]+2*blur[i+1]+blur[i+1+w]-blur[i-1-w]-2*blur[i-1]-blur[i-1+w])/4;
    const gy=(blur[i+w-1]+2*blur[i+w]+blur[i+w+1]-blur[i-w-1]-2*blur[i-w]-blur[i-w+1])/4;
    let boost=1;
    if(geometry){const a=geometry[i-2],b=geometry[i+2],c=geometry[i-2*w],d=geometry[i+2*w];if(a&&b&&c&&d)boost+=Math.min(1,(Math.abs(a-b)+Math.abs(c-d))*12);}
    strength[i]=Math.hypot(gx,gy)*boost;direction[i]=((Math.round(Math.atan2(gy,gx)*4/Math.PI)+4)%4);
  }
  const weak=new Uint8Array(n),edges=new Uint8Array(n),queue=[];
  const offsets=[1,w+1,w,w-1];
  for(let i=3*w;i<n-3*w;i++){const s=strength[i],off=offsets[direction[i]];if(s<threshold*.4||s<strength[i-off]||s<strength[i+off])continue;weak[i]=1;if(s>=threshold){edges[i]=1;queue.push(i);}}
  const around=[-w-1,-w,-w+1,-1,1,w-1,w,w+1];
  for(let k=0;k<queue.length;k++)for(const off of around){const j=queue[k]+off;if(weak[j]&&!edges[j]){edges[j]=1;queue.push(j);}}
  const visited=new Uint8Array(n),paths=[];
  const neighbors=i=>around.map(o=>i+o).filter(j=>edges[j]&&!visited[j]);
  function walk(start){const path=[];let at=start,previous=-1;
    while(at>=0){visited[at]=1;path.push([at%w,Math.floor(at/w)]);const next=neighbors(at);if(!next.length)break;
      if(previous>=0){const dx=at%w-previous%w,dy=Math.floor(at/w)-Math.floor(previous/w);next.sort((a,b)=>((b%w-at%w)*dx+(Math.floor(b/w)-Math.floor(at/w))*dy)-((a%w-at%w)*dx+(Math.floor(a/w)-Math.floor(at/w))*dy));}
      previous=at;at=next[0];
    }
    if(path.length>=minLength)paths.push({points:simplify(path,detail),strength:Math.min(1,strength[start]/threshold),length:path.length});
  }
  for(let i=0;i<n;i++)if(edges[i]&&!visited[i]&&neighbors(i).length===1)walk(i);
  for(let i=0;i<n;i++)if(edges[i]&&!visited[i])walk(i);
  return paths.sort((a,b)=>b.length-a.length).slice(0,3500);
}

function simplify(points,epsilon){
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  while(stack.length){const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;let best=epsilon*epsilon,index=-1;
    for(let i=a+1;i<b;i++){const r=points[i],t=den?Math.max(0,Math.min(1,((r[0]-p[0])*dx+(r[1]-p[1])*dy)/den)):0;const d=(r[0]-p[0]-t*dx)**2+(r[1]-p[1]-t*dy)**2;if(d>best){best=d;index=i;}}
    if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
