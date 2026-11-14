package com.lenerd.spotifyplus.module.hooks;
import com.lenerd.spotifyplus.module.*;
import com.lenerd.spotifyplus.module.scripting.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** API-2 extension menu registration and bounded visibility evaluation. */
public final class ContextMenuHook extends SpotifyHook {
    private static final List<ScriptContextMenu> menus=new CopyOnWriteArrayList<>();
    private static final ConcurrentHashMap<String,CompletableFuture<Set<String>>> pending=new ConcurrentHashMap<>();
    private static final Map<Object,String> headerUris=Collections.synchronizedMap(new WeakHashMap<>());
    public static void recordHeaderUri(Object header,String uri){if(header!=null&&uri!=null)headerUris.put(header,uri);}
    public static String uriForHeader(Object header){return header==null?null:headerUris.get(header);}
    protected void hookSetup(){SpotifyNativeBridge.registerHandler("menu",this);}
    protected void beforeHook(SpotifyCallback p){}protected void afterHook(SpotifyCallback p){}
    public Object handle(String command,Object[] args){try{
        if(command.equals("register")){
            ScriptContextMenu menu;
            if(args[0] instanceof JSONObject data){Set<String> types=null;JSONArray values=data.optJSONArray("types");if(values!=null){types=new HashSet<>();for(int i=0;i<values.length();i++)types.add(values.getString(i));}
                String iconAssetId=data.optString("iconAssetId",null);if(iconAssetId!=null&&iconAssetId.isEmpty())iconAssetId=null;
                menu=new ScriptContextMenu(data.getString("id"),data.getString("scriptId"),data.getString("title"),types,data.optBoolean("hasCallback"),data.optBoolean("disabled"),iconAssetId);
            }else menu=new ScriptContextMenu((String)args[0],(String)args[1],(String)args[2]);
            menus.removeIf(m->m.id.equals(menu.id)&&m.scriptId.equals(menu.scriptId));menus.add(menu);
        }else if(command.equals("unregisterScript"))menus.removeIf(m->m.scriptId.equals(args[0]));
        else if(command.equals("visibilityResult")){
            JSONObject data=(JSONObject)args[0];CompletableFuture<Set<String>> f=pending.get(data.getString("requestId"));
            if(f!=null){Set<String> visible=new HashSet<>();JSONArray values=data.getJSONArray("visible");for(int i=0;i<values.length();i++)visible.add(values.getString(i));f.complete(visible);}
        }
    }catch(Exception e){logError(e);}return null;}
    public static List<ScriptContextMenu> visible(String uri){
        List<ScriptContextMenu> candidates=menus.stream().filter(m->!m.disabled&&m.matchesUri(uri)).toList();
        if(candidates.isEmpty())return List.of();
        Set<String> fallback=new HashSet<>();JSONArray ids=new JSONArray();for(ScriptContextMenu m:candidates){ids.put(m.id);if(!m.hasCallback)fallback.add(m.id);}
        String request=UUID.randomUUID().toString();CompletableFuture<Set<String>> f=new CompletableFuture<>();pending.put(request,f);
        Set<String> visible=fallback;
        try{SpotifyNativeBridge.sendEvent("menu.visibility",new JSONObject().put("requestId",request).put("ids",ids).put("uri",uri).put("contextUri",uri).toString());visible=f.get(150,TimeUnit.MILLISECONDS);}
        catch(InterruptedException e){Thread.currentThread().interrupt();}catch(Exception ignored){}finally{pending.remove(request);}
        Set<String> selected=visible;return candidates.stream().filter(m->selected.contains(m.id)&&SpotifyNativeBridge.nativeMenuVisible(m.scriptId,m.id,uri)).toList();
    }
    public static void press(ScriptContextMenu menu,String uri){try{SpotifyNativeBridge.sendJsonEvent("menu.press",new JSONObject().put("id",menu.id).put("scriptId",menu.scriptId).put("uri",uri).put("contextUri",uri));}catch(Exception e){logError(e);}}
}
