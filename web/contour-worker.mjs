import {traceContours} from './contour-trace.mjs';
import {architecturalLines} from './architectural-lines.mjs';
self.onmessage=({data:d})=>{
  const began=performance.now();
  try{
    const {w,h,pixels,positions,matrix,threshold,minLength,id}=d,rgba=new Uint8Array(pixels.length),depth=new Float32Array(w*h);
    for(let y=0;y<h;y++)rgba.set(pixels.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);
    for(let i=0;i<positions.length;i+=3){const x=positions[i],y=positions[i+1],z=positions[i+2],m=matrix;
      const cw=m[3]*x+m[7]*y+m[11]*z+m[15];if(cw<=0)continue;
      const nx=(m[0]*x+m[4]*y+m[8]*z+m[12])/cw,ny=(m[1]*x+m[5]*y+m[9]*z+m[13])/cw,nz=(m[2]*x+m[6]*y+m[10]*z+m[14])/cw;
      if(nz< -1||nz>1)continue;const px=Math.round((nx+1)*w/2),py=Math.round((1-ny)*h/2);
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){if(px+dx<0||px+dx>=w||py+dy<0||py+dy>=h)continue;const j=(py+dy)*w+px+dx;if(!depth[j]||cw<depth[j])depth[j]=cw;}
    }
    const contours=traceContours(rgba,w,h,{threshold,minLength,geometry:depth,detail:2.5});
    const runs=architecturalLines(contours,{minSpan:12,gap:10,tolerance:1.6});
    const outlines=contours.filter(p=>p.length>=65&&p.points.length>=3).slice(0,180).map(p=>({...p,importance:1}));
    const paths=[...outlines,...runs.map(p=>({...p,importance:p.length>30?.8:.4}))];
    // Sparse tonal hatching keeps shaded masses legible without tracing every texture boundary.
    const hatchCandidates=[];
    for(let y=5;y<h-5;y+=6)for(let x=5;x<w-5;x+=6){const i=y*w+x;if(!depth[i])continue;
      let tone=0;for(const off of [0,1,-1,w,-w]){const j=(i+off)*4;tone+=(.2126*rgba[j]+.7152*rgba[j+1]+.0722*rgba[j+2])/255;}
      tone/=5;if(tone>.6)continue;const span=2+(1-tone)*5;
      hatchCandidates.push({points:[[x-span*.5,y+span*.5],[x+span*.5,y-span*.5]],length:span,importance:.13+(1-tone)*.15,hatch:true});
    }
    const take=Math.min(2500,hatchCandidates.length);for(let i=0;i<take;i++)paths.push(hatchCandidates[Math.floor(i*hatchCandidates.length/take)]);
    self.postMessage({id,w,h,paths,ms:Math.round(performance.now()-began)});
  }catch(e){self.postMessage({id:d.id,error:e.message});}
};
