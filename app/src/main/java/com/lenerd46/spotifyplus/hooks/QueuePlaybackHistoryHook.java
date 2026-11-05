package com.lenerd46.spotifyplus.hooks;

import android.view.*;
import android.widget.LinearLayout;
import com.lenerd46.spotifyplus.features.QueuePlaybackHistory;
import de.robv.android.xposed.*;

/** Insert history into the actual Spotify queue sheet without altering its adapter or queue. */
public final class QueuePlaybackHistoryHook extends SpotifyHook {
    protected void hook(){
        XposedBridge.hookAllMethods(LayoutInflater.class,"inflate",new XC_MethodHook(){
            protected void afterHookedMethod(MethodHookParam param){
                try{
                    if(param.args.length==0||!(param.args[0] instanceof Integer))return;
                    LayoutInflater inflater=(LayoutInflater)param.thisObject;
                    if(!inflater.getContext().getResources().getResourceEntryName((Integer)param.args[0]).equals("layout_queue_sheet_content"))return;
                    if(param.getResult() instanceof View root)root.post(()->attach(root));
                }catch(Throwable error){XposedBridge.log("[SpotifyPlus][QueueHistory] "+error);}
            }
        });
    }
    private static void attach(View root){
        try{
            View queue=find(root,"com.spotify.nowplayingqueue.bottomsheet.view.QueueInteractionLayout");
            if(queue==null)return;
            View recycler=find(queue,"androidx.recyclerview.widget.RecyclerView");
            if(recycler==null||!(recycler.getParent() instanceof ViewGroup content)||!(content.getParent() instanceof LinearLayout column))return;
            QueuePlaybackHistory.attach(column,content);
        }catch(Throwable error){XposedBridge.log("[SpotifyPlus][QueueHistory] "+error);}
    }
    private static View find(View root,String name){
        for(Class<?> type=root.getClass();type!=null;type=type.getSuperclass())if(type.getName().equals(name))return root;
        if(root instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++){View found=find(group.getChildAt(i),name);if(found!=null)return found;}
        return null;
    }
}
