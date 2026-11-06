package com.lenerd46.spotifyplus.api2;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** The two copy operations, using schema names instead of obfuscated builder aliases.
 * Validated against Spotify 9.1.94.1929. No retry or alternate transport is used.
 */
public final class NativePlaylistWriter {
    private static final String MOD = "com.spotify.playlist.proto.";
    private static final String RPC = "spotify.playlist.esperanto.proto.";
    private final ClassLoader loader;
    private final Object repository;

    public NativePlaylistWriter(ClassLoader loader, Object repository) {
        this.loader = loader;
        this.repository = repository;
    }

    public String create(String name) {
        Prepared prepared;
        String stage = "PREPARE_INPUT";
        try {
            if (name == null || name.trim().isEmpty() || name.length() > 100)
                throw new IllegalArgumentException();
            stage = "PREPARE_SCHEMA";
            Class<?> modification = type(MOD + "ModificationRequest");
            Class<?> creation = type(MOD + "CreationInfo");
            // The enum's obfuscated class and field names also changed in 9.1.94.
            Object fresh = null;
            for (Method method : creation.getDeclaredMethods()) {
                Class<?>[] params = method.getParameterTypes();
                if (!Modifier.isStatic(method.getModifiers()) && params.length == 1 && params[0].isEnum()) {
                    for (Object value : params[0].getEnumConstants())
                        if (((Enum<?>) value).name().equals("ORIGIN_TYPE_FRESH")) {
                            if (fresh != null && fresh != value) throw new IllegalStateException();
                            fresh = value;
                        }
                }
            }
            if (fresh == null) throw new NoSuchFieldException();
            Method number = fresh.getClass().getMethod("getNumber");
            number.setAccessible(true);
            byte[] info = new Wire().integer(fieldNumber(creation, "ORIGIN_TYPE"),
                    ((Number) number.invoke(fresh)).intValue()).bytes();
            // Parse nested messages too: reject incompatible schemas before dispatch.
            parse(creation, info);
            byte[] change = new Wire()
                    .text(fieldNumber(modification, "OPERATION"), "create")
                    .integer(fieldNumber(modification, "PLAYLIST"), 1)
                    .text(fieldNumber(modification, "NAME"), name.trim())
                    .text(fieldNumber(modification, "BEFORE"), "start")
                    .message(fieldNumber(modification, "CREATION_INFO"), info).bytes();
            parse(modification, change);
            prepared = prepare(true, "", change);
        } catch (Exception | LinkageError error) { throw preparationFailure(stage, error); }
        Object response = dispatch(prepared);
        try {
            Object result = read(response, "response_");
            if (result == null || !Boolean.TRUE.equals(read(result, "success_")))
                throw new IllegalStateException();
            String uri = (String) read(result, "uri_");
            if (uri == null || !uri.matches("spotify:playlist:[A-Za-z0-9]{22}"))
                throw new IllegalStateException();
            return uri;
        } catch (Exception | LinkageError error) { throw failure("ACK", error); }
    }

    public void addTracks(String uri, List<String> uris) {
        Prepared prepared;
        String stage = "PREPARE_INPUT";
        try {
            if (uri == null || !uri.matches("spotify:playlist:[A-Za-z0-9]{22}") ||
                    uris == null || uris.isEmpty() || uris.size() > 100) throw new IllegalArgumentException();
            for (String track : uris)
                if (track == null || !track.matches("spotify:track:[A-Za-z0-9]{22}")) throw new IllegalArgumentException();
            stage = "PREPARE_SCHEMA";
            Class<?> modification = type(MOD + "ModificationRequest");
            Wire change = new Wire().text(fieldNumber(modification, "OPERATION"), "add")
                    .text(fieldNumber(modification, "AFTER"), "end");
            for (String track : uris) {
                change.text(fieldNumber(modification, "URIS"), track);
            }
            parse(modification, change.bytes());
            prepared = prepare(false, uri, change.bytes());
        } catch (Exception | LinkageError error) { throw preparationFailure(stage, error); }
        dispatch(prepared);
    }

    private Prepared prepare(boolean root, String uri, byte[] modification) throws Exception {
        String prefix = root ? "Rootlist" : "Playlist";
        Class<?> requestType = type(RPC + prefix + "ModificationRequest");
        Object request = parse(requestType, new Wire()
                .text(fieldNumber(requestType, root ? "FOLDER_URI" : "URI"), uri)
                .message(fieldNumber(requestType, "REQUEST"), modification).bytes());
        Class<?> responseType = type(RPC + prefix + "ModificationResponse");
        // Resolve response schema before creating a playlist, not after the write.
        Class<?> status = schemaField(responseType, "status_").getType();
        schemaField(status, "statusCode_");
        if (root) {
            Class<?> result = schemaField(responseType, "response_").getType();
            schemaField(result, "uri_"); schemaField(result, "success_");
        }
        parse(responseType, new byte[0]);
        Class<?> clientType = type("com.spotify.esperanto.esperanto.ClientBase");
        Object client = clientType.isInstance(repository) ? repository : null;
        try {
            if (repository != null && client == null) {
                for (Class<?> t = repository.getClass(); t != null; t = t.getSuperclass())
                    for (Field field : t.getDeclaredFields()) {
                        if (Modifier.isStatic(field.getModifiers()) || !clientType.isAssignableFrom(field.getType())) continue;
                        field.setAccessible(true);
                        Object value = field.get(repository);
                        if (value != null) {
                            if (client != null && client != value) throw new IllegalStateException();
                            client = value;
                        }
                    }
            }
            if (client == null) throw new IllegalStateException();
            Class<?> single = type("io.reactivex.rxjava3.core.Single");
            Method rpc = null;
            for (Method method : clientType.getMethods()) {
                Class<?>[] p = method.getParameterTypes();
                if (method.getName().equals("callSingle") && !Modifier.isStatic(method.getModifiers()) && p.length == 3 &&
                        p[0] == String.class && p[1] == String.class && p[2].isInstance(request) &&
                        single.isAssignableFrom(method.getReturnType())) {
                    if (rpc != null) throw new IllegalStateException();
                    rpc = method;
                }
            }
            if (rpc == null) throw new NoSuchMethodException();
            return new Prepared(client, rpc, request, responseType,
                    "spotify.playlist_esperanto.proto." + (root ? "RootlistModificationService" : "PlaylistService"),
                    single.getMethod("timeout", long.class, TimeUnit.class), single.getMethod("blockingGet"));
        } catch (Exception | LinkageError error) { throw failure("PREPARE_CLIENT", error); }
    }

    private Object dispatch(Prepared p) {
        byte[] bytes;
        try {
            Object pending = p.rpc.invoke(p.client, p.service, "Modify", p.request);
            pending = p.timeout.invoke(pending, 15L, TimeUnit.SECONDS);
            bytes = (byte[]) p.blockingGet.invoke(pending);
        } catch (Exception | LinkageError error) { throw failure("RPC", error); }
        Object response;
        int code;
        try {
            if (bytes == null || bytes.length == 0 || bytes.length > 1024 * 1024) throw new IllegalStateException();
            response = parse(p.responseType, bytes);
            Object status = read(response, "status_");
            code = status == null ? 0 : ((Number) read(status, "statusCode_")).intValue();
            if (code < 100 || code > 599) throw new IllegalStateException();
        } catch (Exception | LinkageError error) { throw failure("ACK", error); }
        if (code < 200 || code >= 300) throw failure("REJECTED_" + code, null);
        return response;
    }

    private Class<?> type(String name) throws ClassNotFoundException { return Class.forName(name, true, loader); }
    private static Field schemaField(Class<?> type, String name) throws Exception {
        Field field = type.getDeclaredField(name); field.setAccessible(true); return field;
    }
    private static Object read(Object message, String name) throws Exception { return schemaField(message.getClass(), name).get(message); }
    private static int fieldNumber(Class<?> type, String name) throws Exception {
        int number = type.getField(name + "_FIELD_NUMBER").getInt(null);
        if (number < 1 || number > 536870911) throw new IllegalStateException();
        return number;
    }
    private static Object parse(Class<?> type, byte[] bytes) throws Exception {
        Object instance = schemaField(type, "DEFAULT_INSTANCE").get(null);
        for (Class<?> base = type.getSuperclass(); base != null; base = base.getSuperclass())
            for (Method method : base.getDeclaredMethods()) {
                Class<?>[] p = method.getParameterTypes();
                if (Modifier.isStatic(method.getModifiers()) && method.getName().equals("parseFrom") &&
                        p.length == 2 && p[0] == base && p[1] == byte[].class) {
                    method.setAccessible(true); return method.invoke(null, instance, bytes);
                }
            }
        throw new NoSuchMethodException();
    }
    private static IllegalStateException failure(String stage, Throwable cause) {
        // Only controlled codes cross JNI; do not expose service payloads or account data.
        return new IllegalStateException("SP_PLAYLIST_" + stage, cause);
    }
    private static IllegalStateException preparationFailure(String stage, Throwable cause) {
        if (cause instanceof IllegalStateException && "SP_PLAYLIST_PREPARE_CLIENT".equals(cause.getMessage()))
            return (IllegalStateException) cause;
        return failure(stage, cause);
    }
    private static final class Prepared {
        final Object client, request; final Method rpc, timeout, blockingGet;
        final Class<?> responseType; final String service;
        Prepared(Object c, Method r, Object q, Class<?> t, String s, Method timeout, Method get) {
            client=c; rpc=r; request=q; responseType=t; service=s; this.timeout=timeout; blockingGet=get;
        }
    }
    private static final class Wire {
        final ByteArrayOutputStream out = new ByteArrayOutputStream();
        void varint(long value) { while ((value & ~127L) != 0) { out.write((int) (value & 127) | 128); value >>>= 7; } out.write((int) value); }
        Wire integer(int field, int value) { varint((long) field << 3); varint(value); return this; }
        Wire text(int field, String value) { return message(field, value.getBytes(StandardCharsets.UTF_8)); }
        Wire message(int field, byte[] value) { varint(((long) field << 3) | 2); varint(value.length); out.write(value, 0, value.length); return this; }
        byte[] bytes() { return out.toByteArray(); }
    }
}
