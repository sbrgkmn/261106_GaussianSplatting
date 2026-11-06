import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {projectionFromIntrinsics,fitFrame} from './projection.mjs';
import {normalizeScene,captureTransform} from './multiview-camera.mjs';

const $=id=>document.getElementById(id), status=text=>$('status').textContent=text;
const viewport=$('viewport'), renderer=new THREE.WebGLRenderer({antialias:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#11191b');
viewport.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.001,1000);
scene.add(new SparkRenderer({renderer}));
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
camera.position.set(0,0,0);controls.target.set(0,0,-1);controls.update();
let selected=null,mesh=null,frame=null,normalizer=null,cameraGroup=new THREE.Group(),loadVersion=0;
let polling=false,loadingId=null,loadedId=null,previewUrls=[];
scene.add(cameraGroup);
async function api(url,options){const r=await fetch(url,options);if(!r.ok){let message=r.statusText;try{message=(await r.json()).detail||message;}catch{}throw Error(message);}return r.json();}
function disposeCameras(){for(const child of [...cameraGroup.children]){child.geometry?.dispose();child.material?.dispose();cameraGroup.remove(child);}}
function captureMatrix(c){
 return captureTransform(normalizer,c);
}
function selectCamera(index){
 if(!selected?.scene||!normalizer)return;
 frame=selected.scene.cameras[index];const transform=captureMatrix(frame);
 camera.position.setFromMatrixPosition(transform);camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(transform));
 const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 controls.target.copy(camera.position).add(direction);camera.up.set(0,1,0).applyQuaternion(camera.quaternion);controls.update();
 $('camera').value=String(index);$('reference').src='/api/jobs/'+selected.id+'/'+frame.file;$('reference').hidden=false;
}
function clearScene(){
 loadVersion++;loadingId=null;loadedId=null;frame=null;normalizer=null;
 if(mesh){scene.remove(mesh);mesh.dispose();mesh=null;}disposeCameras();
 $('camera').disabled=true;$('camera').replaceChildren(new Option('No scene loaded',''));
 $('reference').hidden=true;$('downloads').replaceChildren();$('metrics').textContent='Waiting for reconstruction.';
 $('empty').hidden=false;$('empty').style.display='grid';
}
async function display(job){
 if(selected?.id!==job.id)clearScene();selected=job;
 $('summary').textContent=job.views.length+' input views · '+job.status;
 if(job.status!=='complete'){
  status(job.message);$('empty').querySelector('h2').textContent=job.status==='failed'?'Reconstruction failed':job.status==='running'?'Reconstructing jointly...':'Waiting for GPU';
  if(job.status==='failed')addLink('run.log','Read failure log');return;
 }
 if(loadedId===job.id||loadingId===job.id)return;
 const version=loadVersion;loadingId=job.id;status('Loading reconstructed scene...');
 let candidate;
 try{
  candidate=new SplatMesh({url:'/api/jobs/'+job.id+'/scene.ply'});await candidate.initialized;
  if(version!==loadVersion){candidate.dispose();return;}
  mesh=candidate;scene.add(mesh);const meta=job.scene;
  normalizer=normalizeScene(meta);
  mesh.matrixAutoUpdate=false;mesh.matrix.copy(normalizer);
  $('camera').replaceChildren(...meta.cameras.map((c,i)=>new Option((i+1)+'. '+c.name,String(i))));$('camera').disabled=false;
  for(const c of meta.cameras){
   // Small near/far extent keeps frusta legible at normalized scene scale.
   const k=c.intrinsics, w=c.width,h=c.height,d=.09;
   const points=[[0,0,0],[-k[0][2]/k[0][0]*d,k[1][2]/k[1][1]*d,-d],[(w-k[0][2])/k[0][0]*d,k[1][2]/k[1][1]*d,-d],[(w-k[0][2])/k[0][0]*d,-(h-k[1][2])/k[1][1]*d,-d],[-k[0][2]/k[0][0]*d,-(h-k[1][2])/k[1][1]*d,-d]];
   const vertices=[];for(const [a,b] of [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]])vertices.push(...points[a],...points[b]);
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
   const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xc5dea4}));
   const pose=captureMatrix(c);pose.decompose(lines.position,lines.quaternion,new THREE.Vector3());cameraGroup.add(lines);
  }
  $('empty').style.display='none';selectCamera(0);loadedId=job.id;
  $('metrics').textContent=meta.view_count+' views · '+meta.count.toLocaleString()+' splats · '+job.seconds+'s total · '+meta.peak_vram_gb+' GiB peak · feed-forward, no refinement';
  $('downloads').replaceChildren();for(const [file,label] of [['scene.ply','Download PLY'],['cameras.json','Camera poses'],['scene.json','Metrics'],['run.log','Run log']])addLink(file,label);
  status('Scene ready. Switch capture cameras and orbit to inspect structural consistency.');
 }catch(e){if(candidate){scene.remove(candidate);candidate.dispose();if(mesh===candidate)mesh=null;}status('Viewer error: '+e.message);}
 finally{if(version===loadVersion)loadingId=null;}
}
function addLink(file,label){if($('downloads').querySelector('[data-file="'+file+'"]'))return;const a=document.createElement('a');a.dataset.file=file;a.href='/api/jobs/'+selected.id+'/'+file;a.textContent=label;a.download=file;$('downloads').append(a);}
async function refresh(){
 if(polling)return;polling=true;
 try{
  const jobs=(await api('/api/jobs')).filter(j=>j.mode==='multiview');
  $('jobs').replaceChildren(...jobs.slice(0,20).map(job=>{const b=document.createElement('button');b.textContent=new Date(job.created*1000).toLocaleString()+' · '+job.views.length+' views · '+job.status;b.setAttribute('aria-current',String(job.id===selected?.id));b.onclick=()=>display(job);return b;}));
  if(!selected&&jobs.length)await display(jobs[0]);else if(selected){const job=jobs.find(j=>j.id===selected.id);if(job)await display(job);}
 }finally{polling=false;}
}
$('files').onchange=()=>{
 for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls=[];
 const files=[...$('files').files];$('selection').textContent=files.length+' photos selected · '+(files.reduce((n,f)=>n+f.size,0)/1024**2).toFixed(1)+' MB';
 $('thumbnails').replaceChildren(...files.slice(0,16).map((file,i)=>{const im=document.createElement('img');im.src=URL.createObjectURL(file);previewUrls.push(im.src);im.alt=(i+1)+'. '+file.name;im.title=im.alt;return im;}));
};
$('upload').onsubmit=async event=>{
 event.preventDefault();const files=[...$('files').files];
 if(files.length<2||files.length>16){status('Select 2–16 overlapping photographs of one scene.');return;}
 if(files.some(f=>f.size>25*1024**2)||files.reduce((n,f)=>n+f.size,0)>200*1024**2){status('Limit: 25 MB per photo and 200 MB per set.');return;}
 $('generate').disabled=true;status('Uploading photographs...');
 try{const body=new FormData();for(const file of files)body.append('images',file);await display(await api('/api/multiview/jobs',{method:'POST',body}));await refresh();}
 catch(e){status(e.message);}finally{$('generate').disabled=false;}
};
$('camera').onchange=()=>selectCamera(Number($('camera').value));$('reset').onclick=()=>selectCamera(0);
$('frusta').onchange=()=>cameraGroup.visible=$('frusta').checked;$('background').oninput=e=>renderer.setClearColor(e.target.value);
new ResizeObserver(()=>renderer.setSize(viewport.clientWidth,viewport.clientHeight)).observe(viewport);
renderer.setAnimationLoop(()=>{
 controls.update();const w=viewport.clientWidth,h=viewport.clientHeight;
 renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);renderer.clear();
 if(frame){const f=fitFrame(w,h,frame.width,frame.height);renderer.setViewport(f.x,f.y,f.width,f.height);renderer.setScissor(f.x,f.y,f.width,f.height);renderer.setScissorTest(true);camera.projectionMatrix.fromArray(projectionFromIntrinsics(frame));camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();renderer.render(scene,camera);}
});
try{const [health,cap]=await Promise.all([api('/api/health'),api('/api/multiview')]);$('hardware').textContent=health.cuda?health.gpu+' / CUDA ready':'CUDA unavailable';$('generate').disabled=!health.cuda||!cap.available;if(!cap.available)status('Install ZipSplat with scripts/setup-models.ps1.');await refresh();}catch(e){status(e.message);}
setInterval(()=>refresh().catch(e=>status(e.message)),3000);
