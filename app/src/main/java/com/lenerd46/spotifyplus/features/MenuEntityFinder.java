package com.lenerd46.spotifyplus.features;

import java.lang.reflect.*;
import java.util.*;

/** Reads only captured menu data, with a bounded walk and no calls into Spotify services. */
public final class MenuEntityFinder {
    private MenuEntityFinder() {}
    public static String uniqueUri(Object root) {
        Set<String> found = new LinkedHashSet<>();
        walk(root, 6, new IdentityHashMap<>(), found);
        return found.size() == 1 ? found.iterator().next() : null;
    }
    private static void walk(Object value, int depth, IdentityHashMap<Object,Boolean> seen, Set<String> found) {
        if (value instanceof String text) {
            try { found.add(BookmarkCollection.normalize(text)); } catch (IllegalArgumentException ignored) {}
            return;
        }
        if (value == null || depth == 0 || seen.size() >= 512 || seen.put(value,true) != null) return;
        if (value instanceof List<?> list) { if(list.size()==1)walk(list.get(0),depth-1,seen,found);return; }
        Class<?> type=value.getClass();
        String name=type.getName();
        if(type.isEnum()||type.isArray()||name.startsWith("java.")||name.startsWith("android.")||name.startsWith("io.reactivex."))return;
        for(;type!=null&&type!=Object.class;type=type.getSuperclass())for(Field f:type.getDeclaredFields()){
            if(Modifier.isStatic(f.getModifiers())||f.getType().isPrimitive())continue;
            try{f.setAccessible(true);walk(f.get(value),depth-1,seen,found);}catch(ReflectiveOperationException|RuntimeException ignored){}
        }
    }
}
