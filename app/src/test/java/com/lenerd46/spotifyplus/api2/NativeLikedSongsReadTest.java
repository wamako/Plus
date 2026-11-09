package com.lenerd46.spotifyplus.api2;

import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/** Genuine HTTP requests, intercepted before network I/O; no Spotify session is used. */
public class NativeLikedSongsReadTest {
    private static final String CONTEXT = "https://spclient.wg.spotify.com/context-resolve/v1/spotify:user:fixture:collection";
    private static final int MAX_BODY = 4 * 1024 * 1024;
    private static final String PRIVATE_ACCESS = "fixture-private-access";
    private static final String PRIVATE_CLIENT = "fixture-private-client";
    private static final MediaType BINARY = MediaType.get("application/octet-stream");

    private static NativeLikedSongsRead.Credentials credentials() {
        return new NativeLikedSongsRead.Credentials("fixture", PRIVATE_ACCESS, PRIVATE_CLIENT);
    }

    private static Response response(Request request, int status, byte[] body) {
        return new Response.Builder().request(request).protocol(Protocol.HTTP_1_1)
                .code(status).message("fixture")
                .body(ResponseBody.create(BINARY, body)).build();
    }

    private static NativeLikedSongsRead reader(Interceptor interceptor) {
        return new NativeLikedSongsRead(new OkHttpClient.Builder().addInterceptor(interceptor).build(),
                NativeLikedSongsReadTest::credentials);
    }

    @FunctionalInterface private interface CheckedAction { void run() throws Exception; }

    private static void fixedFailure(CheckedAction action) throws Exception {
        try {
            action.run();
            fail("Expected a controlled native read failure");
        } catch (RuntimeException error) {
            assertNotNull(error.getMessage());
            assertTrue("Native failures must contain only a fixed category", error.getMessage().matches("SP_LIKED_[A-Z_]+"));
            assertFalse(error.getMessage().contains(PRIVATE_ACCESS));
            assertFalse(error.getMessage().contains(PRIVATE_CLIENT));
            assertNull("Native failure causes can disclose request/credential text", error.getCause());
        }
    }

    private static byte[] body(Request request) throws IOException {
        assertNotNull(request.body());
        Buffer buffer = new Buffer();
        request.body().writeTo(buffer);
        return buffer.readByteArray();
    }

    private static void stringField(ByteArrayOutputStream output, int number, String value) {
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        output.write(number * 8 + 2);
        int length = encoded.length;
        while (length >= 128) {
            output.write((length & 127) | 128);
            length >>>= 7;
        }
        output.write(length);
        output.write(encoded, 0, encoded.length);
    }

    /** Independent protobuf fixture: do not reuse the production request encoder. */
    private static byte[] collectionBody(String username, String cursor, int limit) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        stringField(output, 1, username);
        stringField(output, 2, "collection");
        stringField(output, 3, cursor);
        output.write(32);
        output.write(limit);
        return output.toByteArray();
    }

    private static void authenticated(Request request) {
        assertEquals("Bearer " + PRIVATE_ACCESS, request.header("Authorization"));
        assertEquals(PRIVATE_CLIENT, request.header("Client-Token"));
        assertEquals("Android", request.header("App-Platform"));
    }

    @Test public void contextAndOpaquePageReadsAttachBothNativeCredentials() throws Exception {
        List<Request> requests = new ArrayList<>();
        byte[] bytes = "{\"pages\":[]}".getBytes(StandardCharsets.UTF_8);
        NativeLikedSongsRead reader = reader(chain -> {
            Request request = chain.request();
            requests.add(request);
            authenticated(request);
            assertEquals("GET", request.method());
            assertNull(request.body());
            assertEquals("application/json", request.header("Accept"));
            return response(request, 200, bytes);
        });
        assertArrayEquals(bytes, reader.readContext(CONTEXT).body);
        String page = "https://spclient.wg.spotify.com/collection-resolve/v2/user/fixture/collection?pagination_token=two%2Fthree";
        assertEquals(200, reader.readContext(page).status);
        assertEquals(2, requests.size());
        assertEquals(page, requests.get(1).url().toString());
    }

    @Test public void collectionPagingUsesFixedEndpointAndIndependentWireBytes() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        String cursor = "opaque-" + "x".repeat(130);
        NativeLikedSongsRead reader = reader(chain -> {
            requests.incrementAndGet();
            Request request = chain.request();
            authenticated(request);
            assertEquals("POST", request.method());
            assertEquals("https://spclient.wg.spotify.com/collection/v2/paging", request.url().toString());
            assertEquals("application/vnd.collection-v2.spotify.proto", request.header("Accept"));
            assertNotNull(request.body().contentType());
            assertEquals("application/vnd.collection-v2.spotify.proto", request.body().contentType().toString());
            assertArrayEquals(collectionBody("fixture", cursor, 100), body(request));
            return response(request, 200, new byte[]{10, 1, 7});
        });
        NativeLikedSongsRead.Result result = reader.readCollection("fixture", cursor, 100);
        assertEquals(200, result.status);
        assertArrayEquals(new byte[]{10, 1, 7}, result.body);
        assertEquals(1, requests.get());
    }

    @Test public void eachPageUsesTheCurrentNativeCredentialSnapshot() throws Exception {
        AtomicReference<NativeLikedSongsRead.Credentials> current = new AtomicReference<>(credentials());
        AtomicInteger captures = new AtomicInteger();
        List<String> access = new ArrayList<>(), client = new ArrayList<>();
        OkHttpClient http = new OkHttpClient.Builder().addInterceptor(chain -> {
            access.add(chain.request().header("Authorization"));
            client.add(chain.request().header("Client-Token"));
            return response(chain.request(), 200, new byte[]{1});
        }).build();
        NativeLikedSongsRead reader = new NativeLikedSongsRead(http, () -> {
            captures.incrementAndGet();
            return current.get();
        });
        reader.readContext(CONTEXT);
        current.set(new NativeLikedSongsRead.Credentials("fixture", "renewed-access", "renewed-client"));
        reader.readCollection("fixture", "", 1);
        assertEquals(List.of("Bearer " + PRIVATE_ACCESS, "Bearer renewed-access"), access);
        assertEquals(List.of(PRIVATE_CLIENT, "renewed-client"), client);
        assertEquals(2, captures.get());
    }

    @Test public void clientCloneDisablesRedirectsAndBoundsTheWholeCall() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        OkHttpClient supplied = new OkHttpClient.Builder().followRedirects(true).followSslRedirects(true)
                .callTimeout(0, TimeUnit.SECONDS).addInterceptor(chain -> {
                    requests.incrementAndGet();
                    // Pinned OkHttp exposes the actual call's client. Checking this
                    // matters: an application interceptor alone bypasses follow-ups.
                    try {
                        Object active = chain.call().getClass().getMethod("getClient").invoke(chain.call());
                        assertTrue(active instanceof OkHttpClient);
                        assertFalse(((OkHttpClient) active).followRedirects());
                        assertFalse(((OkHttpClient) active).followSslRedirects());
                    } catch (ReflectiveOperationException error) {
                        throw new AssertionError("Could not inspect the pinned OkHttp call", error);
                    }
                    long timeout = chain.call().timeout().timeoutNanos();
                    assertTrue(timeout > 0 && timeout <= TimeUnit.SECONDS.toNanos(15));
                    return response(chain.request(), 302, PRIVATE_CLIENT.getBytes(StandardCharsets.UTF_8))
                            .newBuilder().header("Location", "https://example.invalid/credential-target").build();
                }).build();
        NativeLikedSongsRead reader = new NativeLikedSongsRead(supplied, NativeLikedSongsReadTest::credentials);
        NativeLikedSongsRead.Result result = reader.readContext(CONTEXT);
        assertEquals(302, result.status);
        assertArrayEquals(new byte[0], result.body);
        assertEquals(1, requests.get());
        assertTrue("The caller's shared HTTP client must retain its settings", supplied.followRedirects());
        assertTrue(supplied.followSslRedirects());
        assertEquals(0, supplied.callTimeoutMillis());
    }

    @Test public void unsafeContextUrlsAreRefusedBeforeAnyNetworkRequest() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        NativeLikedSongsRead reader = reader(chain -> {
            requests.incrementAndGet();
            return response(chain.request(), 200, new byte[]{1});
        });
        for (String url : Arrays.asList(
                "http://spclient.wg.spotify.com/context-resolve/v1/item",
                "https://example.invalid/context-resolve/v1/item",
                "https://spclient.wg.spotify.com.evil.invalid/context-resolve/v1/item",
                "https://user:secret@spclient.wg.spotify.com/context-resolve/v1/item",
                "https://spclient.wg.spotify.com:444/context-resolve/v1/item",
                CONTEXT + "#fragment",
                "https://spclient.wg.spotify.com/metadata/4/track/item",
                "https://spclient.wg.spotify.com/context-resolve/v1/../v1/item",
                "https://spclient.wg.spotify.com/context-resolve/v1/%2e%2e/v1/item",
                "https://spclient.wg.spotify.com/context-resolve/v1/%2E./v1/item",
                CONTEXT + "\n",
                "", null)) {
            fixedFailure(() -> reader.readContext(url));
        }
        assertEquals(0, requests.get());
    }

    @Test public void invalidPagingArgumentsAndAnotherAccountAreRefusedWithoutIo() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        NativeLikedSongsRead reader = reader(chain -> {
            requests.incrementAndGet();
            return response(chain.request(), 200, new byte[]{1});
        });
        for (String username : Arrays.asList("", "other-account", "fixture/path", "fixture:tracks", "fixture user", null)) {
            fixedFailure(() -> reader.readCollection(username, "", 100));
        }
        for (int limit : new int[]{0, -1, 101, Integer.MAX_VALUE}) {
            fixedFailure(() -> reader.readCollection("fixture", "", limit));
        }
        for (String cursor : Arrays.asList("x".repeat(16385), "private\nvalue", "one\nline\nend", "private\u0000value", null)) {
            fixedFailure(() -> reader.readCollection("fixture", cursor, 100));
        }
        assertEquals(0, requests.get());
    }

    @Test public void bothNativeTokensAreRequiredAndCredentialErrorsAreRedacted() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        OkHttpClient http = new OkHttpClient.Builder().addInterceptor(chain -> {
            requests.incrementAndGet();
            return response(chain.request(), 200, new byte[]{1});
        }).build();
        for (NativeLikedSongsRead.Credentials credentials : Arrays.asList(
                new NativeLikedSongsRead.Credentials("fixture", null, PRIVATE_CLIENT),
                new NativeLikedSongsRead.Credentials("fixture", "", PRIVATE_CLIENT),
                new NativeLikedSongsRead.Credentials("fixture", " ", PRIVATE_CLIENT),
                new NativeLikedSongsRead.Credentials("fixture", PRIVATE_ACCESS, null),
                new NativeLikedSongsRead.Credentials("fixture", PRIVATE_ACCESS, ""),
                new NativeLikedSongsRead.Credentials("fixture", PRIVATE_ACCESS, " "),
                new NativeLikedSongsRead.Credentials("fixture", PRIVATE_ACCESS + "\n", PRIVATE_CLIENT),
                new NativeLikedSongsRead.Credentials("fixture", PRIVATE_ACCESS, PRIVATE_CLIENT + "\r"),
                null)) {
            NativeLikedSongsRead reader = new NativeLikedSongsRead(http, () -> credentials);
            fixedFailure(() -> reader.readContext(CONTEXT));
        }
        NativeLikedSongsRead reader = new NativeLikedSongsRead(http, () -> {
            throw new IllegalStateException(PRIVATE_CLIENT);
        });
        fixedFailure(() -> reader.readContext(CONTEXT));
        assertEquals(0, requests.get());
    }

    @Test public void deniedRateLimitedAndUnexpectedStatusesReturnNoProviderBody() throws Exception {
        byte[] privateBody = (PRIVATE_ACCESS + ":" + PRIVATE_CLIENT).getBytes(StandardCharsets.UTF_8);
        for (int status : new int[]{204, 400, 401, 403, 404, 429, 500, 503}) {
            NativeLikedSongsRead reader = reader(chain -> response(chain.request(), status, privateBody));
            NativeLikedSongsRead.Result result = reader.readContext(CONTEXT);
            assertEquals(status, result.status);
            assertArrayEquals("Error payloads must not leave native transport", new byte[0], result.body);
        }
    }

    @Test public void networkExceptionsDoNotExposeProviderOrCredentialDetails() throws Exception {
        NativeLikedSongsRead reader = reader(chain -> {
            throw new IOException("provider failed with " + PRIVATE_CLIENT);
        });
        fixedFailure(() -> reader.readContext(CONTEXT));
    }

    @Test public void knownAndStreamingOversizeResponsesFailBeforeReturningPartialData() throws Exception {
        for (long declared : new long[]{MAX_BODY + 1L, -1L}) {
            byte[] excessive = new byte[MAX_BODY + 1];
            NativeLikedSongsRead reader = reader(chain -> {
                ResponseBody body = new ResponseBody() {
                    final Buffer source = new Buffer().write(excessive);
                    @Override public MediaType contentType() { return BINARY; }
                    @Override public long contentLength() { return declared; }
                    @Override public BufferedSource source() { return source; }
                };
                return response(chain.request(), 200, new byte[0]).newBuilder().body(body).build();
            });
            fixedFailure(() -> reader.readContext(CONTEXT));
        }
    }

    @Test public void responseAtTheBoundAndRawBinaryBytesArePreserved() throws Exception {
        byte[] bytes = new byte[MAX_BODY];
        bytes[0] = (byte) 0xff;
        bytes[bytes.length - 1] = 1;
        NativeLikedSongsRead reader = reader(chain -> response(chain.request(), 200, bytes));
        NativeLikedSongsRead.Result result = reader.readCollection("fixture", "", 100);
        assertEquals(200, result.status);
        assertArrayEquals(bytes, result.body);
    }
}
