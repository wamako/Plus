package com.lenerd46.spotifyplus.compat;
import java.lang.reflect.*;
import java.util.*;

/** Bounded breadth-first discovery favors directly captured data over service internals. */
public final class CapturedValues {
    private CapturedValues(){}
    private static final class Node{final Object value;final int depth;Node(Object value,int depth){this.value=value;this.depth=depth;}}
    public static Object find(Object root,Class<?> expected,int depth){
        Deque<Node> pending=new ArrayDeque<>();pending.add(new Node(root,depth));
        IdentityHashMap<Object,Boolean> seen=new IdentityHashMap<>();
        while(!pending.isEmpty()&&seen.size()<512){
            Node node=pending.removeFirst();Object value=node.value;
            if(value==null||node.depth<0||seen.put(value,true)!=null)continue;
            if(expected.isInstance(value))return value;
            if(node.depth==0)continue;
            if(value instanceof List<?> list){if(list.size()==1)pending.addLast(new Node(list.get(0),node.depth-1));continue;}
            String name=value.getClass().getName();
            if(name.startsWith("java.")||name.startsWith("android.")||name.startsWith("io.reactivex.")||value.getClass().isEnum())continue;
            for(Class<?> type=value.getClass();type!=null&&type!=Object.class;type=type.getSuperclass())for(Field field:type.getDeclaredFields()){
                if(Modifier.isStatic(field.getModifiers())||field.getType().isPrimitive())continue;
                try{field.setAccessible(true);pending.addLast(new Node(field.get(value),node.depth-1));}
                catch(ReflectiveOperationException|RuntimeException ignored){}
            }
        }
        return null;
    }
}
