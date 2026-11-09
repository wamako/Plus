package com.lenerd46.spotifyplus.api2;

import com.lenerd.spotifyplus.module.Utils;
import com.lenerd.spotifyplus.module.hooks.PlayerHook;
import java.util.Base64;
import okhttp3.OkHttpClient;
import org.json.JSONObject;

/** Async-only collection reads; no caller-supplied credential or HTTP method. */
public final class NativeLikedSongsBridge {
    private static final NativeLikedSongsRead READER = new NativeLikedSongsRead(new OkHttpClient(),
            () -> new NativeLikedSongsRead.Credentials(PlayerHook.username,Utils.token,Utils.clientToken));
    private NativeLikedSongsBridge() {}
    public static JSONObject execute(String operation,JSONObject args) throws Exception {
        if("liked.capabilities".equals(operation))return new JSONObject().put("version",1).put("transport","native-client-auth-v1");
        if(!"liked.read".equals(operation))throw new IllegalArgumentException("SP_LIKED_OPERATION");
        final NativeLikedSongsRead.Result result;
        String kind=args.optString("kind","");
        if("context".equals(kind))result=READER.readContext(args.optString("url",null));
        else if("collection".equals(kind)) {
            Object value=args.opt("limit");
            if(!(value instanceof Number)||!Double.isFinite(((Number)value).doubleValue())||
                    ((Number)value).doubleValue()!=((Number)value).intValue())throw new IllegalArgumentException("SP_LIKED_INPUT");
            result=READER.readCollection(args.optString("username",null),args.optString("cursor",null),((Number)value).intValue());
        } else throw new IllegalArgumentException("SP_LIKED_INPUT");
        JSONObject reply=new JSONObject().put("status",result.status);
        if(result.status==200)reply.put("encoding","base64").put("body",Base64.getEncoder().encodeToString(result.body));
        return reply;
    }
}
