import test from 'node:test';
import assert from 'node:assert/strict';
import {permutation,shuffleTracks,ShuffleClient,shuffleError,safeDiagnostics,playbackRange,mismatchSummary} from '../shared/shuffle.mjs';
const uri=n=>'spotify:track:'+String(n).padStart(22,'0');
const tracks=[1,1,2].map((n,i)=>({uri:uri(n),title:'Song '+n,artist:'Artist',occurrence:i}));
const ticket='12345678-1234-1234-1234-123456789abc';
function fixture(){
 const values=new Map(),calls=[];let failure=null,response;
 const api={Platform:{Storage:{get:k=>values.get(k),set:(k,v)=>values.set(k,structuredClone(v))}},
  request:async(op,args)=>{
   calls.push({op,args});
   if(op==='shuffleplus.capabilities')return {version:1,host:24,queueRevision:"observer-initial-cas",queueEntryProvider:"native-factory-default",observerReadiness:"await-initial-state",collectionVerification:"provider-aware-autoplay",collectionMode:"first-track-explicit-queue",route:"native-play-and-setqueue",queueMode:"native-editor-options",playerReady:true,limit:10000};
   if(op==='shuffleplus.diagnostics')return {host:24,mode:'queue',outcome:'unknown',queueUnchanged:true,privateUri:uri(1),token:'private-token'};
   if(op==='shuffleplus.copyDiagnostics')return true;
   if(op==='shuffleplus.queue')return {mode:'queue',ticket,count:3,tracks};
   if(op==='shuffleplus.prepare')return {mode:'collection',ticket,count:args.uris.length};
   assert.equal(op,'shuffleplus.apply');assert.equal(values.get('shuffle-write-v1').phase,'pending');
   if(failure)throw failure;return response||{applied:args.order.length,verification:"visible-order",autoplayTailCount:0,selectionCompleteInWindow:true};
  }};
 api.ShufflePlus={diagnostics:()=>api.request('shuffleplus.diagnostics'),copyDiagnostics:()=>api.request('shuffleplus.copyDiagnostics'),capabilities:()=>api.request('shuffleplus.capabilities'),previewQueue:()=>api.request('shuffleplus.queue'),prepare:(context,uris)=>api.request('shuffleplus.prepare',{context,uris}),apply:(ticket,order)=>api.request('shuffleplus.apply',{ticket,order})};
 return {values,calls,api,client:new ShuffleClient(api),fail:e=>failure=e,respond:r=>response=r};
}
test('Fisher-Yates reaches all six 3-item permutations with equal branch weights and no weighting',()=>{
 const unique=new Set();for(let i=0;i<3;i++)for(let j=0;j<2;j++){let draw=0;unique.add(permutation(3,()=>draw++===0?(i+.1)/3:(j+.1)/2).join(','));}assert.equal(unique.size,6);
 assert.deepEqual(permutation(0),[]);assert.deepEqual(permutation(1),[0]);
 for(const value of [-1,1,NaN,Infinity])assert.throws(()=>permutation(3,()=>value));
 assert.throws(()=>permutation(100001));assert.throws(()=>permutation(1.5));
});
test('preview preserves exact occurrences and input; a large collection is fully permuted',()=>{
 const before=[...tracks];const order=shuffleTracks(tracks,()=>0);assert.deepEqual(tracks,before);
 assert.equal(new Set(order.map(t=>t.occurrence)).size,3);assert.equal(order.filter(t=>t.uri===uri(1)).length,2);
 const large=permutation(100000,()=>.4);assert.equal(new Set(large).size,100000);
});
test('preparation makes no mutation and explicit apply is one ordered native command',async()=>{
 const f=fixture();const p=await f.client.queue({},()=>0);
 assert.ok(f.calls.every(c=>c.op!=='shuffleplus.apply'));
 await assert.rejects(f.client.apply(p,'bad','yes',{}));assert.equal(f.calls.length,2);
 await f.client.apply(p,'yes','yes',{});assert.equal(f.calls.filter(c=>c.op==='shuffleplus.apply').length,1);
 assert.deepEqual(f.calls.at(-1).args.order,p.order);assert.equal(f.client.previous().phase,'complete');
 await assert.rejects(f.client.apply(p,'yes','yes',{}),/already used/);
});
test('collection prepare preserves already shuffled URIs including duplicates, and confirms identity order',async()=>{
 const f=fixture();const p=await f.client.collection(tracks,'spotify:collection:tracks',{});
 assert.deepEqual(f.calls.at(-1).args.uris,tracks.map(t=>t.uri));assert.deepEqual(p.order,[0,1,2]);
 await f.client.apply(p,'ok','ok',{});assert.equal(f.client.previous().phase,'complete');
});
test('native stale/rejection errors are stopped; RPC/lost/malformed acknowledgments remain unknown and are not retried',async()=>{
 for(const [message,phase] of [['SP_SHUFFLE_UNCONFIRMED_INITIAL_STATE','unknown'],['SP_SHUFFLE_UNCONFIRMED_DEADLINE','unknown'],['SP_SHUFFLE_UNCONFIRMED_NO_CHANGE','unknown'],['SP_SHUFFLE_UNCONFIRMED_ORDER','unknown'],['SP_SHUFFLE_UNCONFIRMED_READBACK','unknown'],['SP_SHUFFLE_OBSERVER_READY','stopped'],['SP_SHUFFLE_QUEUE_LAYOUT','stopped'],['SP_SHUFFLE_STALE_ORDER','stopped'],['SP_SHUFFLE_STALE_OWNER','stopped'],['SP_SHUFFLE_STALE_OPTIONS','stopped'],['SP_SHUFFLE_STALE_PLAYER','stopped'],['SP_SHUFFLE_STALE','stopped'],['SP_SHUFFLE_FORBIDDEN','stopped'],['SP_SHUFFLE_RPC','unknown'],['SP_SHUFFLE_ACK','unknown'],['SP_SHUFFLE_UNCONFIRMED','unknown'],['SP_SHUFFLE_USED','unknown'],['private-token and private-account','unknown']]){
  const f=fixture(),p=await f.client.queue({});f.fail(new Error(message));
  await assert.rejects(f.client.apply(p,'ok','ok',{}),e=>!e.message.includes('private-token'));
  assert.equal(f.client.previous().phase,phase);assert.equal(f.calls.filter(c=>c.op==='shuffleplus.apply').length,1);
  if(phase==='unknown'){
   await assert.rejects(f.client.apply({...p,used:false},'ok','ok',{}),/Inspect/);
   f.client.acknowledge();assert.equal(f.client.previous().phase,'reviewed');
  }
 }
 const f=fixture(),p=await f.client.queue({});f.respond({applied:2});await assert.rejects(f.client.apply(p,'ok','ok',{}));assert.equal(f.client.previous().phase,'unknown');
});
test('cancellation, missing adapter and failed durable journal prevent playback requests',async()=>{
 const f=fixture();await assert.rejects(f.client.queue({cancelled:true}),/cancelled/);assert.equal(f.calls.length,0);
 const p=await f.client.queue({});await assert.rejects(f.client.apply(p,'ok','ok',{cancelled:true}),/cancelled/);
 f.api.Platform.Storage.set=()=>{};await assert.rejects(f.client.apply(p,'ok','ok',{}),/Nothing was sent/);
 assert.equal(f.calls.filter(c=>c.op==='shuffleplus.apply').length,0);
 const old=new ShuffleClient({request:async()=>{throw new Error('Unknown operation')},Platform:f.api.Platform});await assert.rejects(old.queue({}),/R24/);
 assert.equal(shuffleError(new Error('SP_SHUFFLE_RPC'),true).unknown,true);
});

test('old host and count-only success replies cannot claim verified playback',async()=>{
 const f=fixture();f.api.ShufflePlus.capabilities=async()=>({version:1,host:13,limit:10000});
 await assert.rejects(f.client.capabilities({}),/R24/);assert.equal(f.calls.length,0);
 const incomplete=fixture();incomplete.api.ShufflePlus.capabilities=async()=>({version:1,host:24,route:"native-play-and-setqueue",queueMode:"native-editor-options",limit:10000});
 await assert.rejects(incomplete.client.capabilities({}),/R24/);assert.equal(incomplete.calls.length,0);
 const g=fixture(),p=await g.client.queue({});g.respond({applied:3});
 await assert.rejects(g.client.apply(p,'ok','ok',{}));assert.equal(g.client.previous().phase,'unknown');
 assert.equal(g.calls.filter(c=>c.op==='shuffleplus.apply').length,1);
});

test('diagnostics whitelist drops private fields and copying never starts playback',async()=>{
 const f=fixture();assert.deepEqual(await f.client.diagnostics(),{host:24,mode:'queue',outcome:'unknown',queueUnchanged:true});
 await f.client.copyDiagnostics();assert.equal(f.calls.filter(c=>c.op==='shuffleplus.apply').length,0);
 const p=await f.client.queue({});f.fail(new Error('SP_SHUFFLE_UNCONFIRMED_NO_CHANGE'));
 await assert.rejects(f.client.apply(p,'ok','ok',{}),/stayed unchanged/);
 assert.equal(f.client.previous().phase,'unknown');assert.ok(f.client.previous().diagnostics.queueUnchanged);
 assert.ok(!JSON.stringify(f.client.previous()).includes('private-token'));
 assert.deepEqual(safeDiagnostics({host:24,mode:'private',token:'secret',eventsObserved:-1,errorCode:'secret'}),{host:24});
});

test('confirmed Autoplay tail requires complete selection and survives safe diagnostics without private fields',async()=>{
 const f=fixture(),p=await f.client.collection(tracks,'spotify:collection:tracks',{});
 f.respond({applied:3,verification:'visible-order',selectionCompleteInWindow:true,autoplayTailCount:45});
 assert.equal((await f.client.apply(p,'ok','ok',{})).autoplayTailCount,45);assert.equal(f.client.previous().phase,'complete');
 for(const reply of [{selectionCompleteInWindow:false,autoplayTailCount:45},{selectionCompleteInWindow:true,autoplayTailCount:-1},{selectionCompleteInWindow:true,autoplayTailCount:'45'}]){
  const g=fixture(),plan=await g.client.collection(tracks,'spotify:collection:tracks',{});g.respond({applied:3,verification:'visible-order',...reply});await assert.rejects(g.client.apply(plan,'ok','ok',{}));assert.equal(g.client.previous().phase,'unknown');
 }
 assert.deepEqual(safeDiagnostics({host:24,selectionCompleteInWindow:true,autoplayTailOnly:true,autoplayTailCount:45,matchingUpcomingPrefixCount:13,otherTailCount:0,token:'secret'}),{host:24,selectionCompleteInWindow:true,autoplayTailOnly:true,matchingUpcomingPrefixCount:13,autoplayTailCount:45,otherTailCount:0});
});

test('asynchronous observer capability and stage diagnostics are mandatory without accepting private state',async()=>{
 const f=fixture(),caps=await f.api.ShufflePlus.capabilities();delete caps.observerReadiness;f.calls.length=0;f.api.ShufflePlus.capabilities=async()=>caps;
 await assert.rejects(f.client.capabilities({}),/R24/);assert.equal(f.calls.length,0);
 const input={host:24,stage:'selected-queue',readbackStep:'selected-initial',playSent:true,queueSent:false,firstInitialStateReceived:true,queueInitialStateReceived:false,initialStateTimedOut:true,firstObserverEvents:2,queueObserverEvents:0,token:'private',initialState:{uri:'private'}};
 const expected={...input};delete expected.token;delete expected.initialState;assert.deepEqual(safeDiagnostics(input),expected);
 assert.equal(safeDiagnostics({...input,readbackStep:'private',queueObserverEvents:-1}).readbackStep,undefined);
 assert.equal(safeDiagnostics({...input,queueObserverEvents:-1}).queueObserverEvents,undefined);
});

for (const phase of ["complete", "reviewed"]) {
 test(`shuffle journal verifies ${phase} checkpoints before reporting success`,async()=>{
  const f=fixture(), p=await f.client.queue({});
  if(phase==="reviewed") {f.fail(new Error("SP_SHUFFLE_UNCONFIRMED_ORDER"));await assert.rejects(f.client.apply(p,"ok","ok",{}));}
  const set=f.api.Platform.Storage.set;
  f.api.Platform.Storage.set=(key,value)=>{if(value.phase!==phase)set(key,value);};
  if(phase==="complete") await assert.rejects(f.client.apply(p,"ok","ok",{}));
  else assert.throws(()=>f.client.acknowledge());
  assert.equal(f.client.needsReview(),true);
  assert.equal(f.calls.filter(c=>c.op==='shuffleplus.apply').length,1);
 });
}
test('shuffle failure checkpoint cannot replace the original outcome or expose storage details',async()=>{
 const f=fixture(),p=await f.client.queue({});f.fail(new Error('SP_SHUFFLE_UNCONFIRMED_ORDER'));
 const set=f.api.Platform.Storage.set;f.api.Platform.Storage.set=(key,value)=>{
  if(value.phase==='unknown')throw new Error('/private/account-secret');set(key,value);
 };
 await assert.rejects(f.client.apply(p,'ok','ok',{}),e=>e.message.includes('SP_SHUFFLE_UNCONFIRMED_ORDER')&&!e.message.includes('account-secret'));
 assert.equal(f.client.needsReview(),true);
});
test('shuffle initial checkpoint verifies the full record, including operation identity',async()=>{
 const f=fixture(),p=await f.client.queue({});const set=f.api.Platform.Storage.set;
 f.api.Platform.Storage.set=(key,value)=>set(key,{...value,requested:0});
 await assert.rejects(f.client.apply(p,'ok','ok',{}),/Nothing was sent/);
 assert.equal(f.calls.filter(c=>c.op==='shuffleplus.apply').length,0);
});


test('explicit test ranges retain order, preserve the full collection and do not imply playback',()=>{
 assert.deepEqual(playbackRange(10000,20),{count:500,part:0,from:0,to:20});
 assert.deepEqual(playbackRange(10001,20,500),{count:501,part:500,from:10000,to:10001});
 assert.deepEqual(playbackRange(14,20,2),{count:1,part:0,from:0,to:14});
 assert.deepEqual(playbackRange(10000,10000),{count:1,part:0,from:0,to:10000});
 for(const args of [[-1,20],[100001,20],[10000,0],[20,20,-1],[20,20,1.1]])assert.throws(()=>playbackRange(...args));
});
test('mismatch evidence remains redacted and never relabels a mismatch as success',()=>{
 const report={host:24,mode:'collection',errorCode:'SP_SHUFFLE_UNCONFIRMED_ORDER',firstMismatchUpcomingPosition:9,
 observedAtMismatchSelectionPosition:10,skippedSelectionPositions:1,unexpectedObservedCount:0,
 observedIsOrderedSubsequence:true,expectedAtMismatchSeenLater:false,mismatchIsQueued:true,
 mismatchItemKind:'track',mismatchProvider:'empty'};
 assert.deepEqual(safeDiagnostics({...report,uri:uri(1),metadata:{private:'secret'}}),report);
 assert.match(mismatchSummary(report),/upcoming position 9 \(song 10 in this preview\)/);
 assert.match(mismatchSummary(report),/does not establish/);
 assert.equal(mismatchSummary({...report,firstMismatchUpcomingPosition:0}),"");
 assert.equal(safeDiagnostics({...report,mismatchProvider:'private',mismatchItemKind:'secret'}).mismatchProvider,undefined);
});
