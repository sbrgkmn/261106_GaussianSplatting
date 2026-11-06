import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SparkRenderer,SplatMesh} from '@sparkjsdev/spark';
import {projectionFromIntrinsics, fitFrame} from './projection.mjs';

const $=id=>document.getElementById(id), status=s=>$('status').textContent=s;
const viewport=$('viewport');
const renderer=new THREE.WebGLRenderer({antialias:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
renderer.setClearColor('#11191b'); renderer.autoClear=false;
viewport.appendChild(renderer.domElement);
const rig=new THREE.PerspectiveCamera(50,1,.001,1000);
const controls=new OrbitControls(rig,renderer.domElement);
controls.target.set(0,0,-1);controls.enabled=false;controls.enableDamping=true;
let panels=[], selectedSource=null, activeGroup=null, animation=false, catalog=[], pollBusy=false;
let lastList=[], currentFileUrl=null;

async function request(url,options){const r=await fetch(url,options);if(!r.ok){let msg=r.statusText;try{msg=(await r.json()).detail||msg;}catch{}throw Error(msg);}return r.json();}
function setSource(job){selectedSource=job;$('file').value='';$('preview').src='/api/jobs/'+job.id+'/'+job.input;$('preview').hidden=false;}
function reset(){animation=false;$('motion').setAttribute('aria-pressed','false');$('free').checked=false;controls.enabled=false;for(const key of ['lateral','vertical','forward']){$(key).value=0;$(key+'-value').value='0%';}rig.position.set(0,0,0);controls.target.set(0,0,-1);rig.lookAt(controls.target);controls.update();}
function clearPanels(){for(const p of panels){p.disposed=true;if(p.mesh)p.mesh.dispose();p.spark.dispose();}panels=[];$('panels').replaceChildren();}
function showGroup(jobs){
 clearPanels();reset();$('display').value='all';$('empty').style.display='none';
 activeGroup=jobs[0]?.comparison||jobs[0]?.id;if(jobs[0])setSource(jobs[0]);
 for(const job of jobs){
  const element=document.createElement('section');element.className='panel';
  const title=document.createElement('header');title.textContent=catalog.find(m=>m.id===(job.model||'sharp'))?.name||'SHARP';
  const frame=document.createElement('div');frame.className='frame';
  const info=document.createElement('div');info.className='info';
  element.append(title,frame,info);$('panels').append(element);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),spark=new SparkRenderer({renderer});scene.add(spark);
  const p={job,element,frame,info,scene,camera,spark,mesh:null,loading:false,disposed:false};panels.push(p);updatePanel(p,job);
 }
}
async function updatePanel(p,job){
 p.job=job;if(p.mesh||p.loading)return;
 if(job.status!=='complete'){
  p.frame.replaceChildren();const message=document.createElement('div');message.className='pending';
  message.textContent=job.status==='failed'?'Reconstruction failed':job.status==='running'?'Reconstructing on A6000...':'Waiting for GPU';p.frame.append(message);
  p.info.replaceChildren();const text=document.createElement('div');text.className=job.status==='failed'?'error':'';text.textContent=job.message;p.info.append(text);
  if(job.status==='failed'){const log=document.createElement('a');log.href='/api/jobs/'+job.id+'/run.log';log.textContent='Open log';log.target='_blank';p.info.append(log);}return;
 }
 p.loading=true;p.info.textContent='Loading 3D scene...';let mesh;
 try{
  mesh=new SplatMesh({url:'/api/jobs/'+job.id+'/scene.ply'});await mesh.initialized;
  if(p.disposed){mesh.dispose();return;}
  p.meta=job.scene;p.mesh=mesh;
  const scale=1/Math.max(p.meta.depth,.001);
  const view=new THREE.Matrix4();if(p.meta.world_to_camera)view.set(...p.meta.world_to_camera.flat());
  mesh.matrixAutoUpdate=false;mesh.matrix.copy(new THREE.Matrix4().makeScale(scale,-scale,-scale).multiply(view));p.scene.add(mesh);
  p.frame.replaceChildren();p.info.replaceChildren();
  const metrics=document.createElement('div');metrics.textContent=p.meta.count.toLocaleString()+' splats / '+job.seconds+'s total / '+p.meta.peak_vram_gb+' GiB peak';
  const cam=document.createElement('div');cam.textContent=p.meta.camera_source||'EXIF or 30mm fallback (legacy result)';
  const links=document.createElement('div');links.className='links';
  for(const [asset,label] of [['scene.ply','Download PLY'],['scene.json','Camera / metrics']]){const a=document.createElement('a');a.href='/api/jobs/'+job.id+'/'+asset;a.textContent=label;a.download=asset;links.append(a);}
  p.info.append(metrics,cam,links);
 }catch(e){if(mesh)mesh.dispose();if(!p.disposed)p.info.textContent='Viewer error: '+e.message;}
}
new ResizeObserver(()=>renderer.setSize(viewport.clientWidth,viewport.clientHeight)).observe(viewport);
renderer.setAnimationLoop(t=>{
 if(controls.enabled)controls.update();
 else{const x=Number($('lateral').value)/100+(animation?Math.sin(t/1800)*.04:0),y=Number($('vertical').value)/100,z=Number($('forward').value)/100;rig.position.set(x,y,-z);rig.lookAt(0,0,-1);}
 renderer.setScissorTest(false);renderer.setViewport(0,0,viewport.clientWidth,viewport.clientHeight);renderer.clear();
 const outer=viewport.getBoundingClientRect();
 for(const p of panels){
  if(!p.mesh)continue;
  const rect=p.frame.getBoundingClientRect();if(rect.width<=0||rect.height<=0)continue;
  const f=fitFrame(rect.width,rect.height,p.meta.width,p.meta.height);
  const x=rect.left-outer.left+f.x,y=outer.bottom-rect.bottom+f.y;
  renderer.setViewport(x,y,f.width,f.height);renderer.setScissor(x,y,f.width,f.height);renderer.setScissorTest(true);
  p.camera.position.copy(rig.position);p.camera.quaternion.copy(rig.quaternion);
  p.camera.projectionMatrix.fromArray(projectionFromIntrinsics(p.meta));p.camera.projectionMatrixInverse.copy(p.camera.projectionMatrix).invert();
  renderer.render(p.scene,p.camera);
 }
 renderer.setScissorTest(false);
});
async function refresh(){
 if(pollBusy)return;pollBusy=true;
 try{
  lastList=(await request('/api/jobs')).filter(j=>j.mode!=='multiview');const groups=new Map();
  for(const j of lastList){const id=j.comparison||j.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(j);}
  const fragment=document.createDocumentFragment();
  for(const group of [...groups.values()].slice(0,12)){
   group.sort((a,b)=>['sharp','infinisplat','zipsplat'].indexOf(a.model||'sharp')-['sharp','infinisplat','zipsplat'].indexOf(b.model||'sharp'));
   const b=document.createElement('button');b.textContent=new Date(group[0].created*1000).toLocaleTimeString()+' / '+group.length+' model'+(group.length>1?'s':'')+' / '+group.filter(j=>j.status==='complete').length+' ready';
   b.onclick=()=>showGroup(group);fragment.append(b);
  }
  $('jobs').replaceChildren(fragment);
  for(const p of panels){const j=lastList.find(j=>j.id===p.job.id);if(j)updatePanel(p,j);}
  const pending=lastList.filter(j=>j.status==='running'||j.status==='queued').length;
  $('summary').textContent=pending?pending+' jobs in GPU queue':'Same source / matched motion';
  if(!activeGroup&&lastList.length)showGroup(groups.get(lastList[0].comparison||lastList[0].id));
 }finally{pollBusy=false;}
}
$('file').onchange=()=>{const f=$('file').files[0];if(f){selectedSource=null;if(currentFileUrl)URL.revokeObjectURL(currentFileUrl);currentFileUrl=URL.createObjectURL(f);$('preview').src=currentFileUrl;$('preview').hidden=false;}};
$('upload').onsubmit=async e=>{
 e.preventDefault();const chosen=[...document.querySelectorAll('#models input:checked')].map(i=>i.value);
 if(!chosen.length){status('Select at least one model.');return;}
 const file=$('file').files[0];if(!file&&!selectedSource){status('Choose a photo first.');return;}
 if(file&&file.size>25*1024*1024){status('Maximum file size is 25 MB');return;}
 $('generate').disabled=true;
 try{
  const query=new URLSearchParams({models:chosen.join(',')});if($('lens').value)query.set('focal_mm',$('lens').value);
  const url=file?'/api/jobs?'+query:'/api/jobs/'+selectedSource.id+'/compare?'+query;
  const result=await request(url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},...(file?{body:file}:{})});
  showGroup(result);status('Comparison queued. Models run one at a time to keep GPU memory available.');await refresh();
 }catch(e){status(e.message);}finally{$('generate').disabled=false;}
};
$('reset').onclick=reset;
$('motion').onclick=()=>{animation=!animation;$('free').checked=false;controls.enabled=false;$('motion').setAttribute('aria-pressed',String(animation));};
$('free').onchange=()=>{controls.enabled=$('free').checked;animation=false;$('motion').setAttribute('aria-pressed','false');};
$('background').oninput=e=>renderer.setClearColor(e.target.value);
$('display').onchange=()=>{for(const p of panels)p.element.style.display=$('display').value==='all'||$('display').value===(p.job.model||'sharp')?'':'none';};
for(const key of ['lateral','vertical','forward'])$(key).oninput=()=>{$(key+'-value').value=$(key).value+'%';$('free').checked=false;controls.enabled=false;};
try{
 catalog=await request('/api/models');
 for(const m of catalog){
  const label=document.createElement('label'),input=document.createElement('input'),small=document.createElement('small');
  input.type='checkbox';input.value=m.id;input.checked=m.available;input.disabled=!m.available;label.append(input,' '+m.name);
  small.textContent=m.description+' '+m.license;label.append(small);$('models').append(label);
 }
 const health=await request('/api/health');$('hardware').textContent=health.cuda?health.gpu+' / CUDA ready':'CUDA unavailable';await refresh();
}catch(e){status(e.message);}
setInterval(()=>refresh().catch(e=>status(e.message)),3000);
