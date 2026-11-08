#!/usr/bin/env python3
"""Check native PlayCommand signatures against the exact original Spotify APK."""
from pathlib import Path
import json,zipfile

def verify(path):
 from loguru import logger
 logger.disable('androguard')
 from androguard.core.dex import DEX
 model='Lcom/spotify/player/model/'
 required={
  model+'Context$Builder;':('pages','(Ljava/util/List;)'),
  model+'ContextPage$Builder;':('tracks','(Ljava/util/List;)'),
  model+'ContextTrack$Builder;':('uid','(Ljava/lang/String;)'),
  model+'command/options/PreparePlayOptions$Builder;':('initiallyPaused','(Z)'),
  model+'PlayOrigin$Builder;':('viewUri','(Ljava/lang/String;)'),
  model+'command/options/PlayerOptionOverrides$Builder;':('shufflingContext','(Ljava/lang/Boolean;)'),
  model+'command/options/SkipToTrack;':('fromIndices','(Ljava/lang/Long;Ljava/lang/Long;)'),
 }
 classes={};checked=set();command=model+'command/PlayCommand;';single='Lio/reactivex/rxjava3/core/Single;'
 with zipfile.ZipFile(path) as z:
  for name in z.namelist():
   if not name.endswith('.dex') or '/' in name:continue
   data=z.read(name)
   # Only DEX files that can define a required model or reference PlayCommand.
   if not any(t[1:].encode() in data for t in [*required,command,'Lcom/spotify/esperanto/esperanto/ClientBase;']):continue
   dex=DEX(data)
   for c in dex.get_classes():
    methods=[(m.get_name(),m.get_descriptor().replace(' ',''),m.get_access_flags()) for m in c.get_methods()]
    classes[c.get_name()]={'base':c.get_superclassname(),'fields':[f.get_descriptor() for f in c.get_fields()],'methods':methods,'flags':c.get_access_flags()}
    if c.get_name() in required:
     n,signature=required[c.get_name()]
     assert any(m==n and d.startswith(signature) for m,d,_ in methods),'Missing native model builder: '+c.get_name()
     checked.add(c.get_name())
 assert checked==set(required),'Native model schema incomplete'
 def client(t):
  seen=set()
  while t and t not in seen:
   if t=='Lcom/spotify/esperanto/esperanto/ClientBase;':return True
   seen.add(t);t=classes.get(t,{}).get('base')
  return False
 owners=[]
 for name,c in classes.items():
  if c['flags'] & (0x200|0x400):continue
  methods=[(m,d) for m,d,flags in c['methods'] if not flags&(8|0x40) and d=='('+command+')'+single]
  if methods and any(client(t) for t in c['fields']):
   assert len(methods)==1,'Ambiguous native PlayCommand method'
   owners.append((name,methods[0][0]))
 assert len(owners)==1,'Expected one concrete PlayCommand handler; found '+str(len(owners))
 return {'passed':True,'handler':owners[0][0],'method':owners[0][1],'model_checks':len(checked)}

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('apk',type=Path);args=p.parse_args();print(json.dumps(verify(args.apk)))
