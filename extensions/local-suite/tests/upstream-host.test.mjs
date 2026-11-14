import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import Module from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const suite=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sdk=fs.realpathSync(process.env.SPOTIFYPLUS_SDK_SOURCE||path.join(suite,'node_modules/spotifyplus'));
process.env.NODE_PATH=path.join(sdk,'node_modules');Module._initPaths();
const runtime=path.resolve(sdk,'../nodejs');
const {HostRuntime}=await import(pathToFileURL(path.join(runtime,'loader/host-runtime.js')));
const {parseManifest}=await import(pathToFileURL(path.join(runtime,'loader/script-manifest.js')));
const base={id:'com.test.port',name:'Test',version:'1.0',main:'index.js',api:2};
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'plus-backport-'));
 const host=Object.create(HostRuntime.prototype);let failActivate=false;const loads=[];
 host.config={installedRoot:root};host.registry={getScript:()=>undefined};host.activeSurfaces=new Map();host.unregisterScript=()=>{};
 host.logger={info(){},warn(){},error(){}};
 host.scriptLoader={preflightSource(_d,m,source){new vm.Script(source);return m;},loadScript(directory){if(failActivate)throw new Error('activation refused');loads.push(directory);}};
 return {root,host,loads,fail:()=>failActivate=true,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const pack=(code,source={owner:'owner',name:'repo',branch:'main'})=>({manifest:base,source,files:[{path:'index.js',data:Buffer.from(code)}]});
test('pinned real parser keeps legacy authors and accepts the new upstream author arrays',()=>{
 assert.equal(parseManifest({...base,author:'Legacy'}).author,'Legacy');
 assert.equal(parseManifest({...base,author:[{name:'Current',url:'https://example.com'}]}).author,'Current');
 assert.throws(()=>parseManifest({...base,author:[{name:'Missing URL'}]}));
});
test('actual installer records repository source, reads main and permits same-version code updates',()=>{
 const f=fixture();try{
  let installed=f.host.installExtension(pack('module.exports=1;'));assert.equal(installed.source.owner,'owner');assert.equal(installed.main,'index.js');
  assert.equal(f.host.readInstalledExtensionMain(base.id),'module.exports=1;');
  installed=f.host.installExtension(pack('module.exports=2;',{owner:'owner',name:'repo',branch:'release'}));
  assert.equal(f.host.readInstalledExtensionMain(base.id),'module.exports=2;');
  assert.equal(f.host.listInstalledExtensions()[0].source.branch,'release');assert.equal(f.loads.length,2);
 }finally{f.close();}
});
test('failed package preflight retains installed code and its saved update source',()=>{
 const f=fixture();try{
  f.host.installExtension(pack('module.exports=1;'));
  assert.throws(()=>f.host.installExtension(pack('invalid (')));
  assert.equal(f.host.readInstalledExtensionMain(base.id),'module.exports=1;');assert.equal(f.host.listInstalledExtensions()[0].source.branch,'main');
 }finally{f.close();}
});
test('activation failure rolls back the whole package including repository provenance',()=>{
 const f=fixture();try{
  f.host.installExtension(pack('module.exports=1;'));f.fail();
  assert.throws(()=>f.host.installExtension(pack('module.exports=2;',{owner:'other',name:'repo',branch:'release'})),/activation/);
  assert.equal(f.host.readInstalledExtensionMain(base.id),'module.exports=1;');assert.equal(f.host.listInstalledExtensions()[0].source.owner,'owner');
 }finally{f.close();}
});
test('invalid update repositories and paths cannot write outside the installed extension',()=>{
 const f=fixture();try{
  assert.throws(()=>f.host.installExtension(pack('module.exports=1;',{owner:'../outside',name:'repo',branch:'main'})));
  assert.deepEqual(fs.readdirSync(f.root),[]);assert.throws(()=>f.host.readInstalledExtensionMain('../outside'));
 }finally{f.close();}
});
