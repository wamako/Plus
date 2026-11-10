import test from "node:test";
import assert from "node:assert/strict";
import { storedText, writeTextSetting, apiKeyIssue, usernameIssue } from "../shared/settings.mjs";
import { DataClient } from "../shared/data.mjs";
import { RequestError } from "../shared/net.mjs";
import { normalizeTrack } from "../shared/model.mjs";
const key = "0123456789abcdef0123456789abcdef";
const id = n => String(n).padStart(22,"0");
const track = n => normalizeTrack({uri:`spotify:track:${id(n)}`,name:`Song ${n}`,artists:[{name:"Artist",uri:`spotify:artist:${id(7)}`}],album:{name:"Album"}});
function fixture(request, genres = ["soul"]) {
  const values = new Map([["lastfm-key",key]]);
  const storage = {get:k=>values.get(k),set:(k,v)=>values.set(k,structuredClone(v)),remove:k=>values.delete(k)};
  const api = {Platform:{Session:{accessToken:"spotify-private"},Storage:storage},Internal:{getArtist:async()=>({genre:genres})}};
  return {values,storage,client:new DataClient(api,request)};
}
test("text settings round-trip through storage and the empty account option removes the override",()=>{
  const {storage,values}=fixture();
  assert.equal(writeTextSetting(storage,"liked-username","account"),"account");
  assert.equal(storedText(storage,"liked-username"),"account");
  writeTextSetting(storage,"liked-username","");
  assert.equal(values.has("liked-username"),false);
});
test("read-back rejects dropped writes, failed removals and unavailable storage",()=>{
  const ignored={get:()=>"previous",set:()=>{},remove:()=>{}};
  assert.throws(()=>writeTextSetting(ignored,"setting","new"),/verified/);
  assert.throws(()=>writeTextSetting(ignored,"setting",""),/verified/);
  assert.throws(()=>writeTextSetting({set:()=>{throw new Error("offline");}},"setting","new"));
});
test("legacy malformed stored values are never passed to text fields or trim",()=>{
  assert.equal(storedText({get:()=>({text:"old"})},"setting"),"");
  assert.equal(storedText({get:()=>{throw new Error("offline");}},"setting"),"");
  assert.throws(()=>writeTextSetting({},"setting",{}),/Invalid/);
});
test("API key and optional Spotify username validation never includes private input in feedback",()=>{
  assert.equal(apiKeyIssue(key),"");assert.match(apiKeyIssue("private-invalid-key"),/32-character/);
  assert.ok(!apiKeyIssue("private-invalid-key").includes("private-invalid-key"));
  assert.equal(usernameIssue(""),"");assert.equal(usernameIssue("account-123"),"");
  assert.ok(usernameIssue("https://open.spotify.com/user/account"));assert.ok(usernameIssue("display name"));
});
test("Last.fm HTTP 503 falls through to Spotify genres, keeps the saved key and emits a controlled warning",async()=>{
  const {client,values}=fixture(async url=>{assert.ok(url.startsWith("https://ws.audioscrobbler.com/"));throw new RequestError("raw private gateway detail",503);});
  const result=await client.genres(track(1),{key,lastfmFirst:true},{});
  assert.deepEqual(result.genres,["soul"]);assert.equal(result.genreSource,"Spotify artist genres");
  assert.match(result.genreStatus,/Last.fm.*503/);assert.ok(!JSON.stringify(result).includes(key));
  assert.equal(values.get("lastfm-key"),key);
  const cached=client.cache.get(`genres:lastfm-first:lastfm:no-mb:${track(1).uri}`);
  assert.equal(cached.genreStatus,"","temporary provider warning is not persisted with successful genres");
});
test("an outage does not produce one Last.fm request per song in a large classification",async()=>{
  let calls=0;
  const {client}=fixture(async()=>{calls++;throw new RequestError("503",503);});
  const results=await client.classify(Array.from({length:100},(_,i)=>track(i+1)),{key,lastfmFirst:true},{},()=>{});
  assert.equal(results.length,100);assert.ok(results.every(t=>t.genres.includes("soul")));
  assert.ok(calls>=1&&calls<=2);
});
test("Last.fm outage falls through to enabled MusicBrainz when Spotify has no genre data",async()=>{
  const {client}=fixture(async url=>{if(url.includes("audioscrobbler"))throw new RequestError("503",503);throw new RequestError("404",404);},[]);
  client.musicbrainz.artist=async()=>({genres:["jazz"],genreSource:"MusicBrainz artist genres"});
  const result=await client.genres(track(1),{key,lastfmFirst:true,musicbrainz:true},{});
  assert.deepEqual(result.genres,["jazz"]);assert.match(result.genreStatus,/503/);
});
test("an unavailable Last.fm with no alternative genres retains Unknown rows instead of aborting the library",async()=>{
  const {client,values}=fixture(async url=>{throw new RequestError("unavailable",url.includes("audioscrobbler")?503:404);},[]);
  const result=await client.classify([track(1),track(2)],{key,lastfmFirst:true},{},()=>{});
  assert.equal(result.length,2);assert.ok(result.every(t=>t.genres.length===0));
  assert.ok(result.every(t=>t.genreStatus.includes("503")));assert.equal(values.get("lastfm-key"),key);
});
test("Last.fm authentication failures remain visible, and a changed key bypasses the cooldown",async()=>{
  let calls=0;
  const {client}=fixture(async()=>{calls++;return calls===1?{error:10}:{toptags:{tag:[{name:"jazz"}]}};});
  const first=await client.genres(track(1),{key,lastfmFirst:true},{});
  assert.match(first.genreStatus,/code 10/);assert.ok(!first.genreStatus.includes("temporarily"));
  await client.genres(track(2),{key,lastfmFirst:true},{});assert.equal(calls,1);
  const fixed=await client.genres(track(3),{key:"abcdef0123456789abcdef0123456789",lastfmFirst:true},{});
  assert.deepEqual(fixed.genres,["jazz"]);assert.equal(calls,2);
});
test("Last.fm rate limits and cancellation still stop work rather than triggering further providers",async()=>{
  const limited=fixture(async()=>{throw new RequestError("429",429);});
  limited.client.artistGenres=()=>assert.fail("no fallback after 429");
  await assert.rejects(limited.client.genres(track(1),{key,lastfmFirst:true},{}),/429/);
  const job={cancelled:false};
  const cancelled=fixture(async()=>{job.cancelled=true;throw new RequestError("503",503);});
  cancelled.client.artistGenres=()=>assert.fail("no fallback after cancellation");
  await assert.rejects(cancelled.client.genres(track(1),{key,lastfmFirst:true},job),/cancelled/);
});
test("Last.fm ranking errors describe temporary unavailability without changing stored credentials",async()=>{
  const {client,values}=fixture(async()=>{throw new RequestError("503",503);});
  await assert.rejects(client.top("lastfm","account",key),e=>e.status===503&&/temporarily unavailable/.test(e.message)&&!e.message.includes(key));
  assert.equal(values.get("lastfm-key"),key);
});
