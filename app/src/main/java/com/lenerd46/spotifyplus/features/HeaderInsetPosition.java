package com.lenerd46.spotifyplus.features;
/** Compute from the unadjusted row position so repeated inset passes do not accumulate offsets. */
public final class HeaderInsetPosition {
    private HeaderInsetPosition(){}
    public static int topMargin(int originalMargin,int currentMargin,int controlTop,int safeTop){
        int naturalTop=controlTop-(currentMargin-originalMargin);
        return originalMargin+Math.max(0,safeTop-naturalTop);
    }
}
