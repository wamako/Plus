package com.lenerd46.spotifyplus.api2;

import java.io.*;
import java.lang.reflect.Method;
import java.security.MessageDigest;
import java.util.*;

/** Song occurrences, not revisions, artwork, metadata enrichment or playback clocks. */
public final class QueueIdentity {
    private QueueIdentity() {}
    public static String fingerprint(Object state) throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(DataOutputStream out=new DataOutputStream(bytes)) {
            Object current=call(state,"track");
            boolean present=(Boolean)call(current,"c");
            out.writeBoolean(present);
            if(present) track(out,call(current,"b"));
            tracks(out,(List<?>)call(state,"prevTracks"));
            tracks(out,(List<?>)call(state,"nextTracks"));
        }
        return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
    }
    private static void tracks(DataOutputStream out,List<?> tracks) throws Exception {
        out.writeInt(tracks.size());
        for(Object track:tracks) track(out,track);
    }
    private static void track(DataOutputStream out,Object track) throws Exception {
        string(out,(String)call(track,"uri"));
        string(out,(String)call(track,"uid"));
        Map<?,?> metadata=(Map<?,?>)call(track,"metadata");
        out.writeBoolean(Boolean.parseBoolean(String.valueOf(metadata.get("is_queued"))));
    }
    private static void string(DataOutputStream out,String value) throws IOException {
        out.writeBoolean(value!=null);
        if(value!=null) {
            byte[] bytes=value.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            out.writeInt(bytes.length);out.write(bytes);
        }
    }
    private static Object call(Object target,String name) throws Exception {
        Method method=target.getClass().getMethod(name);method.setAccessible(true);return method.invoke(target);
    }
}
