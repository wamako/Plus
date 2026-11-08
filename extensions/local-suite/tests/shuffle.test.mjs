import test from 'node:test';
import assert from 'node:assert/strict';
import {permutation,shuffleTracks,ShuffleClient,shuffleError} from '../shared/shuffle.mjs';
const uri=n=>'spotify:track:'+String(n).padStart(22,'0');
const tracks=[1,1,2].map((n,i)=>({uri:uri(n),title:'Song '+n,artist:'Artist',occurrence:i}));
const ticket='12345678-1234-1234-1234-123456789abc';
function fixture(){
 const values=new Map(),calls=[];let failure=null,response;
 const api={Platform:{Storage:{get:k=>values.get(k),set:(k,v)=>values.set(k,structuredClone(v))}},
  request:async(op,args)=>{
   calls.push({op,args});
   if(op==='shuffleplus.capabilities')return {version:1,host:17,route:"native-play-command",queueMode:"native-editor-options",playerReady:true,limit:10000};
   if(op==='shuffleplus.queue')return {mode:'queue',ticket,count:3,tracks};
   if(op==='shuffleplus.prepare')return {mode:'collection',ticket,count:args.uris.length};
   assert.equal(op,'shuffleplus.apply');assert.equal(values.get('shuffle-write-v1').phase,'pending');
   if(failure)throw failure;return response||{applied:args.order.length,verification:"visible-order"};
  }};
 api.ShufflePlus={capabilities:()=>api.request('shuffleplus.capabilities'),previewQueue:()=>api.request('shuffleplus.queue'),prepare:(context,uris)=>api.request('shuffleplus.prepare',{context,uris}),apply:(ticket,order)=>api.request('shuffleplus.apply',{ticket,order})};
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
 for(const [message,phase] of [['SP_SHUFFLE_STALE_ORDER','stopped'],['SP_SHUFFLE_STALE_OWNER','stopped'],['SP_SHUFFLE_STALE_OPTIONS','stopped'],['SP_SHUFFLE_STALE_PLAYER','stopped'],['SP_SHUFFLE_STALE','stopped'],['SP_SHUFFLE_FORBIDDEN','stopped'],['SP_SHUFFLE_RPC','unknown'],['SP_SHUFFLE_ACK','unknown'],['SP_SHUFFLE_UNCONFIRMED','unknown'],['SP_SHUFFLE_USED','unknown'],['private-token and private-account','unknown']]){
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
 const old=new ShuffleClient({request:async()=>{throw new Error('Unknown operation')},Platform:f.api.Platform});await assert.rejects(old.queue({}),/R17/);
 assert.equal(shuffleError(new Error('SP_SHUFFLE_RPC'),true).unknown,true);
});

test('old host and count-only success replies cannot claim verified playback',async()=>{
 const f=fixture();f.api.ShufflePlus.capabilities=async()=>({version:1,host:13,limit:10000});
 await assert.rejects(f.client.capabilities({}),/R17/);assert.equal(f.calls.length,0);
 const g=fixture(),p=await g.client.queue({});g.respond({applied:3});
 await assert.rejects(g.client.apply(p,'ok','ok',{}));assert.equal(g.client.previous().phase,'unknown');
 assert.equal(g.calls.filter(c=>c.op==='shuffleplus.apply').length,1);
});
