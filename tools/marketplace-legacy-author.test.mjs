import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
test('installed marketplace cards render both delivered string authors and upstream author arrays',async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../../../../../../../scripts/marketplace/src/installed-page.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['spotifyplus','spotifyplus/*','react','react/*']});
 const installed=[{id:'legacy',name:'Legacy',version:'1',author:'Legacy developer'},{id:'current',name:'Current',version:'1',author:[{name:'Current developer',url:'https://example.com'}]}];
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,console,
  __spotifyplus_elevated__:{listInstalledExtensions:()=>installed},
  require:name=>{
   if(name==='react')return {useState:v=>[Array.isArray(v)?installed:typeof v==='function'?v():v,()=>{}],useMemo:f=>f(),useEffect(){}};
   if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
   if(name==='spotifyplus')return {SpotifyPlus:{version:2,Assets:{image:p=>p},Platform:{PlatformData:{clientVersion:'9.1.94.1929'}}}};
   if(name==='spotifyplus/react/reanimated')return {};
   if(name==='spotifyplus/react')return {View:'View',Text:'Text',ScrollView:'ScrollView',Image:'Image',Pressable:'Pressable'};
   throw Error(name);
  }});
 const tree=module.exports.default({extensions:[],updateState:{checking:false,updates:[],failed:[],unknownSource:[]},onCheckUpdates(){},onInstalledChanged(){},onSelectExtension(){}});
 const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(typeof node.type==='function'?node.type(node.props):node.props?.children):String(node??'');
 const rendered=text(tree);assert.match(rendered,/Legacy developer/);assert.match(rendered,/Current developer/);
});
