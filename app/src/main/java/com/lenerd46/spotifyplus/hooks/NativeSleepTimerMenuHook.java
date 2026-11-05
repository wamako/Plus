package com.lenerd46.spotifyplus.hooks;

import android.content.Context;
import com.lenerd46.spotifyplus.features.*;
import de.robv.android.xposed.*;
import org.json.*;
import org.luckypray.dexkit.query.*;
import org.luckypray.dexkit.query.matchers.*;
import org.luckypray.dexkit.result.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.function.Predicate;

/** Spotify 9.1.94: augment the instance state builder without replacing native row actions. */
public final class NativeSleepTimerMenuHook extends SpotifyHook {
    private final Context context;
    private final ThreadLocal<Integer> building=ThreadLocal.withInitial(()->0);
    public NativeSleepTimerMenuHook(Context context){this.context=context;}
    protected void hook() throws Exception {
        ClassData component=bridge.findClass(FindClass.create().matcher(ClassMatcher.create().usingStrings("createState(Lcom/spotify/podcastexperience/sleeptimermenuimpl/page/SleepTimerMenuElement$Props;)Lcom/spotify/podcastexperience/sleeptimermenuimpl/page/SleepTimerMenuElement$State;"))).single();
        List<MethodData> candidates=bridge.findMethod(FindMethod.create().searchInClass(Collections.singletonList(component)).matcher(MethodMatcher.create().paramCount(1)));
        MethodData builder=one(candidates,m->!m.isConstructor()&&m.getInvokes().stream().anyMatch(NativeSleepTimerMenuHook::durationConstructor),"native timer state builder");
        MethodData durationData=one(builder.getInvokes(),NativeSleepTimerMenuHook::durationConstructor,"duration row constructor");
        Constructor<?> durationConstructor=durationData.getConstructorInstance(lpparm.classLoader);
        Class<?> durationType=durationConstructor.getDeclaringClass();
        Field durationField=Arrays.stream(durationType.getDeclaredFields()).filter(f->!Modifier.isStatic(f.getModifiers())&&f.getType()==long.class).findFirst().orElseThrow();durationField.setAccessible(true);
        Method factory=one(builder.getInvokes(),m->m.isMethod()&&m.getReturnTypeName().equals("long")&&m.getParamTypeNames().size()==2&&m.getParamTypeNames().get(0).equals("int"),"duration factory").getMethodInstance(lpparm.classLoader);
        Class<?> unit=factory.getParameterTypes()[1];
        @SuppressWarnings({"unchecked","rawtypes"}) Object minutes=Enum.valueOf((Class)unit,"MINUTES");
        Constructor<?> stateConstructor=one(builder.getInvokes(),m->m.isConstructor()&&m.getClassName().equals(builder.getReturnTypeName()),"timer state constructor").getConstructorInstance(lpparm.classLoader);
        Class<?>[] stateParameters=stateConstructor.getParameterTypes();int listIndex=-1;
        for(int i=0;i<stateParameters.length;i++)if(List.class.isAssignableFrom(stateParameters[i])){if(listIndex!=-1)throw new IllegalStateException("Ambiguous timer list parameter");listIndex=i;}
        if(listIndex<0)throw new IllegalStateException("Missing native timer list parameter");final int index=listIndex;
        String listType=stateParameters[index].getName();
        Method create=one(builder.getInvokes(),m->m.isMethod()&&m.getReturnTypeName().equals(listType)&&m.getParamTypeNames().isEmpty(),"native list factory").getMethodInstance(lpparm.classLoader);
        Method finish=one(builder.getInvokes(),m->m.isMethod()&&m.getReturnTypeName().equals(listType)&&m.getParamTypeNames().equals(List.of("java.util.List")),"native list seal").getMethodInstance(lpparm.classLoader);
        factory.setAccessible(true);create.setAccessible(true);finish.setAccessible(true);durationConstructor.setAccessible(true);
        XposedBridge.hookMethod(stateConstructor,new XC_MethodHook(){protected void beforeHookedMethod(MethodHookParam param){
            if(building.get()==0||!(param.args[index] instanceof List))return;
            try{
                List<Object> nativeRows=new ArrayList<>((List<?>)param.args[index]);List<Object> extra=new ArrayList<>();
                JSONArray stored=new JSONArray(context.getSharedPreferences("SpotifyPlus",Context.MODE_PRIVATE).getString("custom_sleep_timers","[]"));
                for(int i=0;i<stored.length();i++){JSONObject row=stored.getJSONObject(i);try{long amount=SleepTimerState.minutes(row.get("value").toString(),row.optBoolean("unit"));extra.add(durationConstructor.newInstance(factory.invoke(null,(int)amount,minutes)));}catch(Exception invalid){XposedBridge.log("[SpotifyPlus][NativeTimer] Invalid saved duration ignored");}}
                List<Object> merged=NativeTimerPresets.merge(nativeRows,extra,row->{if(!durationType.isInstance(row))return null;try{return durationField.getLong(row);}catch(IllegalAccessException e){throw new IllegalStateException(e);}});
                if(merged.size()==nativeRows.size())return;
                Object list=create.invoke(null);Method add=list.getClass().getMethod("add",Object.class);add.setAccessible(true);
                for(Object row:merged)add.invoke(list,row);
                param.args[index]=finish.invoke(null,list);
            }catch(Throwable error){XposedBridge.log("[SpotifyPlus][NativeTimer] Keeping native menu: "+error);}
        }});
        XposedBridge.hookMethod(builder.getMethodInstance(lpparm.classLoader),new XC_MethodHook(){protected void beforeHookedMethod(MethodHookParam p){building.set(building.get()+1);}protected void afterHookedMethod(MethodHookParam p){int depth=building.get()-1;if(depth<=0)building.remove();else building.set(depth);}});
        // A native duration selection supersedes the separate one-time manager alarm.
        try{
            int message=context.getResources().getIdentifier("context_menu_sleep_timer_select_message","string","com.spotify.music");
            if(message!=0){
                List<MethodData> clicks=bridge.findMethod(FindMethod.create().matcher(MethodMatcher.create().name("invokeSuspend").usingNumbers(message)));
                List<MethodData> calls=new ArrayList<>();for(MethodData click:clicks)calls.addAll(click.getInvokes());
                Constructor<?> request=one(calls,m->durationConstructor(m)&&!m.getClassName().equals("java.lang.Long")&&!m.getClassName().equals(durationType.getName()),"native timer request").getConstructorInstance(lpparm.classLoader);
                XposedBridge.hookMethod(request,new XC_MethodHook(){protected void beforeHookedMethod(MethodHookParam p){CustomSleepTimer.cancel();}});
            }
        }catch(Throwable error){XposedBridge.log("[SpotifyPlus][NativeTimer] Timer coexistence hook unavailable: "+error);}
        XposedBridge.log("[SpotifyPlus][NativeTimer] Custom saved amounts integrated into the player menu");
    }
    private static boolean durationConstructor(MethodData method){return method.isConstructor()&&method.getParamTypeNames().equals(List.of("long"));}
    private static MethodData one(Collection<MethodData> methods,Predicate<MethodData> predicate,String role){
        Map<String,MethodData> unique=new LinkedHashMap<>();for(MethodData method:methods)if(predicate.test(method))unique.put(method.getDescriptor(),method);
        if(unique.size()!=1)throw new IllegalStateException("Expected one "+role+", found "+unique.keySet());return unique.values().iterator().next();
    }
}
