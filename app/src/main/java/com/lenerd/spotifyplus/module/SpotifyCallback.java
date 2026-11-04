package com.lenerd.spotifyplus.module;
import java.lang.reflect.Member;
import de.robv.android.xposed.XC_MethodHook;
/** API-2 helpers backed by the legacy Xposed bridge available in the user's LSPatch. */
public final class SpotifyCallback {
    private final XC_MethodHook.MethodHookParam param;
    SpotifyCallback(XC_MethodHook.MethodHookParam param){this.param=param;}
    public Member getMember(){return param.method;}
    public Object[] getArgs(){return param.args;}
    public Object getThisObject(){return param.thisObject;}
    public Object getResult(){return param.getResult();}
    public Throwable getThrowable(){return param.getThrowable();}
    public void setResult(Object result){param.setResult(result);}
    public void returnAndSkip(Object result){param.setResult(result);}
}
