import * as THREE from 'three';

// Instanced screen-space ribbons: WebGL native line width is usually fixed at one pixel.
export function sketchRibbons(data,uniforms){
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));
  geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=data.edges;
  for(const [name,source,size,offset] of [['start',data.vertices,3,0],['end',data.vertices,3,3],['strokeColor',data.captureColors,3,0],['endColor',data.captureColors,3,3],['strokeNormal',data.surfaceNormals,3,0],['strokeWeight',data.weights,1,0],['strokeWidth',data.widths,1,0],['strokeOrder',data.orders,1,0]]){
    const out=new Float32Array(data.edges*size);
    for(let i=0;i<data.edges;i++)for(let k=0;k<size;k++)out[i*size+k]=source[i*size*2+offset+k];
    geometry.setAttribute(name,new THREE.InstancedBufferAttribute(out,size));
  }
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`attribute vec3 start,end,strokeColor,endColor,strokeNormal;
      attribute float strokeWeight,strokeWidth,strokeOrder;
      uniform vec2 uResolution;uniform float uStrokeWidth,uExtension;
      varying float vAcross,vWeight,vOrder,vValid;varying vec3 vColor;
      void main(){
        vec3 extension=(end-start)*uExtension*.5;
        vec4 a=modelViewMatrix*vec4(start-extension,1.),b=modelViewMatrix*vec4(end+extension,1.);
        vValid=(a.z<-.005&&b.z<-.005)?1.:0.;
        vec4 ca=projectionMatrix*a,cb=projectionMatrix*b;
        vec2 delta=(cb.xy/max(cb.w,.0001)-ca.xy/max(ca.w,.0001))*uResolution;
        vec2 tangent=normalize(delta+vec2(.00001));vec2 perpendicular=vec2(-tangent.y,tangent.x);
        vec4 clip=mix(ca,cb,position.x);
        clip.xy+=perpendicular*position.y*strokeWidth*uStrokeWidth/uResolution*clip.w;
        gl_Position=clip;vAcross=position.y;vColor=mix(strokeColor,endColor,position.x);
        float facing=abs(dot(normalize(normalMatrix*strokeNormal+vec3(.00001)),normalize(-a.xyz)));
        vWeight=strokeWeight*(.65+.7*(1.-facing));vOrder=strokeOrder;
      }`,
    fragmentShader:`uniform vec3 uInk;uniform float uOpacity,uReveal,uLineColor;
      varying float vAcross,vWeight,vOrder,vValid;varying vec3 vColor;
      void main(){if(vValid<.5||vOrder>uReveal)discard;
        float coverage=1.-smoothstep(.45,1.,abs(vAcross));
        gl_FragColor=vec4(mix(uInk,vColor,uLineColor),uOpacity*vWeight*coverage);
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;return mesh;
}
