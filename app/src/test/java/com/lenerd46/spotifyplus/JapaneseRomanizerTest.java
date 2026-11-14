package com.lenerd46.spotifyplus;

import com.lenerd46.spotifyplus.beautifullyrics.entities.JapaneseRomanizer;
import org.junit.Test;

import static org.junit.Assert.*;

public class JapaneseRomanizerTest {

    @Test
    public void convertsHiraganaAndKatakanaWithDigraphsGeminationAndParticles() {
        assertEquals("arigatou", JapaneseRomanizer.romanize("ありがとう"));
        assertEquals("chotto matte", JapaneseRomanizer.romanize("ちょっと まって"));
        assertEquals("kyou wa ii tenki", JapaneseRomanizer.romanize("今日はいい天気"));
        assertEquals("konbanwa", JapaneseRomanizer.romanize("こんばんは"));
        assertEquals("paati", JapaneseRomanizer.romanize("パーティ"));
    }

    @Test
    public void convertsCommonJPopKanjiCompoundsAndNeverDropsUnknownLines() {
        String nightSky = JapaneseRomanizer.romanize("夜空の星と夢");
        assertNotNull(nightSky);
        assertTrue(nightSky.contains("yozora"));
        assertTrue(nightSky.contains("hoshi"));
        assertTrue(nightSky.contains("yume"));

        String line = JapaneseRomanizer.romanizeLineOrNull("君と見た未来の約束");
        assertNotNull(line);
        assertTrue(line.contains("kimi"));
        assertTrue(line.contains("mirai"));
        assertTrue(line.contains("yakusoku"));
    }

    @Test
    public void returnsNullForNonJapaneseText() {
        assertNull(JapaneseRomanizer.romanizeLineOrNull("Hello world 123"));
        assertNull(JapaneseRomanizer.romanizeLineOrNull("안녕하세요"));
        assertNull(JapaneseRomanizer.romanizeLineOrNull(""));
        assertNull(JapaneseRomanizer.romanizeLineOrNull(null));
    }
}
