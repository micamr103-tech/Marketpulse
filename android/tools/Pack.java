import java.io.BufferedOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Repacks an APK produced by aapt2 into something Android will actually install.
 *
 * Two problems have to be solved, and both are silent — the result looks like a
 * perfectly good zip until a real device rejects it:
 *
 *  1. aapt2 writes asset paths with the host separator, so on Windows the bundle
 *     lands as "assets\assets\index.js". Android's asset manager only resolves
 *     forward slashes, so every script 404s and the app launches to a blank
 *     screen.
 *
 *  2. Android 11+ refuses to install any app targeting API 30+ unless
 *     resources.arsc and AndroidManifest.xml are STORED and 4-byte aligned, so
 *     the installer can memory-map them. The error is
 *     "Failed parse during installPackageLI: ... -124", which reads like a
 *     corrupt download and is nothing of the sort.
 *
 * Doing this in .NET is a trap: on .NET Framework (Windows PowerShell 5.1)
 * CompressionLevel.NoCompression still emits a DEFLATED entry, so the critical
 * files get compressed anyway. ZipEntry.setMethod(STORED) is unambiguous, so
 * this is done with the JDK.
 *
 *   Pack <base-unsigned.apk> <classes.dex> <packed.apk>
 */
public class Pack {

    /** Must be stored uncompressed for Android 11+ to accept the package. */
    private static final Set<String> MUST_STORE =
            new HashSet<>(Arrays.asList("resources.arsc", "AndroidManifest.xml"));

    public static void main(String[] args) throws Exception {
        Path base = Paths.get(args[0]);
        Path dex = Paths.get(args[1]);
        Path out = Paths.get(args[2]);

        long stored = 0, deflated = 0, renamed = 0;

        try (ZipFile zf = new ZipFile(base.toFile());
             OutputStream fileOut = new BufferedOutputStream(Files.newOutputStream(out));
             ZipOutputStream zos = new ZipOutputStream(fileOut)) {

            List<? extends ZipEntry> entries = java.util.Collections.list(zf.entries());
            for (ZipEntry src : entries) {
                byte[] data;
                try (InputStream in = zf.getInputStream(src)) {
                    data = in.readAllBytes();
                }

                String name = src.getName().replace('\\', '/');
                if (!name.equals(src.getName())) renamed++;

                ZipEntry dst = new ZipEntry(name);
                Calendar stamp = Calendar.getInstance();
                if (src.getTime() >= 0) stamp.setTimeInMillis(src.getTime());
                else stamp.setTimeInMillis(0L);
                // A fixed timestamp keeps builds byte-comparable; the zip epoch
                // year is the conventional "no timestamp" value.
                dst.setTime(stamp.getTimeInMillis());

                if (MUST_STORE.contains(name)) {
                    CRC32 crc = new CRC32();
                    crc.update(data);
                    dst.setMethod(ZipEntry.STORED);
                    dst.setSize(data.length);
                    dst.setCompressedSize(data.length);
                    dst.setCrc(crc.getValue());
                    stored++;
                } else {
                    dst.setMethod(ZipEntry.DEFLATED);
                    deflated++;
                }

                zos.putNextEntry(dst);
                zos.write(data);
                zos.closeEntry();
            }

            byte[] dexBytes = Files.readAllBytes(dex);
            ZipEntry dexEntry = new ZipEntry("classes.dex");
            dexEntry.setMethod(ZipEntry.DEFLATED);
            zos.putNextEntry(dexEntry);
            zos.write(dexBytes);
            zos.closeEntry();
            deflated++;
        }

        System.out.printf("packed %s (%d stored, %d deflated, %d paths normalised)%n",
                out, stored, deflated, renamed);
    }
}