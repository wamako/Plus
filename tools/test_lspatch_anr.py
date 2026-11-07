import unittest
from lspatch_anr import summarize, trace_path

class AnrTests(unittest.TestCase):
    def test_main_thread_scope_and_code_identifiers_only(self):
        trace = ('----- pid 42 at 2026-11-07 -----\nCmd line: com.spotify.music\n'
                 '"main" prio=5 tid=1 Native\n'
                 '  native: #00 pc 123 /data/private/libdexkit.so (private-symbol)\n'
                 '  at org.luckypray.dexkit.DexKitBridge.findMethod(Native method)\n'
                 '  at com.lenerd46.spotifyplus.hooks.ThemeHook.hook(/data/private/file:99)\n'
                 '  at android.app.ActivityThread.handleBindApplication(private-file:1)\n'
                 '\n"private-thread" prio=5 tid=2 Native\n'
                 '  at java.lang.Thread.sleep(private-file)\n----- end 42 -----\n')
        details = summarize(trace, "42")
        self.assertTrue(details["main_thread_found"])
        self.assertTrue(details["native_library_frames"]["libdexkit.so"])
        self.assertEqual(len(details["java_frames"]), 3)
        self.assertNotIn("private", str(details))
        self.assertFalse(summarize(trace, "43")["main_thread_found"])
        self.assertFalse(summarize(trace.replace("Cmd line: com.spotify.music", "Cmd line: com.spotify.music:helper"), "42")["main_thread_found"])

    def test_trace_path_is_bounded_to_the_correlated_main_anr(self):
        text = ('ApplicationExitInfo #0:\n pid=42\n process=com.spotify.music reason=6 status=0\n'
                ' trace=/data/system/procexitstore/anr_2026-11-07-01-00-00-123.gz\n')
        self.assertIsNotNone(trace_path(text, "42"))
        self.assertIsNone(trace_path(text, "43"))
        self.assertIsNone(trace_path(text.replace("reason=6", "reason=4"), "42"))
        self.assertIsNone(trace_path(text.replace("/data/system/procexitstore/", "/data/private/"), "42"))

    def test_theme_symbol_never_returns_log_payloads_or_paths(self):
        from lspatch_anr import theme_symbol
        text = ("Material theme method: public static final void p.Theme.a(p.Scheme,p.A,p.B,p.C,p.D,p.F,int)"
                " https://private.invalid/?token=secret /data/private-name")
        symbol = theme_symbol(text)
        self.assertEqual(symbol["declaring_class"], "p.Theme")
        self.assertEqual(symbol["name"], "a")
        self.assertNotIn("secret", str(symbol))
        self.assertNotIn("private", str(symbol))
        self.assertIsNone(theme_symbol(text.replace("p.A", "https://private.invalid/token")))
