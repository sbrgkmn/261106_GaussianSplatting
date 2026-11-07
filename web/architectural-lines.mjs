// Retain straight runs and merge only nearby, aligned evidence. No Manhattan-axis snapping.
export function architecturalLines(paths,{minSpan=9,gap=9,tolerance=2}={}){
  const segments=[];
  for(const path of paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length>=minSpan)segments.push({points:[a.slice(),b.slice()],length,strength:path.strength});
  }
  segments.sort((a,b)=>b.length-a.length);const result=[];
  for(const s of segments){let merged=false;
    for(const r of result){const [a,b]=r.points,[c,d]=s.points,ux=(b[0]-a[0])/r.length,uy=(b[1]-a[1])/r.length;
      const vx=(d[0]-c[0])/s.length,vy=(d[1]-c[1])/s.length;
      if(Math.abs(ux*vx+uy*vy)<.99)continue;
      const distance=p=>Math.abs((p[0]-a[0])*uy-(p[1]-a[1])*ux);
      if(distance(c)>tolerance||distance(d)>tolerance)continue;
      const tc=(c[0]-a[0])*ux+(c[1]-a[1])*uy,td=(d[0]-a[0])*ux+(d[1]-a[1])*uy;
      if(Math.min(tc,td)>r.length+gap||Math.max(tc,td)<-gap)continue;
      const low=Math.min(0,tc,td),high=Math.max(r.length,tc,td);
      r.points=[[a[0]+ux*low,a[1]+uy*low],[a[0]+ux*high,a[1]+uy*high]];r.length=high-low;merged=true;break;
    }
    if(!merged)result.push(s);if(result.length>=1200)break;
  }
  return result.sort((a,b)=>b.length-a.length);
}
