package com.lenerd46.spotifyplus.api2;

import java.io.*;
import java.nio.file.*;

/** Publish extracted executable code only after sealing and closing its write descriptor. */
public final class ReadOnlyCodeFiles {
    private ReadOnlyCodeFiles() {}
    public static void write(InputStream source, File destination) throws IOException {
        File parent=destination.getAbsoluteFile().getParentFile();
        if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create code directory");
        File temporary=File.createTempFile(".spotifyplus-code-", ".tmp", parent);
        try {
            try (FileOutputStream output=new FileOutputStream(temporary)) {
                // Android requires read-only mode before content is written, not just before load.
                if (!temporary.setReadOnly()) throw new IOException("Cannot seal extracted code");
                byte[] buffer=new byte[65536]; int count;
                while ((count=source.read(buffer))!=-1) output.write(buffer,0,count);
                output.getFD().sync();
            }
            // Replace old writable or read-only caches without ever reopening the loaded file.
            try {
                Files.move(temporary.toPath(),destination.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            } catch (AccessDeniedException e) {
                destination.setWritable(true);
                Files.move(temporary.toPath(),destination.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            temporary.setWritable(true);
            Files.deleteIfExists(temporary.toPath());
        }
    }
}
