package com.lenerd46.spotifyplus;

import com.lenerd46.spotifyplus.api2.ReadOnlyCodeFiles;
import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class ReadOnlyCodeFilesTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    private void assertSealed(Path file) throws IOException {
        if (FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            Set<PosixFilePermission> mode=Files.getPosixFilePermissions(file);
            assertFalse(mode.contains(PosixFilePermission.OWNER_WRITE));
            assertFalse(mode.contains(PosixFilePermission.GROUP_WRITE));
            assertFalse(mode.contains(PosixFilePermission.OTHERS_WRITE));
        } else {
            assertFalse(file.toFile().canWrite());
        }
    }
    @Test public void sealedBeforeReadingContentAndPublishedAfterClosing() throws Exception {
        File destination=new File(folder.getRoot(),"libnode.so");
        InputStream source=new ByteArrayInputStream(new byte[]{1,2,3}) {
            @Override public synchronized int read(byte[] b,int off,int length) {
                try {
                    assertFalse(destination.exists());
                    File[] temporary=folder.getRoot().listFiles();assertNotNull(temporary);assertEquals(1,temporary.length);
                    assertSealed(temporary[0].toPath());
                } catch(IOException e){throw new AssertionError(e);}
                return super.read(b,off,length);
            }
        };
        ReadOnlyCodeFiles.write(source,destination);
        assertArrayEquals(new byte[]{1,2,3},Files.readAllBytes(destination.toPath()));assertSealed(destination.toPath());
    }
    @Test public void replacesOldWritableAndReadOnlyCaches() throws Exception {
        File destination=folder.newFile("libc++_shared.so");
        for(int i=1;i<=2;i++){
            ReadOnlyCodeFiles.write(new ByteArrayInputStream(new byte[]{(byte)i}),destination);
            assertArrayEquals(new byte[]{(byte)i},Files.readAllBytes(destination.toPath()));assertSealed(destination.toPath());
        }
    }
    @Test public void failedCopyPreservesPreviousLibraryAndCleansTemporaryFile() throws Exception {
        File destination=folder.newFile("bridge.node");Files.write(destination.toPath(),new byte[]{7});
        InputStream broken=new InputStream(){public int read() throws IOException {throw new IOException("Interrupted download");}};
        try{ReadOnlyCodeFiles.write(broken,destination);fail("Expected read failure");}catch(IOException expected){}
        assertArrayEquals(new byte[]{7},Files.readAllBytes(destination.toPath()));
        assertEquals(1,folder.getRoot().listFiles().length);
    }
}
