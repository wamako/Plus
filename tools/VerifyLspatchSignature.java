import com.android.apksig.ApkVerifier;
import java.io.File;

/** Cryptographic APK verification; no Android installation or runtime test. */
public final class VerifyLspatchSignature {
    public static void main(String[] args) throws Exception {
        ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[0]))
                .setMinCheckedPlatformVersion(28).setMaxCheckedPlatformVersion(37).build().verify();
        System.out.println("{\"verified\":" + result.isVerified()
                + ",\"v2\":" + result.isVerifiedUsingV2Scheme()
                + ",\"error_count\":" + result.getAllErrors().size() + "}");
        if (!result.isVerified() || !result.isVerifiedUsingV2Scheme())
            throw new AssertionError("APK v2 signature verification failed: " + result.getAllErrors());
    }
}
