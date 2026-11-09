import test from "node:test";
import assert from "node:assert/strict";
import { DataClient } from "../shared/data.mjs";
import { normalizeTrack } from "../shared/model.mjs";
import { makeHttp, RequestError, Cache } from "../shared/net.mjs";
import { MusicBrainz } from "../shared/musicbrainz.mjs";
import { uriToHex } from "../shared/native-metadata.mjs";
const id = n => String(n).padStart(22, "0"), uri = n => `spotify:track:${id(n)}`;
const artistUri = `spotify:artist:${id(7)}`, copy = `spotify:playlist:${id(8)}`;
const track = n => normalizeTrack({uri:uri(n), name:`Song ${n}`, artists:[{name:"Artist", uri:artistUri}]});
const mbid = "01234567-0123-4567-89ab-0123456789ab";
function fixture(request = async () => { throw new RequestError("HTTP 404",404); }) {
  const values=new Map(), writes=[];
  const storage={get:k=>values.get(k),set:(k,v)=>values.set(k,structuredClone(v))};
  const api={Platform:{Storage:storage,Session:{accessToken:"private-token"}},
    User:{getCurrent:async()=>({username:"self"})},
    Internal:{getTrack:async()=>{throw new TypeError("private native exception");},getArtist:async()=>null},
    Player:{getState:()=>({contextUri:"spotify:collection:tracks"})},
    request: async(operation,args)=>{writes.push({operation,args});return operation==="playlists.create"?{uri:copy}:null;}};
  api.Playlists = { create: name => api.request("playlists.create", {name}), addTracks: (uri, uris) => api.request("playlists.addTracks", {uri, uris}) };
  return {api,values,writes,storage,client:new DataClient(api,request)};
}
test("track reads recover through raw Spotify metadata when the native bridge fails and Web reads are unavailable",async()=>{
  const calls=[];
  const {client}=fixture(async(url,options)=>{
    calls.push(url);assert.match(url,/spclient\.wg\.spotify\.com\/metadata\/4\/track\//);
    assert.equal(options.headers.Authorization,"Bearer private-token");
    return {name:"Recovered",duration:123000,artist:[{name:"Artist",gid:uriToHex(artistUri)}],album:{name:"Album"}};
  });
  const t=await client.track(uri(1),{});
  assert.equal(t.title,"Recovered");assert.equal(t.artists[0].uri,artistUri);assert.equal(t.explicit,null);assert.equal(calls.length,1);
});
test("raw artist genres recover when the host artist bridge is empty without requiring Web API reads",async()=>{
  const {client}=fixture(async url=>{assert.match(url,/metadata\/4\/artist\//);return {genre:["soul"]};});
  const result=await client.genres(track(1),{},{});assert.deepEqual(result.genres,["soul"]);assert.equal(result.genreSource,"Spotify artist genres");
});
test("complete liked membership survives metadata runtime/network failures, preserves URIs and supplied titles, and never guesses genres",async()=>{
  const {client}=fixture(async url=>{
    if(url.includes("context-resolve"))return {uri:"spotify:user:self:collection",metadata:{track_count:"3"},pages:[{tracks:[{uri:uri(1)},{uri:uri(2),metadata:{title:"Known title"}},{uri:uri(3)}]}]};
    throw new TypeError("fetch failed private-token");
  });
  const result=await client.likedSongs({},()=>{});
  assert.deepEqual(result.tracks.map(t=>t.uri),[uri(1),uri(2),uri(3)]);
  assert.equal(result.tracks[0].metadataUnavailable,true);assert.equal(result.tracks[1].title,"Known title");
  assert.equal(result.tracks[1].artist,"");assert.equal(result.skipped,0);
  assert.ok(!JSON.stringify(result).includes("private-token"));
  assert.deepEqual((await client.genres(result.tracks[0],{},{})).genres,[]);
});
test("metadata rate limiting still stops liked-song enrichment rather than relabelling the rows as unreadable",async()=>{
  const {client}=fixture(async url=>{
    if(url.includes("context-resolve"))return {pages:[{tracks:[{uri:uri(1)}]}]};
    throw new RequestError("HTTP 429",429);
  });
  await assert.rejects(client.likedSongs({},()=>{}),/429/);
});
test("read diagnostics classify network failures without copying raw exception credentials",async()=>{
  const request=makeHttp(async()=>{const e=new TypeError("fetch secret-token?api_key=private");e.cause={code:"ENOTFOUND"};throw e;});
  await assert.rejects(request("https://api.spotify.com/v1/me"),e=>e.message.includes("DNS lookup failed")&&!e.message.includes("secret-token")&&!e.message.includes("private"));
});
test("HTTP success is determined by numeric status and malformed JSON has a controlled diagnostic",async()=>{
  const request=makeHttp(async()=>({status:200,json:async()=>({value:1})}));
  assert.deepEqual(await request("https://api.spotify.com/v1/me"),{value:1});
  const bad=makeHttp(async()=>({status:200,json:async()=>{throw new SyntaxError("private payload");}}));
  await assert.rejects(bad("https://api.spotify.com/v1/me"),e=>/invalid JSON/.test(e.message)&&!e.message.includes("private payload"));
});
test("the read helper works with actual Node fetch without sending an incompatible polyfilled signal",async()=>{
  const realFetch=globalThis.fetch;
  const request=makeHttp((_url,options)=>realFetch("data:application/json,%7B%22value%22%3A1%7D",options));
  assert.deepEqual(await request("https://api.spotify.com/v1/me"),{value:1});
});
test("native copies await each server acknowledgment and only add ordered batches to their newly created playlist",async()=>{
  const {client,api,values,writes}=fixture();let release;
  api.request=async(operation,args)=>{
    const journal=values.get("last-write-v1");assert.ok(journal,"journal exists before a write");writes.push({operation,args});
    if(operation==="playlists.create")return {uri:copy};
    if(writes.length===2)await new Promise(resolve=>release=resolve);
    return null;
  };
  const promise=client.nativeCopy(Array.from({length:201},(_,i)=>track(i+1)),"Copy","yes","yes",{});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(values.get("last-write-v1").completed,0);assert.equal(writes.length,2);release();
  const result=await promise;assert.equal(result.completed,201);assert.equal(result.phase,"complete");
  assert.deepEqual(writes.slice(1).map(w=>w.args.uris.length),[100,100,1]);
  assert.ok(writes.slice(1).every(w=>w.operation==="playlists.addTracks"&&w.args.uri===copy));
  assert.deepEqual(writes.slice(1).flatMap(w=>w.args.uris),Array.from({length:201},(_,i)=>uri(i+1)));
});
test("lost native write acknowledgment records an unknown outcome and does not retry or change transport",async()=>{
  const {client,api,values,writes}=fixture(()=>assert.fail("no HTTP fallback after a native write"));
  api.request=async(operation,args)=>{writes.push({operation,args});if(operation==="playlists.create")return {uri:copy};if(writes.length===3)throw new Error("bridge connection lost private-token");return null;};
  await assert.rejects(client.nativeCopy(Array.from({length:201},(_,i)=>track(i+1)),"Copy","yes","yes",{}),e=>!e.message.includes("private-token")&&e.message.includes("100/201"));
  assert.equal(writes.length,3);assert.equal(values.get("last-write-v1").phase,"unknown");assert.equal(values.get("last-write-v1").completed,100);
});
test("native copies require confirmation and cancellation prevents any write",async()=>{
  const {client,writes}=fixture();
  await assert.rejects(client.nativeCopy([track(1)],"Copy","no","yes",{}));
  await assert.rejects(client.nativeCopy([track(1)],"Copy","yes","yes",{cancelled:true}),/cancelled/);
  assert.equal(writes.length,0);
});
test("R12 pre-dispatch failures stop safely and name the failed creation step",async()=>{
  const {client,api,values,writes}=fixture(()=>assert.fail("no automatic fallback"));
  api.request=async(operation,args)=>{writes.push({operation,args});throw new Error("SP_PLAYLIST_PREPARE");};
  await assert.rejects(client.nativeCopy([track(1)],"Copy","yes","yes",{}),/Creating the new copy:.*nothing was sent for this step/);
  assert.equal(writes.length,1);assert.equal(values.get("last-write-v1").phase,"stopped");
});
test("R12 failures distinguish rejected batches from lost RPC and invalid acknowledgments",async()=>{
  for(const [code,phase] of [["REJECTED_403","stopped"],["RPC","unknown"],["ACK","unknown"]]){
    const {client,api,values,writes}=fixture(()=>assert.fail("no automatic fallback"));
    api.request=async(operation,args)=>{writes.push({operation,args});if(operation==="playlists.create")return {uri:copy};if(writes.length===3)throw new Error(`SP_PLAYLIST_${code}`);return null;};
    await assert.rejects(client.nativeCopy(Array.from({length:201},(_,i)=>track(i+1)),"Copy","yes","yes",{}),e=>e.message.includes("Adding tracks to the new copy:")&&e.message.includes("100/201")&&e.message.includes(copy));
    assert.equal(writes.length,3);assert.equal(values.get("last-write-v1").phase,phase);assert.equal(values.get("last-write-v1").completed,100);
  }
});
function mbFixture(respond){
  const {storage}=fixture(),cache=new Cache(storage,"test");let now=0;const times=[],calls=[];
  const client=new MusicBrainz(async(url,options)=>{times.push(now);calls.push({url,options});return respond(url,options);},cache,{now:()=>now,wait:async delay=>{now+=delay;}});
  return {client,times,calls};
}
test("MusicBrainz opt-in reads identify an exact Spotify artist relation, rate-space requests and cache real genres without Spotify credentials",async()=>{
  const {client,times,calls}=mbFixture((url,options)=>{
    assert.equal(options.headers.Authorization,undefined);assert.match(options.headers["User-Agent"],/SpotifyPlusLocalExtensions/);
    return url.includes("query=")?{count:1,artists:[{id:mbid,name:"Artist",score:100}]}:{id:mbid,name:"Artist",genres:[{name:"soul",count:3},{name:"bad tag",count:-1}],relations:[{url:{resource:`https://open.spotify.com/artist/${id(7)}`}}]};
  });
  const result=await client.artist(track(1),{});assert.deepEqual(result.genres,["soul"]);assert.equal(times[1]-times[0],1100);
  await client.artist(track(2),{});assert.equal(calls.length,2);
});
test("MusicBrainz rejects ambiguous exact names and mismatched Spotify identities rather than guessing",async()=>{
  const ambiguous=mbFixture(()=>({count:2,artists:[{id:mbid,name:"Artist",score:100},{id:"11234567-0123-4567-89ab-0123456789ab",name:"Artist",score:100}]}));
  await assert.rejects(ambiguous.client.artist(track(1),{}),/unique exact/);
  const mismatch=mbFixture(url=>url.includes("query=")?{count:1,artists:[{id:mbid,name:"Artist",score:100}]}:{id:mbid,name:"Artist",genres:[{name:"rock",count:1}],relations:[]});
  await assert.rejects(mismatch.client.artist(track(1),{}),/did not confirm/);
});
test("MusicBrainz has no traffic until explicitly enabled and a provider 429 stops classification",async()=>{
  const {client}=fixture(async url=>{assert.ok(!url.includes("musicbrainz"));throw new RequestError("404",404);});
  await client.genres(track(1),{},{});
  client.musicbrainz=new MusicBrainz(async()=>{throw new RequestError("429",429);},client.cache);
  await assert.rejects(client.genres(track(2),{musicbrainz:true},{}),/429/);
});

test("a successful write with an invalid JSON response remains uncertain and is never repeated",async()=>{
  let calls=0;
  const request=makeHttp(async()=>{calls++;return {status:201,json:async()=>{throw new SyntaxError("private response");}};});
  await assert.rejects(request("https://api.spotify.com/v1/me/playlists",{method:"POST"}),e=>e.unknown===true&&!e.message.includes("private response"));
  assert.equal(calls,1);
});
test("a successful Web create response without a playlist ID remains an unknown outcome",async()=>{
  let calls=0;
  const {client,values}=fixture(async()=>{calls++;return {};});
  await assert.rejects(client.createCopy([track(1)],"Copy","yes","yes",{}),/outcome is unknown/);
  assert.equal(calls,1);assert.equal(values.get("last-write-v1").phase,"unknown");
});


test("retained liked-song metadata failures are accurate, DNS-specific and recover on a new read",async()=>{
 let online=false;
 const {client,writes}=fixture(makeHttp(async()=>{
  if(!online){const error=new Error("private-token in URL");error.cause={code:"ENOTFOUND"};throw error;}
  return {status:200,json:async()=>({name:"Recovered",artist:[{name:"Artist"}]})};
 }));
 const rows=[{uri:uri(1),addedAt:42},{uri:uri(2),addedAt:43}];
 const failed=await client.hydrateLikes(rows,{},()=>{});
 assert.deepEqual(failed.map(t=>t.uri),rows.map(t=>t.uri));
 for(const t of failed){
  assert.equal(t.metadataUnavailable,true);assert.equal(t.available,null);
  assert.match(t.metadataStatus,/DNS lookup failed/);
  assert.doesNotMatch(t.metadataStatus,/Track 1|No partial preview|private-token/);
  assert.match(t.metadataStatus,/saved song remains/i);
 }
 online=true;const recovered=await client.hydrateLikes(rows,{},()=>{});
 assert.ok(recovered.every(t=>t.title==="Recovered"&&!t.metadataUnavailable));
 assert.deepEqual(recovered.map(t=>t.addedAt),[42,43]);assert.deepEqual(writes,[]);
});
