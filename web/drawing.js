import * as THREE from 'three';
import {sketchRibbons} from './drawing-ribbons.mjs';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';

const $=id=>document.getElementById(id), status=t=>$('status').textContent=t;
const viewport=$('viewport'), renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));viewport.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.005,100);
scene.add(new SparkRenderer({renderer}));
const root=new THREE.Group();scene.add(root);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
controls.screenSpacePanning=false;controls.minPolarAngle=.03;controls.maxPolarAngle=Math.PI/2-.01;
const grid=new THREE.GridHelper(6,30,0x647d78,0xa5afa3);grid.material.transparent=true;grid.material.opacity=.35;scene.add(grid);grid.visible=false;
const modelCenter=new THREE.Vector3();
function syncAlignment(){ $('pitch').value=THREE.MathUtils.radToDeg(root.rotation.x);$('roll').value=THREE.MathUtils.radToDeg(root.rotation.z);$('pitch-o').textContent=Number($('pitch').value)+'°';$('roll-o').textContent=Number($('roll').value)+'°'; }
function groundModel(reframe=false){
  if(!sample)return;root.position.set(0,0,0);root.updateMatrixWorld(true);
  const ys=[],xs=[],zs=[],v=new THREE.Vector3();
  for(let i=0;i<sample.positions.length;i+=3){v.fromArray(sample.positions,i).applyMatrix4(root.matrixWorld);xs.push(v.x);ys.push(v.y);zs.push(v.z);}
  for(const a of [xs,ys,zs])a.sort((a,b)=>a-b);
  const q=(a,t)=>a[Math.floor((a.length-1)*t)];
  root.position.set(-(q(xs,.03)+q(xs,.97))/2,-q(ys,.03),-(q(zs,.03)+q(zs,.97))/2);
  modelCenter.set(0,(q(ys,.97)-q(ys,.03))/2,0);
  const delta=modelCenter.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(modelCenter);controls.update();
  if(reframe)home();
}
$('grid').onchange=()=>grid.visible=$('grid').checked;
for(const id of ['pitch','roll'])$(id).oninput=()=>{root.rotation[id==='pitch'?'x':'z']=THREE.MathUtils.degToRad(val(id));syncAlignment();groundModel();};
$('ground').onclick=()=>groundModel(true);
controls.autoRotateSpeed=.5;camera.position.set(0,.3,3.4);controls.update();
const ids=['photo','points','size','color','lines','spacing','neighbors','length','response','reveal','linecolor','extension','linewidth'];
const val=id=>Number($(id).value);
let drawingMode='graph';
let splat=null,points=null,lines=null,sample=null,graph=null,sceneName='',currentSource='',loadToken=0,buildToken=0;
let playing=false,last=performance.now(),elapsed=0,audioContext=null,analyser=null,audioURL=null,audioData=null;
const worker=new Worker('/drawing-worker.mjs',{type:'module'});
const uniforms={uInk:{value:new THREE.Color('#273b3c')},uColor:{value:.15},uOpacity:{value:.65},uReveal:{value:1},uSize:{value:1.1}};
const vertex=`attribute vec3 captureColor; attribute float order; varying vec3 vColor; varying float vOrder;
uniform float uSize; void main(){vColor=captureColor;vOrder=order;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=uSize;}`;
const fragment=`uniform vec3 uInk;uniform float uColor;uniform float uOpacity;uniform float uReveal;varying vec3 vColor;varying float vOrder;
void main(){float d=length(gl_PointCoord-vec2(.5))*2.;if(d>1.||vOrder>uReveal)discard;float a=(1.-smoothstep(.45,1.,d))*uOpacity;gl_FragColor=vec4(mix(uInk,vColor,uColor),a);}`;
const lineUniforms={uExtension:{value:0},uResolution:{value:new THREE.Vector2(1,1)},uStrokeWidth:{value:1.4},uLineColor:{value:0},uInk:uniforms.uInk,uOpacity:{value:.24},uReveal:uniforms.uReveal};
function updateControls(){
  for(const id of ids){const out=$(id+'-o');if(out)out.textContent=['photo','points','color','lines','response','reveal','linecolor'].includes(id)?Math.round(val(id)*100)+'%':val(id).toString();}
  lineUniforms.uExtension.value=val('extension');lineUniforms.uStrokeWidth.value=val('linewidth')*renderer.getPixelRatio();lineUniforms.uLineColor.value=val('linecolor');uniforms.uInk.value.set($('ink').value);uniforms.uColor.value=val('color');uniforms.uReveal.value=val('reveal');
  renderer.setClearColor($('paper').value);document.documentElement.style.setProperty('--paper',$('paper').value);
}
function home(){camera.up.set(0,1,0);camera.position.copy(modelCenter).add(new THREE.Vector3(0,.65,3.1/Math.min(1,camera.aspect)));controls.target.copy(modelCenter);controls.update();}
function disposeDrawing(){
  for(const object of [points,lines])if(object){root.remove(object);object.geometry.dispose();object.material.dispose();}
  points=null;lines=null;graph=null;
}
function clear(){disposeDrawing();if(splat){root.remove(splat);splat.dispose();splat=null;}sample=null;root.rotation.set(0,0,0);root.position.set(0,0,0);modelCenter.set(0,0,0);buildToken++;}
function sampleSplats(mesh,framing={}){
  const count=mesh.numSplats,step=Math.max(1,Math.ceil(count/180000)),raw=[],colors=[],directions=[],surfaceNormals=[];const axis=new THREE.Vector3();
  mesh.forEachSplat((i,p,scale,q,opacity,c)=>{
    if(i%step||opacity<.15||![p.x,p.y,p.z].every(Number.isFinite))return;
    raw.push(p.x,p.y,p.z);colors.push(c.r,c.g,c.b);
    const sizes=[scale.x,scale.y,scale.z],major=sizes.indexOf(Math.max(...sizes)),minor=sizes.indexOf(Math.min(...sizes));
    axis.set(major===0?1:0,major===1?1:0,major===2?1:0).applyQuaternion(q).normalize();directions.push(axis.x,axis.y,axis.z);
    axis.set(minor===0?1:0,minor===1?1:0,minor===2?1:0).applyQuaternion(q).normalize();surfaceNormals.push(axis.x,axis.y,axis.z);
  });
  if(raw.length<6)throw Error('This file contains too few visible, finite splats.');
  const axes=[0,1,2].map(a=>raw.filter((_,i)=>i%3===a).sort((a,b)=>a-b));
  const quantile=Math.max(.01,Math.min(.2,framing.quantile||.03));
  const low=axes.map(a=>a[Math.floor(a.length*quantile)]),high=axes.map(a=>a[Math.floor(a.length*(1-quantile))]);
  const center=low.map((v,i)=>(v+high[i])/2),extent=Math.max(...high.map((v,i)=>v-low[i]));
  if(!Number.isFinite(extent)||extent<1e-10)throw Error('Capture has no usable spatial extent.');
  const scale=2/extent,position=[],color=[],tangent=[],normal=[];
  for(let i=0;i<raw.length;i+=3){
    if([0,1,2].some(a=>Math.abs(raw[i+a]-center[a])>extent*.65))continue;
    position.push(...[0,1,2].map(a=>(raw[i+a]-center[a])*scale));color.push(...colors.slice(i,i+3));tangent.push(...directions.slice(i,i+3));normal.push(...surfaceNormals.slice(i,i+3));
  }
  mesh.scale.setScalar(scale);mesh.position.set(...center.map(v=>-v*scale));
  return {positions:new Float32Array(position),colors:new Float32Array(color),tangents:new Float32Array(tangent),normals:new Float32Array(normal),count};
}
function createPoints(){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(sample.positions,3));
  geometry.setAttribute('captureColor',new THREE.BufferAttribute(sample.colors,3));
  const n=sample.positions.length/3,ys=Array.from({length:n},(_,i)=>sample.positions[i*3+1]),lo=ys.reduce((a,b)=>Math.min(a,b),Infinity),hi=ys.reduce((a,b)=>Math.max(a,b),-Infinity);
  const orders=new Float32Array(n);for(let i=0;i<n;i++)orders[i]=(ys[i]-lo)/(hi-lo||1);
  geometry.setAttribute('order',new THREE.BufferAttribute(orders,1));
  points=new THREE.Points(geometry,new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:false}));
  points.renderOrder=2;root.add(points);rebuild();
}
function rebuild(){if(!sample)return;status('Connecting capture points in the background.');worker.postMessage({id:++buildToken,positions:sample.positions,colors:sample.colors,normals:sample.normals,options:{cell:val('spacing'),neighbors:val('neighbors'),maxLength:val('length'),maxNodes:14000}});}
worker.onmessage=({data})=>{
  if(data.id!==buildToken)return;if(data.error){status(data.error);return;}
  if(lines){root.remove(lines);lines.geometry.dispose();lines.material.dispose();}
  graph=data;lines=sketchRibbons(data,lineUniforms);lines.renderOrder=3;root.add(lines);$('stats').textContent=`${sample.count.toLocaleString()} splats · ${(sample.positions.length/3).toLocaleString()} marks · ${data.edges.toLocaleString()} links`;
  status('Ready. Drag to orbit; scroll to zoom. Connections stay in 3D.');
};
worker.onerror=()=>status('Line construction failed. Reload the page to restart the drawing worker.');
async function loadScene(options,name,key,credit,framing={}){
  const token=++loadToken;playing=false;updatePlay();clear();$('empty').style.display='none';$('load').disabled=true;status('Loading capture…');
  let candidate;
  try{
    candidate=new SplatMesh({...options,lod:false,onProgress:e=>{if(token===loadToken)status(e.total?`Loading capture · ${Math.round(e.loaded/e.total*100)}%`:'Loading capture…');}});
    await candidate.initialized;if(token!==loadToken){candidate.dispose();return;}
    status('Sampling the capture…');await new Promise(resolve=>requestAnimationFrame(resolve));
    sample=sampleSplats(candidate,framing);splat=candidate;root.add(splat);createPoints();home();
    if(framing.rotation)root.rotation.set(...framing.rotation);syncAlignment();groundModel(true);
    sceneName=name;currentSource=key;$('title').textContent=name;$('credit').replaceChildren();
    if(credit){const a=document.createElement('a');a.href=credit.url;a.textContent=credit.text;a.target='_blank';a.rel='noopener';$('credit').append(a);}
    $('reveal').value='1';updateControls();
  }catch(e){if(candidate&&candidate!==splat)candidate.dispose();status('Unable to open capture: '+e.message);$('empty').style.display='flex';}
  finally{if(token===loadToken)$('load').disabled=false;}
}
const sources=new Map();
async function library(){
  const response=await fetch('/api/library');
  if(!response.ok)throw Error('Local library unavailable. Restart the updated server.');
  const assets=await response.json();$('source').replaceChildren();
  for(const asset of assets.filter(a=>a.category==='reference'||a.id==='mont-saint-michel')){sources.set('library:'+asset.id,{url:asset.url,name:asset.title,framing:asset.framing,credit:{text:asset.credit,url:asset.source}});$('source').add(new Option(asset.title,'library:'+asset.id));}
  if(!sources.size){status('Open a local splat file to begin.');return;}
  const wanted=new URLSearchParams(location.search).get('job')||'library:mont-saint-michel';if(sources.has(wanted))$('source').value=wanted;
  await loadSelected();
}
async function loadSelected(){const key=$('source').value,s=sources.get(key);if(s)await loadScene({url:s.url},s.name,key,s.credit,s.framing);}
$('load').onclick=loadSelected;
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;if(file.size>1.5*1024**3){status('Use a capture smaller than 1.5 GB for this browser workspace.');return;}await loadScene({fileBytes:await file.arrayBuffer(),fileName:file.name},file.name,'local:'+file.name);};
for(const id of [...ids,'paper','ink'])$(id).addEventListener('input',updateControls);
for(const id of ['spacing','neighbors','length'])$(id).addEventListener('change',rebuild);
const presets={wire:{photo:0,points:.16,size:.8,color:.35,lines:.55,linewidth:1,linecolor:.45,paper:'#f5f0e6',ink:'#273b3c'},points:{photo:0,points:.8,size:1,color:1,lines:0},capture:{photo:1,points:0,lines:0}};
function preset(name){for(const [id,value] of Object.entries(presets[name]))$(id).value=value;document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));$('mode').textContent=name.toUpperCase()+' / 3D';updateControls();}
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
function updatePlay(){$('play').textContent=playing?'Ⅱ Pause':'▶ Draw';$('play').setAttribute('aria-pressed',String(playing));}
$('play').onclick=()=>{if(!sample)return;playing=!playing;if(playing&&val('reveal')>=1){elapsed=0;$('reveal').value=0;}else elapsed=val('reveal')*12;updatePlay();};
$('reset').onclick=()=>{playing=false;elapsed=0;$('reveal').value=0;updatePlay();updateControls();};
$('reveal').addEventListener('input',()=>{playing=false;updatePlay();elapsed=val('reveal')*12;});
$('home').onclick=home;$('orbit').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('orbit').setAttribute('aria-pressed',String(controls.autoRotate));};
$('rotate').onclick=()=>{root.rotation.x=(root.rotation.x+Math.PI/2+Math.PI)%(Math.PI*2)-Math.PI;syncAlignment();groundModel(true);};
$('audio-file').onchange=async()=>{
  const file=$('audio-file').files[0];if(!file)return;
  $('audio').pause();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(file);$('audio').src=audioURL;$('audio').hidden=false;
  if(!audioContext){audioContext=new AudioContext();analyser=audioContext.createAnalyser();analyser.fftSize=256;audioData=new Uint8Array(analyser.frequencyBinCount);const source=audioContext.createMediaElementSource($('audio'));source.connect(analyser);analyser.connect(audioContext.destination);}
  status('Audio loaded. Press play on the track to animate the marks.');
};
$('audio').onplay=()=>audioContext?.resume();$('audio').onerror=()=>status('This audio file could not be decoded. Try WAV or MP3.');
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('png').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>blob&&download(blob,'spatial-wireframe.png'));};
function composition(){return{format:'architecture-atelier-v1',drawingMode,scene:currentSource,sceneName,settings:Object.fromEntries([...ids,'paper','ink'].map(id=>[id,$(id).value])),camera:camera.position.toArray(),target:controls.target.toArray(),rotation:root.rotation.toArray().slice(0,3),groundGrid:grid.visible};}
$('save').onclick=()=>download(new Blob([JSON.stringify(composition(),null,2)],{type:'application/json'}),'architectural-study.json');
$('restore').onchange=async()=>{
  try{const file=$('restore').files[0];if(!file)return;const p=JSON.parse(await file.text());if(p.format!=='architecture-atelier-v1')throw Error('Unsupported composition format');
    drawingMode='graph';
    if(p.scene!==currentSource){if(sources.has(p.scene)){$('source').value=p.scene;await loadSelected();}else throw Error('Open the original local capture first, then restore this composition.');}
    for(const [id,value] of Object.entries(p.settings||{})){if(![...ids,'paper','ink'].includes(id))continue;if(['paper','ink'].includes(id)){if(/^#[0-9a-f]{6}$/i.test(value))$(id).value=value;}else if(Number.isFinite(Number(value)))$(id).value=value;}
    if(p.rotation?.length===3&&p.rotation.every(Number.isFinite)){root.rotation.set(...p.rotation);syncAlignment();groundModel();}if(typeof p.groundGrid==='boolean'){grid.visible=p.groundGrid;$('grid').checked=p.groundGrid;}
    for(const [key,object] of [['camera',camera.position],['target',controls.target]])if(Array.isArray(p[key])&&p[key].length===3&&p[key].every(Number.isFinite))object.fromArray(p[key]);
    if(p.rotation?.length===3&&p.rotation.every(Number.isFinite))root.rotation.set(...p.rotation);controls.update();updateControls();rebuild();
  }catch(e){status('Could not restore: '+e.message);}
};
$('svg').onclick=()=>{
  if(!sample)return;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const w=1600,h=Math.round(w/camera.aspect),v=new THREE.Vector3();
  function project(array,i,other=null){v.fromArray(array,i);if(other!==null)v.addScaledVector(new THREE.Vector3().fromArray(array,i).sub(new THREE.Vector3().fromArray(array,other)),val('extension')*.5);v.applyMatrix4(root.matrixWorld).project(camera);return{x:(v.x+1)*w/2,y:(1-v.y)*h/2,visible:v.z>-1&&v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1};}
  const ink=$('ink').value,parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${$('paper').value}"/>`];
  if(graph&&val('lines')>0){parts.push(`<g fill="none" stroke="${ink}" stroke-width=".65" opacity="${val('lines')}">`);for(let i=0;i<graph.vertices.length;i+=6){if(Math.max(graph.orders[i/3],graph.orders[i/3+1])>val('reveal'))continue;const a=project(graph.vertices,i,i+3),b=project(graph.vertices,i+3,i);if(a.visible&&b.visible)parts.push(`<path stroke-width="${graph.widths?(graph.widths[i/3]*val('linewidth')*w/viewport.clientWidth).toFixed(3):.65}" stroke="${graph.captureColors?new THREE.Color(ink).lerp(new THREE.Color().fromArray(graph.captureColors,i),val('linecolor')).getStyle():ink}" opacity="${graph.weights?graph.weights[i/3].toFixed(3):1}" d="M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}"/>`);}parts.push('</g>');}
  parts.push(`<g fill="${ink}" opacity="${val('points')}">`);const step=Math.max(1,Math.ceil(sample.positions.length/3/30000));
  for(let i=0;i<sample.positions.length;i+=3*step){if(points.geometry.attributes.order.array[i/3]>val('reveal'))continue;const p=project(sample.positions,i);if(p.visible)parts.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(val('size')*.4).toFixed(2)}"/>`);}parts.push('</g></svg>');download(new Blob(parts,{type:'image/svg+xml'}),'architectural-drawing.svg');status('SVG exported: points and strokes, including capture colors; photographic layer omitted.');
};
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);lineUniforms.uResolution.value.set(w*renderer.getPixelRatio(),h*renderer.getPixelRatio());camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
renderer.setAnimationLoop(()=>{
  const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;
  if(playing){elapsed+=dt;$('reveal').value=Math.min(elapsed/12,1);if(elapsed>=12){playing=false;updatePlay();}updateControls();}
  let energy=0;if(analyser&&!$('audio').paused){analyser.getByteFrequencyData(audioData);energy=audioData.slice(1,24).reduce((s,v)=>s+v,0)/23/255;}
  const pulse=energy*val('response');uniforms.uSize.value=val('size')*renderer.getPixelRatio()*(1+pulse*1.5);uniforms.uOpacity.value=val('points');lineUniforms.uOpacity.value=Math.min(1,val('lines')*(1+pulse*2));
  if(splat){splat.opacity=val('photo');splat.visible=val('photo')>0;}if(points)points.visible=val('points')>0;if(lines)lines.visible=val('lines')>0;controls.update(dt);
  renderer.render(scene,camera);
});
preset('wire');library().catch(e=>status(e.message));
