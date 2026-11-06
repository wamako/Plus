import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import Module from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sdk=await fs.realpath(path.join(root,'node_modules/spotifyplus'));
process.env.NODE_PATH=path.join(sdk,'node_modules');Module._initPaths();
const host=path.resolve(sdk,'../nodejs');
const {ScriptLoader}=await import(pathToFileURL(path.join(host,'loader/script-loader.js')));
const {ScriptRegistry}=await import(pathToFileURL(path.join(host,'loader/script-registry.js')));
const {setCommitListener,clearCommitListener,dispatchReactEvent}=await import(pathToFileURL(path.join(host,'ui/renderer.js')));
const uri=n=>'spotify:track:'+String(n).padStart(22,'0'), album='spotify:album:'+'9'.padStart(22,'0');
const ticket='12345678-1234-1234-1234-123456789abc';
const text=node=>node?.type==='TEXT_INSTANCE'?node.text:(node?.children||[]).map(text).join(' ').replace(/\s+/g,' ').trim();
const nodes=node=>[node,...(node?.children||[]).flatMap(nodes)];
const delay=()=>new Promise(r=>setTimeout(r,5));
test('Shuffle+ bundle through real pinned loader: no writes on preview, native actions, stale/lost outcomes and unload',async()=>{
 let tree,fail=null;const values=new Map(),calls=[],errors=[];
 const logger={child(){return this},info(){},warn(){},error(...args){errors.push(args)}};
 const registry=new ScriptRegistry(logger,()=>{});
 const runtime={registry,ui:{forExtension(){return {}}},platformData:{clientVersion:'9.1.94.1929',osName:'Android',osVersion:'17',sdkVersion:37},session:{accessToken:'token'},
  storageGet:(s,k)=>values.get(s+':'+k)??null,storageSet:(s,k,v)=>values.set(s+':'+k,structuredClone(v)),storageRemove:(s,k)=>values.delete(s+':'+k),
  registerSideDrawer(){},registerContextMenu(){},createWorkletContext(){return true},createAnimationAdapter(){return {}},disposeWorkletContext(){},
  unregisterScript:s=>registry.unregisterScript(s),logScript(_s,l,a){if(l==='error')errors.push(a)},
  callApiSync(op){if(op==='player.state')return {contextUri:album,trackUri:uri(1)};throw new Error(op)},
  requestApi:async(op,args)=>{
   calls.push({op,args});
   if(op==='shuffleplus.capabilities')return {version:1,host:13,limit:10000};
   if(op==='shuffleplus.queue')return {mode:'queue',ticket,count:3,tracks:[1,1,2].map(n=>({uri:uri(n),title:'Song '+n,artist:'Artist'}))};
   if(op==='shuffleplus.prepare')return {mode:'collection',ticket,count:args.uris.length};
   if(op==='shuffleplus.apply'){if(fail)throw new Error(fail);return {applied:args.order.length}}
   if(op==='album.get')return {uri:album,name:'Album',disc:[{number:1,track:[1,2].map(n=>({gid:n.toString(16).padStart(32,'0')}))}]};
   throw new Error(op);
  },
  getTrack:async uri=>({uri,title:'Song',artist:'Artist',artists:['Artist'],album:{title:'Album'},durationMs:100000}),
  getCurrentTrack(){return {uri:uri(1)}},getProgress(){return 0},
  closeSurface(s){registry.unmountSurface(s,'sideDrawer');return true},navigate(){},sendCommand(){},toast(){},navigateBack(){}};
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Unexpected HTTP request')};
 const loader=new ScriptLoader(runtime,logger);
 const read=()=>{tree=[...registry.mountedSurfaces.values()].find(s=>s.surfaceId==='sideDrawer')?.root.getTree();return text(tree)};
 const until=async predicate=>{for(let i=0;i<1000;i++){read();if(predicate()){await delay();read();return;}await delay()}assert.fail(read())};
 const press=label=>{read();const n=nodes(tree).find(n=>n.props?.onPress?.id&&text(n)===label);assert.ok(n,'missing '+label);assert.ok(!n.props.disabled&&n.props.enabled!==false,'disabled '+label);dispatchReactEvent(n.props.onPress.id,{surfaceId:'sideDrawer'});return n.props.onPress.id};
 const mutations=()=>calls.filter(c=>c.op==='shuffleplus.apply');
 setCommitListener('sideDrawer',()=>{});
 try {
  loader.loadScript(path.join(root,'build/SpotifyPlus-ShufflePlus/shuffle-plus'),'user');
  assert.equal(registry.getScripts().length,1);assert.equal(calls.length,0);
  const entry=[...registry.getSideDrawerItems().values()][0];registry.emitSideDrawerPress(entry.scriptId,entry.id);await until(()=>read().includes('Load and shuffle collection'));
  press('Preview shuffled upcoming queue');await until(()=>read().includes('Confirm upcoming shuffle'));
  assert.equal(mutations().length,0);assert.match(read(),/3 tracks in preview/);
  press('Cancel shuffle confirmation');assert.equal(mutations().length,0);
  press('Preview shuffled upcoming queue');await until(()=>read().includes('Confirm upcoming shuffle'));
  press('Confirm upcoming shuffle');await until(()=>read().includes('Confirmed: 3 songs'));
  assert.equal(mutations().length,1);assert.equal(values.get('com.wamako.shuffleplus:shuffle-write-v1').phase,'complete');
  press('Load and shuffle collection');await until(()=>read().includes('Prepare shuffled playback'));
  assert.equal(mutations().length,1);press('Prepare shuffled playback');await until(()=>read().includes('Start shuffled playback'));
  const prepared=calls.find(c=>c.op==='shuffleplus.prepare');assert.deepEqual([...prepared.args.uris].sort(),[uri(1),uri(2)].sort());assert.equal(prepared.args.uris.length,2);
  fail='SP_SHUFFLE_STALE';press('Start shuffled playback');await until(()=>read().includes('Playback or the queue changed'));
  assert.equal(values.get('com.wamako.shuffleplus:shuffle-write-v1').phase,'stopped');assert.equal(mutations().length,2);
  fail='SP_SHUFFLE_RPC';press('Prepare shuffled playback');await until(()=>read().includes('Start shuffled playback'));press('Start shuffled playback');await until(()=>read().includes('I checked playback; allow another shuffle'));
  assert.equal(mutations().length,3);assert.equal(values.get('com.wamako.shuffleplus:shuffle-write-v1').phase,'unknown');
  press('I checked playback; allow another shuffle');assert.equal(values.get('com.wamako.shuffleplus:shuffle-write-v1').phase,'reviewed');
  await until(()=>!read().includes('I checked playback; allow another shuffle'));fail=null;press('Prepare shuffled playback');await until(()=>read().includes('Start shuffled playback'));const staleCallback=press('Cancel shuffle confirmation');
  runtime.unregisterScript('com.wamako.shuffleplus');dispatchReactEvent(staleCallback,{surfaceId:'sideDrawer'});assert.equal(mutations().length,3);
 }finally{for(const s of [...registry.getScripts()])runtime.unregisterScript(s.manifest.id);clearCommitListener('sideDrawer');globalThis.fetch=originalFetch;}
 assert.equal(registry.getScripts().length,0);assert.equal(registry.getSideDrawerItems().size,0);assert.equal(registry.cleanupCallbacks.size,0);assert.equal(registry.eventHandlers.size,0);assert.deepEqual(errors,[]);
});
