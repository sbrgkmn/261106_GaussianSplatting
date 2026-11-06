// Column-major OpenGL projection preserving fx, fy and principal point.
export function projectionFromIntrinsics(meta, near=.001, far=1000){
 const {width:w,height:h}=meta;
 const focal=h/(2*Math.tan(meta.fov*Math.PI/360));
 const k=meta.intrinsics||[[focal,0,w/2],[0,focal,h/2],[0,0,1]];
 return [2*k[0][0]/w,0,0,0,0,2*k[1][1]/h,0,0,
 1-2*k[0][2]/w,2*k[1][2]/h-1,-(far+near)/(far-near),-1,
 0,0,-2*far*near/(far-near),0];
}
export function fitFrame(w,h,sourceW,sourceH){const scale=Math.min(w/sourceW,h/sourceH);const width=sourceW*scale,height=sourceH*scale;return{x:(w-width)/2,y:(h-height)/2,width,height};}
