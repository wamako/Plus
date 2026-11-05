package com.lenerd46.spotifyplus;
/** Canonical artwork URLs without substituting a different album. */
public final class ArtworkSource {
    private ArtworkSource() {}
    public static String url(String value) {
        if(value==null)return null;
        String s=value.trim();
        if(s.startsWith("spotify:image:"))s=s.substring(14);
        if(s.matches("[a-fA-F0-9]{40}"))return "https://i.scdn.co/image/"+s;
        if(s.startsWith("https://")||s.startsWith("http://"))return s;
        return null;
    }
    public static String id(String value) {
        String url=url(value);
        if(url==null)return "";
        String prefix="https://i.scdn.co/image/";
        return url.startsWith(prefix)?url.substring(prefix.length()):url;
    }
}
