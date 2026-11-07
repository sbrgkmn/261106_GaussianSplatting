import * as THREE from 'three';


export class ContourDrawing{
  constructor(viewport){
    this.canvas=document.createElement('canvas');this.canvas.className='contour-overlay';viewport.append(this.canvas);
    this.paths=[];this.dirty=0;this.active=false;this.width=1;this.height=1;this.busy=false;this.version=0;this.paintKey='';
    this.worker=new Worker('/contour-worker.mjs',{type:'module'});
    this.worker.onmessage=({data})=>{this.busy=false;if(data.id!==this.version)return;if(data.error){this.dirty=0;this.onResult?.(data.error);return;}this.paths=data.paths;this.width=data.w;this.height=data.h;this.dirty=0;this.paintKey='';this.onResult?.(null,data.ms);};
    this.worker.onerror=()=>{this.busy=false;this.dirty=0;this.onResult?.('Drawing worker failed; reload to restart it.');};
  }
  invalidate(){this.dirty=performance.now();this.version++;}
  async capture(renderer,scene,camera,root,splat,points,lines,grid,sample,threshold,minLength){
    if(!splat||!sample||this.busy)return;this.busy=true;const id=this.version;
    const w=720,h=Math.max(160,Math.min(1000,Math.round(w/camera.aspect)));
    const target=new THREE.WebGLRenderTarget(w,h),pixels=new Uint8Array(w*h*4);
    const oldTarget=renderer.getRenderTarget(),clear=new THREE.Color();renderer.getClearColor(clear);const alpha=renderer.getClearAlpha();
    const objects=[points,lines,grid].filter(Boolean),visible=objects.map(o=>o.visible),opacity=splat.opacity,sv=splat.visible;
    root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(root.matrixWorld).toArray();
    let read;
    try{
      objects.forEach(o=>o.visible=false);splat.visible=true;splat.opacity=1;renderer.setClearColor(0xffffff,1);renderer.setRenderTarget(target);renderer.render(scene,camera);
      read=renderer.readRenderTargetPixelsAsync(target,0,0,w,h,pixels);
    }finally{renderer.setRenderTarget(oldTarget);renderer.setClearColor(clear,alpha);objects.forEach((o,i)=>o.visible=visible[i]);splat.opacity=opacity;splat.visible=sv;}
    try{await read;if(id!==this.version){this.busy=false;return;}this.worker.postMessage({id,w,h,pixels,positions:sample.positions,matrix,threshold,minLength},[pixels.buffer]);}
    catch(e){this.busy=false;this.dirty=0;this.onResult?.(e.message);}
    finally{target.dispose();}
  }
  draw({ink,paper,photo=0,opacity,width,reveal,echo,overshoot}){
    this.canvas.hidden=!this.active||!!this.dirty||this.busy;if(this.canvas.hidden)return;
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight,dpr=Math.min(devicePixelRatio,1.5);
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    const key=JSON.stringify([w,h,ink,paper,photo,opacity,width,reveal,echo,overshoot]);if(this.paintKey===key)return;this.paintKey=key;
    const ctx=this.canvas.getContext('2d');ctx.setTransform(dpr*w/this.width,0,0,dpr*h/this.height,0,0);ctx.clearRect(0,0,this.width,this.height);ctx.globalAlpha=1-photo;ctx.fillStyle=paper;ctx.fillRect(0,0,this.width,this.height);ctx.strokeStyle=ink;ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=0;i<this.paths.length*reveal;i++){const p=this.paths[i];for(let pass=0;pass<=(p.hatch?0:echo);pass++){
      ctx.globalAlpha=opacity*(p.importance||1)*(pass?.14:.85);ctx.lineWidth=width*(pass?.5:(p.length>65?1.5:.75));ctx.beginPath();
      const pts=extended(p.points,p.hatch?0:overshoot),offset=pass?Math.sin(i*1.73+pass)*1.15:0;
      pts.forEach((v,k)=>{const x=v[0]+offset,y=v[1]+offset*.6;k?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    }}
  }
  svg(ink,opacity,width,reveal,echo,overshoot){let out=`<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">`;
    for(let i=0;i<this.paths.length*reveal;i++){const p=this.paths[i];for(let pass=0;pass<=(p.hatch?0:echo);pass++){const o=pass?Math.sin(i*1.73+pass)*1.15:0;out+=`<path opacity="${opacity*(p.importance||1)*(pass?.14:.85)}" stroke-width="${width*(pass?.5:(p.length>65?1.5:.75))}" d="${extended(p.points,p.hatch?0:overshoot).map((v,k)=>(k?'L':'M')+(v[0]+o).toFixed(2)+','+(v[1]+o*.6).toFixed(2)).join(' ')}"/>`;}}return out+'</g>';
  }
}
function extended(points,amount){const p=points.map(v=>v.slice());if(p.length<2)return p;for(const [a,b] of [[0,1],[p.length-1,p.length-2]]){const dx=p[a][0]-p[b][0],dy=p[a][1]-p[b][1],n=Math.hypot(dx,dy)||1;p[a][0]+=dx/n*amount;p[a][1]+=dy/n*amount;}return p;}
