package com.lenerd46.spotifyplus.api2;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import okhttp3.*;

/** Read-only Spotify collection transport. Credentials never enter the JS response. */
public final class NativeLikedSongsRead {
    private static final int MAX_BODY = 4 * 1024 * 1024;
    private static final String HOST = "spclient.wg.spotify.com";
    private static final MediaType PROTO = MediaType.get("application/vnd.collection-v2.spotify.proto");
    private final OkHttpClient http;
    private final Supplier<Credentials> credentials;

    public static final class Credentials {
        final String username, accessToken, clientToken;
        public Credentials(String username, String accessToken, String clientToken) {
            this.username=username;this.accessToken=accessToken;this.clientToken=clientToken;
        }
    }
    public static final class Result {
        public final int status;
        public final byte[] body;
        Result(int status, byte[] body) {this.status=status;this.body=body;}
    }
    public NativeLikedSongsRead(OkHttpClient http, Supplier<Credentials> credentials) {
        this.http=http.newBuilder().followRedirects(false).followSslRedirects(false)
                .callTimeout(15,TimeUnit.SECONDS).build();
        this.credentials=credentials;
    }
    private static IllegalStateException fail(String code) {return new IllegalStateException("SP_LIKED_"+code);}
    private static boolean token(String value) {
        if(value==null||value.isBlank())return false;
        for(int i=0;i<value.length();i++)if(value.charAt(i)<=32||value.charAt(i)>=127)return false;
        return true;
    }
    private Credentials capture() {
        Credentials value;
        try {value=credentials.get();}catch(RuntimeException error){throw fail("SESSION");}
        if(value==null||!token(value.accessToken))throw fail("SESSION");
        if(!token(value.clientToken))throw fail("CLIENT_TOKEN");
        return value;
    }
    public String accountUsername() {
        Credentials value;
        try {value=credentials.get();}catch(RuntimeException error){throw fail("ACCOUNT");}
        if(value==null||!username(value.username))throw fail("ACCOUNT");
        return value.username;
    }
    private static boolean username(String value) {
        if(value==null||value.isEmpty()||value.length()>256)return false;
        for(char c:value.toCharArray())if(Character.isWhitespace(c)||Character.isISOControl(c)||":/?#".indexOf(c)>=0)return false;
        return true;
    }
    private static boolean controls(String value) {
        for(char c:value.toCharArray())if(Character.isISOControl(c))return true;
        return false;
    }
    private static String contextUrl(String url) {
        try {
            if(url==null||url.isEmpty()||url.length()>16384||controls(url)||url.indexOf('\\')>=0)throw fail("PATH");
            URI uri=new URI(url);
            String path=uri.getRawPath();
            if(!"https".equals(uri.getScheme())||!HOST.equalsIgnoreCase(uri.getHost())||
                    uri.getRawUserInfo()!=null||uri.getRawFragment()!=null||
                    (uri.getPort()!=-1&&uri.getPort()!=443)||path==null||
                    !(path.startsWith("/context-resolve/v1/")||path.startsWith("/collection-resolve/v2/"))||
                    !path.equals(uri.normalize().getRawPath())||
                    path.toLowerCase(Locale.ROOT).matches(".*%(?:2e|2f|5c|25).*"))throw fail("PATH");
            return url;
        } catch(Exception error){throw fail("PATH");}
    }
    public Result readContext(String url) {
        String checked=contextUrl(url);
        Credentials value=capture();
        return request(new Request.Builder().url(checked).get(),value,"application/json");
    }
    public Result readCollection(String user,String cursor,int limit) {
        if(!username(user)||cursor==null||cursor.length()>16384||controls(cursor)||limit<1||limit>100)throw fail("INPUT");
        Credentials value=capture();
        if(!username(value.username)||!user.equals(value.username))throw fail("ACCOUNT");
        ByteArrayOutputStream body=new ByteArrayOutputStream();
        field(body,1,user);field(body,2,"collection");field(body,3,cursor);body.write(32);body.write(limit);
        return request(new Request.Builder().url("https://"+HOST+"/collection/v2/paging")
                .post(RequestBody.create(PROTO,body.toByteArray())),value,PROTO.toString());
    }
    private static void field(ByteArrayOutputStream out,int field,String value) {
        byte[] bytes=value.getBytes(StandardCharsets.UTF_8);out.write(field*8+2);
        int length=bytes.length;
        while(length>=128){out.write((length&127)|128);length>>>=7;}
        out.write(length);out.write(bytes,0,bytes.length);
    }
    private Result request(Request.Builder builder,Credentials value,String accept) {
        try {
            Request request=builder.header("Authorization","Bearer "+value.accessToken)
                    .header("Client-Token",value.clientToken).header("App-Platform","Android")
                    .header("Accept",accept).build();
            try(Response response=http.newCall(request).execute()) {
                if(response.code()!=200)return new Result(response.code(),new byte[0]);
                ResponseBody body=response.body();
                if(body==null||body.contentLength()>MAX_BODY)throw fail("SIZE");
                ByteArrayOutputStream output=new ByteArrayOutputStream();
                try(InputStream input=body.byteStream()) {
                    byte[] buffer=new byte[8192];int read;
                    while((read=input.read(buffer))!=-1) {
                        if(output.size()>MAX_BODY-read)throw fail("SIZE");
                        output.write(buffer,0,read);
                    }
                }
                return new Result(200,output.toByteArray());
            }
        } catch(IllegalStateException error) {
            if("SP_LIKED_SIZE".equals(error.getMessage()))throw fail("SIZE");
            throw fail("NETWORK");
        } catch(Exception error){throw fail("NETWORK");}
    }
}
