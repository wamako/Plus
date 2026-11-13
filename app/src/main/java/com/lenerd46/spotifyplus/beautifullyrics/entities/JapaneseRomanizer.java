package com.lenerd46.spotifyplus.beautifullyrics.entities;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Offline client-side Japanese Kana -> Hepburn romanization with a curated longest-match
 * Kanji/compound lyric reading lexicon. Designed so lines containing Kanji still receive
 * helpful phonetic readings instead of returning null.
 */
public final class JapaneseRomanizer {
    private static final Map<String, String> KANA_MAP = new HashMap<>();
    private static final Map<Character, List<WordEntry>> WORD_INDEX = new HashMap<>();
    private static final Map<String, String> KATAKANA_ONLY_OVERRIDES = new HashMap<>();

    private static final class WordEntry {
        final String surface;
        final String romaji;

        WordEntry(String surface, String romaji) {
            this.surface = surface;
            this.romaji = romaji;
        }
    }

    static {
        initKanaMap();
        initLexicon();
    }

    private JapaneseRomanizer() {
    }

    public static boolean isHiragana(char c) {
        return c >= '\u3041' && c <= '\u3096';
    }

    public static boolean isKatakana(char c) {
        return (c >= '\u30A1' && c <= '\u30FA') || c == '\u30FC';
    }

    public static boolean isKana(char c) {
        return isHiragana(c) || isKatakana(c) || c == '\u309D' || c == '\u309E' || c == '\u30FD' || c == '\u30FE';
    }

    public static boolean isKanji(char c) {
        return (c >= '\u4E00' && c <= '\u9FFF')
                || (c >= '\u3400' && c <= '\u4DBF')
                || (c >= '\uF900' && c <= '\uFAFF')
                || c == '\u3005';
    }

    public static boolean containsJapanese(String text) {
        if (text == null || text.isEmpty()) return false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (isKana(c) || isKanji(c)) return true;
        }
        return false;
    }

    public static String romanizeLineOrNull(String text) {
        if (!containsJapanese(text)) return null;
        String result = romanize(text);
        if (result.isEmpty() || result.equals(text.trim())) return null;
        return result;
    }

    public static String romanize(String input) {
        if (input == null || input.isEmpty()) return "";
        StringBuilder out = new StringBuilder(input.length() * 2);
        int len = input.length();
        boolean pendingGemination = false;
        boolean prevWasLexiconWord = false;
        char lastLatinVowel = 0;

        int i = 0;
        while (i < len) {
            char c = input.charAt(i);

            // Normalize full-width spaces and Japanese punctuation.
            if (c == '\u3000' || Character.isWhitespace(c)) {
                pendingGemination = false;
                prevWasLexiconWord = false;
                lastLatinVowel = 0;
                if (out.length() > 0 && out.charAt(out.length() - 1) != ' ') {
                    out.append(' ');
                }
                i++;
                continue;
            }
            if (c == '、' || c == '，') {
                pendingGemination = false;
                prevWasLexiconWord = false;
                lastLatinVowel = 0;
                appendPunctuation(out, ", ");
                i++;
                continue;
            }
            if (c == '。' || c == '．') {
                pendingGemination = false;
                prevWasLexiconWord = false;
                lastLatinVowel = 0;
                appendPunctuation(out, ".");
                i++;
                continue;
            }
            if (c == '！' || c == '？' || c == '♪' || c == '「' || c == '」' || c == '（' || c == '）') {
                pendingGemination = false;
                prevWasLexiconWord = false;
                lastLatinVowel = 0;
                char mapped = c == '！' ? '!' : (c == '？' ? '?' : (c == '「' || c == '」' ? '"' : (c == '（' ? '(' : (c == '）' ? ')' : c))));
                out.append(mapped);
                i++;
                continue;
            }

            // Longest-match lexicon lookup (handles Kanji compounds and Kanji+okurigana stems).
            WordEntry matched = matchLexicon(input, i);
            if (matched != null) {
                if (pendingGemination && !matched.romaji.isEmpty()) {
                    char first = matched.romaji.charAt(0);
                    if (isConsonant(first)) {
                        out.append(matched.romaji.startsWith("ch") ? 't' : first);
                    }
                    pendingGemination = false;
                }
                if (out.length() > 0 && needsSpaceBeforeToken(out.charAt(out.length() - 1))) {
                    out.append(' ');
                }
                out.append(matched.romaji);
                lastLatinVowel = lastVowelOf(matched.romaji);
                prevWasLexiconWord = true;
                i += matched.surface.length();
                continue;
            }

            // Sokuon (small tsu)
            if (c == 'っ' || c == 'ッ') {
                pendingGemination = true;
                i++;
                continue;
            }

            // Choonpu (long vowel mark)
            if (c == 'ー') {
                pendingGemination = false;
                if (lastLatinVowel != 0) {
                    out.append(lastLatinVowel == 'e' ? 'i' : (lastLatinVowel == 'o' ? 'u' : lastLatinVowel));
                }
                i++;
                continue;
            }

            // Syllabic N
            if (c == 'ん' || c == 'ン') {
                pendingGemination = false;
                String nextRomaji = peekNextKanaRomaji(input, i + 1);
                if (nextRomaji != null && !nextRomaji.isEmpty()) {
                    char nextFirst = nextRomaji.charAt(0);
                    if (isVowel(nextFirst) || nextFirst == 'y') {
                        out.append("n'");
                    } else if (nextFirst == 'b' || nextFirst == 'm' || nextFirst == 'p') {
                        out.append('m');
                    } else {
                        out.append('n');
                    }
                } else {
                    out.append('n');
                }
                lastLatinVowel = 0;
                prevWasLexiconWord = false;
                i++;
                continue;
            }

            // Two-char kana digraphs
            if (i + 1 < len) {
                String pair = normalizeToHiragana(input.substring(i, i + 2));
                String katPair = input.substring(i, i + 2);
                String pairRomaji = KATAKANA_ONLY_OVERRIDES.get(katPair);
                if (pairRomaji == null) pairRomaji = KANA_MAP.get(pair);
                if (pairRomaji != null) {
                    if (prevWasLexiconWord && out.length() > 0 && out.charAt(out.length() - 1) != ' ') {
                        // Separate particle/kana gently from preceding Kanji word if it begins cleanly
                    }
                    prevWasLexiconWord = false;
                    appendKanaRomaji(out, pairRomaji, pendingGemination);
                    pendingGemination = false;
                    lastLatinVowel = lastVowelOf(pairRomaji);
                    i += 2;
                    continue;
                }
            }

            // Single kana
            if (isKana(c)) {
                if (prevWasLexiconWord && (c == 'は' || c == 'が' || c == 'を' || c == 'に' || c == 'へ'
                        || c == 'と' || c == 'で' || c == 'の' || c == 'も' || c == 'や'
                        || input.startsWith("から", i) || input.startsWith("まで", i))) {
                    if (out.length() > 0 && out.charAt(out.length() - 1) != ' ') {
                        out.append(' ');
                    }
                }
                prevWasLexiconWord = false;
                String hira = normalizeToHiragana(String.valueOf(c));
                String singleRomaji = KANA_MAP.get(hira);
                if (singleRomaji != null) {
                    if (c == 'は' && isLikelyWaParticle(input, i)) {
                        singleRomaji = "wa";
                    } else if (c == 'へ' && isLikelyEParticle(input, i)) {
                        singleRomaji = "e";
                    }
                    appendKanaRomaji(out, singleRomaji, pendingGemination);
                    pendingGemination = false;
                    lastLatinVowel = lastVowelOf(singleRomaji);
                    if ((c == 'は' || c == 'を' || c == 'が' || c == 'に' || c == 'へ' || c == 'の' || c == 'で' || c == 'と')
                            && isLikelyWaOrCaseBoundary(input, i)) {
                        if (i + 1 < len && (isKanji(input.charAt(i + 1)) || Character.isLetter(input.charAt(i + 1)))) {
                            out.append(' ');
                        }
                    }
                    i++;
                    continue;
                }
            }

            // Passthrough Latin/digits or unmapped Kanji (preserve spacing nicely).
            pendingGemination = false;
            lastLatinVowel = 0;
            if (isKanji(c) && prevWasLexiconWord && out.length() > 0 && out.charAt(out.length() - 1) != ' ') {
                out.append(' ');
            }
            prevWasLexiconWord = false;
            out.append(c);
            i++;
        }

        return collapseSpaces(out.toString());
    }

    private static boolean needsSpaceBeforeToken(char prevChar) {
        return prevChar != ' ' && prevChar != '"' && prevChar != '(' && prevChar != '\n';
    }

    private static boolean isLikelyWaParticle(String input, int idx) {
        boolean prevIsNounOrSpace = idx == 0 || isKanji(input.charAt(idx - 1)) || Character.isWhitespace(input.charAt(idx - 1));
        boolean nextExists = idx + 1 < input.length();
        char next = nextExists ? input.charAt(idx + 1) : 0;
        return prevIsNounOrSpace && (!nextExists || Character.isWhitespace(next) || isKanji(next) || isKana(next));
    }

    private static boolean isLikelyEParticle(String input, int idx) {
        if (idx == 0) return false;
        char prev = input.charAt(idx - 1);
        return isKanji(prev) || isKana(prev);
    }

    private static boolean isLikelyWaOrCaseBoundary(String input, int idx) {
        return idx > 0 && (isKanji(input.charAt(idx - 1)) || idx + 1 < input.length() && isKanji(input.charAt(idx + 1)));
    }

    private static void appendKanaRomaji(StringBuilder out, String romaji, boolean pendingGemination) {
        if (pendingGemination && !romaji.isEmpty()) {
            char first = romaji.charAt(0);
            if (isConsonant(first)) {
                out.append(romaji.startsWith("ch") ? 't' : first);
            }
        }
        out.append(romaji);
    }

    private static String peekNextKanaRomaji(String input, int idx) {
        if (idx >= input.length()) return null;
        WordEntry entry = matchLexicon(input, idx);
        if (entry != null) return entry.romaji;
        String key = normalizeToHiragana(String.valueOf(input.charAt(idx)));
        return KANA_MAP.get(key);
    }

    private static void appendPunctuation(StringBuilder out, String punct) {
        while (out.length() > 0 && out.charAt(out.length() - 1) == ' ') {
            out.deleteCharAt(out.length() - 1);
        }
        out.append(punct);
    }

    private static String collapseSpaces(String raw) {
        StringBuilder sb = new StringBuilder(raw.length());
        boolean lastSpace = false;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == ' ') {
                if (!lastSpace && sb.length() > 0) sb.append(' ');
                lastSpace = true;
            } else {
                sb.append(c);
                lastSpace = false;
            }
        }
        int end = sb.length();
        while (end > 0 && sb.charAt(end - 1) == ' ') end--;
        return sb.substring(0, end);
    }

    private static WordEntry matchLexicon(String text, int index) {
        List<WordEntry> bucket = WORD_INDEX.get(text.charAt(index));
        if (bucket == null) return null;
        for (WordEntry entry : bucket) {
            if (text.startsWith(entry.surface, index)) {
                return entry;
            }
        }
        return null;
    }

    private static String normalizeToHiragana(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '\u30A1' && c <= '\u30F6') {
                sb.append((char) (c - 0x60));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static boolean isVowel(char c) {
        return c == 'a' || c == 'i' || c == 'u' || c == 'e' || c == 'o';
    }

    private static boolean isConsonant(char c) {
        return c >= 'a' && c <= 'z' && !isVowel(c);
    }

    private static char lastVowelOf(String s) {
        for (int i = s.length() - 1; i >= 0; i--) {
            char c = s.charAt(i);
            if (isVowel(c)) return c;
        }
        return 0;
    }

    private static void addWord(String surface, String romaji) {
        WORD_INDEX.computeIfAbsent(surface.charAt(0), k -> new ArrayList<>())
                .add(new WordEntry(surface, romaji));
    }

    private static void initKanaMap() {
        String[][] basic = {
                {"あ", "a"}, {"い", "i"}, {"う", "u"}, {"え", "e"}, {"お", "o"},
                {"か", "ka"}, {"き", "ki"}, {"く", "ku"}, {"け", "ke"}, {"こ", "ko"},
                {"さ", "sa"}, {"し", "shi"}, {"す", "su"}, {"せ", "se"}, {"そ", "so"},
                {"た", "ta"}, {"ち", "chi"}, {"つ", "tsu"}, {"て", "te"}, {"と", "to"},
                {"な", "na"}, {"に", "ni"}, {"ぬ", "nu"}, {"ね", "ne"}, {"の", "no"},
                {"は", "ha"}, {"ひ", "hi"}, {"ふ", "fu"}, {"へ", "he"}, {"ほ", "ho"},
                {"ま", "ma"}, {"み", "mi"}, {"む", "mu"}, {"め", "me"}, {"も", "mo"},
                {"や", "ya"}, {"ゆ", "yu"}, {"よ", "yo"},
                {"ら", "ra"}, {"り", "ri"}, {"る", "ru"}, {"れ", "re"}, {"ろ", "ro"},
                {"わ", "wa"}, {"ゐ", "i"}, {"ゑ", "e"}, {"を", "o"},
                {"が", "ga"}, {"ぎ", "gi"}, {"ぐ", "gu"}, {"げ", "ge"}, {"ご", "go"},
                {"ざ", "za"}, {"じ", "ji"}, {"ず", "zu"}, {"ぜ", "ze"}, {"ぞ", "zo"},
                {"だ", "da"}, {"ぢ", "ji"}, {"づ", "zu"}, {"で", "de"}, {"ど", "do"},
                {"ば", "ba"}, {"び", "bi"}, {"ぶ", "bu"}, {"べ", "be"}, {"ぼ", "bo"},
                {"ぱ", "pa"}, {"ぴ", "pi"}, {"ぷ", "pu"}, {"ぺ", "pe"}, {"ぽ", "po"},
                {"ゔ", "vu"}, {"ぁ", "a"}, {"ぃ", "i"}, {"ぅ", "u"}, {"ぇ", "e"}, {"ぉ", "o"},
                {"ゃ", "ya"}, {"ゅ", "yu"}, {"ょ", "yo"},
                // Digraphs
                {"きゃ", "kya"}, {"きゅ", "kyu"}, {"きょ", "kyo"},
                {"しゃ", "sha"}, {"しゅ", "shu"}, {"しょ", "sho"},
                {"ちゃ", "cha"}, {"ちゅ", "chu"}, {"ちょ", "cho"},
                {"にゃ", "nya"}, {"にゅ", "nyu"}, {"にょ", "nyo"},
                {"ひゃ", "hya"}, {"ひゅ", "hyu"}, {"ひょ", "hyo"},
                {"みゃ", "mya"}, {"みゅ", "myu"}, {"みょ", "myo"},
                {"りゃ", "rya"}, {"りゅ", "ryu"}, {"りょ", "ryo"},
                {"ぎゃ", "gya"}, {"ぎゅ", "gyu"}, {"ぎょ", "gyo"},
                {"じゃ", "ja"}, {"じゅ", "ju"}, {"じょ", "jo"},
                {"びゃ", "bya"}, {"びゅ", "byu"}, {"びょ", "byo"},
                {"ぴゃ", "pya"}, {"ぴゅ", "pyu"}, {"ぴょ", "pyo"}
        };
        for (String[] pair : basic) {
            KANA_MAP.put(pair[0], pair[1]);
        }

        String[][] loanwords = {
                {"ティ", "ti"}, {"ディ", "di"}, {"デュ", "dyu"}, {"トゥ", "tu"}, {"ドゥ", "du"},
                {"ファ", "fa"}, {"フィ", "fi"}, {"フェ", "fe"}, {"フォ", "fo"}, {"フュ", "fyu"},
                {"ウィ", "wi"}, {"ウェ", "we"}, {"ウォ", "wo"},
                {"ヴァ", "va"}, {"ヴィ", "vi"}, {"ヴェ", "ve"}, {"ヴォ", "vo"},
                {"シェ", "she"}, {"ジェ", "je"}, {"チェ", "che"},
                {"ツァ", "tsa"}, {"ツィ", "tsi"}, {"ツェ", "tse"}, {"ツォ", "tso"}
        };
        for (String[] pair : loanwords) {
            KATAKANA_ONLY_OVERRIDES.put(pair[0], pair[1]);
        }
    }

    private static void initLexicon() {
        String[][] words = {
                // Compounds / multi-kanji / common lyric phrases (longest match first)
                {"愛してる", "aishiteru"}, {"愛している", "aishiteiru"}, {"愛して", "aishite"},
                {"ありがとう", "arigatou"}, {"有り難う", "arigatou"},
                {"さようなら", "sayounara"}, {"大好き", "daisuki"}, {"大嫌い", "daikirai"},
                {"大丈夫", "daijoubu"}, {"思い出", "omoide"}, {"想い出", "omoide"},
                {"いつまでも", "itsumademo"}, {"どこまでも", "dokomademo"},
                {"世界中の", "sekaijuu no"}, {"世界中", "sekaijuu"}, {"世界", "sekai"},
                {"夜空", "yozora"}, {"星空", "hoshizora"}, {"青空", "aozora"}, {"夕焼け", "yuuyake"},
                {"朝日", "asahi"}, {"太陽", "taiyou"}, {"三日月", "mikazuki"}, {"満月", "mangetsu"},
                {"時間", "jikan"}, {"瞬間", "shunkan"}, {"永遠", "eien"}, {"運命", "unmei"},
                {"未来", "mirai"}, {"過去", "kako"}, {"現在", "genzai"},
                {"昨日", "kinou"}, {"今日", "kyou"}, {"明日", "ashita"}, {"今夜", "konya"},
                {"毎日", "mainichi"}, {"毎年", "maitoshi"}, {"季節", "kisetsu"},
                {"春風", "harukaze"}, {"夏休み", "natsuyasumi"}, {"冬空", "fuyuzora"},
                {"約束", "yakusoku"}, {"記憶", "kioku"}, {"秘密", "himitsu"}, {"奇跡", "kiseki"},
                {"希望", "kibou"}, {"孤独", "kodoku"}, {"現実", "genjitsu"}, {"真実", "shinjitsu"},
                {"感情", "kanjou"}, {"鼓動", "kodou"}, {"呼吸", "kokyuu"}, {"体温", "taion"},
                {"言葉", "kotoba"}, {"物語", "monogatari"}, {"魔法", "mahou"}, {"夢中", "muchuu"},
                {"透明", "toumei"}, {"青春", "seishun"}, {"後悔", "koukai"}, {"涙色", "namidairo"},
                {"笑顔", "egao"}, {"横顔", "yokogao"}, {"涙", "namida"},
                {"気持ち", "kimochi"}, {"心の中", "kokoro no naka"}, {"心", "kokoro"},
                {"幸せ", "shiawase"}, {"悲しみ", "kanashimi"}, {"喜び", "yorokobi"},
                {"優しさ", "yasashisa"}, {"優しい", "yasashii"}, {"強さ", "tsuyosa"}, {"弱さ", "yowasa"},
                {"痛み", "itami"}, {"痛い", "itai"}, {"寂しい", "sabishii"}, {"眩しい", "mabushii"},
                {"愛しい", "itoshii"}, {"恋しい", "koishii"}, {"懐かしい", "natsukashii"},
                {"本当", "hontou"}, {"嘘", "uso"}, {"理由", "wake"},
                {"友達", "tomodachi"}, {"仲間", "nakama"}, {"恋人", "koibito"},
                {"彼女", "kanojo"}, {"彼氏", "kareshi"},
                {"一人", "hitori"}, {"二人", "futari"}, {"みんな", "minna"},
                {"自分", "jibun"}, {"誰か", "dareka"}, {"何か", "nanika"}, {"何度", "nando"},
                {"全部", "zenbu"}, {"全て", "subete"}, {"少し", "sukoshi"}, {"もっと", "motto"},
                {"ずっと", "zutto"}, {"きっと", "kitto"}, {"突然", "totsuzen"}, {"偶然", "guuzen"},
                {"当たり前", "atarimae"}, {"誕生日", "tanjoubi"}, {"花火", "hanabi"},
                {"桜色", "sakurairo"}, {"天使", "tenshi"}, {"悪魔", "akuma"}, {"翼", "tsubasa"},
                {"光", "hikari"}, {"闇", "yami"}, {"星", "hoshi"}, {"月", "tsuki"},
                {"空", "sora"}, {"雲", "kumo"}, {"風", "kaze"}, {"雨", "ame"}, {"雪", "yuki"},
                {"虹", "niji"}, {"雷", "kaminari"}, {"花", "hana"}, {"桜", "sakura"},
                {"海", "umi"}, {"波", "nami"}, {"山", "yama"}, {"川", "kawa"}, {"森", "mori"},
                {"春", "haru"}, {"夏", "natsu"}, {"秋", "aki"}, {"冬", "fuyu"}, {"天気", "tenki"},
                {"朝", "asa"}, {"昼", "hiru"}, {"夜", "yoru"}, {"夕方", "yuugata"},
                {"今日", "kyou"}, {"今", "ima"}, {"昔", "mukashi"},
                {"愛", "ai"}, {"恋", "koi"}, {"夢", "yume"}, {"歌", "uta"}, {"声", "koe"},
                {"音", "oto"}, {"音楽", "ongaku"}, {"色", "iro"}, {"影", "kage"}, {"傷", "kizu"},
                {"道", "michi"}, {"町", "machi"}, {"街", "machi"}, {"扉", "tobira"}, {"鍵", "kagi"},
                {"窓", "mado"}, {"部屋", "heya"}, {"家", "ie"}, {"電車", "densha"}, {"駅", "eki"},
                {"信号", "shingou"}, {"交差点", "kousaten"}, {"景色", "keshiki"}, {"風景", "fuukei"},
                {"東京", "toukyou"}, {"日本", "nihon"},
                // Pronouns & interrogatives
                {"私", "watashi"}, {"僕", "boku"}, {"俺", "ore"}, {"君", "kimi"},
                {"あなた", "anata"}, {"貴方", "anata"}, {"誰", "dare"}, {"何", "nani"},
                {"こんばんは", "konbanwa"}, {"こんにちは", "konnichiwa"},
                // Body
                {"手", "te"}, {"目", "me"}, {"瞳", "hitomi"}, {"唇", "kuchibiru"}, {"胸", "mune"},
                {"背中", "senaka"}, {"肩", "kata"}, {"指", "yubi"}, {"髪", "kami"}, {"顔", "kao"},
                // Common verb / adjective stems in lyrics
                {"忘れない", "wasurenai"}, {"忘れて", "wasurete"}, {"忘れる", "wasureru"},
                {"信じてる", "shinjiteru"}, {"信じて", "shinjite"}, {"信じる", "shinjiru"},
                {"待ってる", "matteru"}, {"待って", "matte"}, {"待つ", "matsu"},
                {"笑って", "waratte"}, {"笑う", "warau"}, {"泣いて", "naite"}, {"泣く", "naku"},
                {"走って", "hashitte"}, {"走る", "hashiru"}, {"歩いて", "aruite"}, {"歩く", "aruku"},
                {"探して", "sagashite"}, {"探す", "sagasu"}, {"見つけた", "mitsuketa"}, {"見つけて", "mitsukete"},
                {"消えない", "kienai"}, {"消えて", "kiete"}, {"消える", "kieru"},
                {"変わらない", "kawaranai"}, {"変わって", "kawatte"}, {"変わる", "kawaru"},
                {"届かない", "todokanai"}, {"届いて", "todoite"}, {"届く", "todoku"},
                {"輝く", "kagayaku"}, {"輝いて", "kagayaite"}, {"光る", "hikaru"},
                {"抱きしめて", "dakishimete"}, {"抱きしめる", "dakishimeru"},
                {"好き", "suki"}, {"嫌い", "kirai"}, {"新しい", "atarashii"}, {"古い", "furui"},
                {"高い", "takai"}, {"遠い", "tooi"}, {"近い", "chikai"}, {"深い", "fukai"},
                {"強い", "tsuyoi"}, {"弱い", "yowai"}, {"白い", "shiroi"}, {"黒い", "kuroi"},
                {"赤い", "akai"}, {"青い", "aoi"}, {"黄色", "kiiro"},
                {"生まれる", "umareru"}, {"生きる", "ikiru"}, {"生きて", "ikite"}, {"死ぬ", "shinu"},
                {"思う", "omou"}, {"思って", "omotte"}, {"想う", "omou"}, {"願う", "negau"}, {"願い", "negai"},
                {"祈り", "inori"}, {"祈る", "inoru"}, {"叫ぶ", "sakebu"}, {"歌う", "utau"}, {"踊る", "odoru"},
                {"会いたい", "aitai"}, {"会える", "aeru"}, {"会う", "au"},
                {"見る", "miru"}, {"見て", "mite"}, {"聞く", "kiku"}, {"聴く", "kiku"},
                {"知る", "shiru"}, {"知らない", "shiranai"}, {"分かる", "wakaru"},
                {"行く", "iku"}, {"来る", "kuru"}, {"帰る", "kaeru"}, {"帰ろう", "kaerou"},
                {"飛ぶ", "tobu"}, {"落ちる", "ochiru"}, {"咲く", "saku"}, {"散る", "chiru"},
                {"眠る", "nemuru"}, {"覚める", "sameru"}, {"起きる", "okiru"},
                {"始まりの", "hajimari no"}, {"始まり", "hajimari"}, {"始まる", "hajimaru"},
                {"終わり", "owari"}, {"終わらない", "owaranai"}, {"終わる", "owaru"},
                {"一人きり", "hitorikiri"}, {"二人きり", "futarikiri"},
                {"一", "ichi"}, {"二", "ni"}, {"三", "san"}, {"四", "yon"}, {"五", "go"},
                {"六", "roku"}, {"七", "nana"}, {"八", "hachi"}, {"九", "kyuu"}, {"十", "juu"},
                {"百", "hyaku"}, {"千", "sen"}, {"万", "man"},
                {"年", "toshi"}, {"日", "hi"}, {"前", "mae"}, {"後", "ato"},
                {"上", "ue"}, {"下", "shita"}, {"中", "naka"}, {"外", "soto"}, {"隣", "tonari"}
        };
        for (String[] entry : words) {
            addWord(entry[0], entry[1]);
        }
        // Sort each bucket descending by surface length for longest-match-first.
        for (List<WordEntry> bucket : WORD_INDEX.values()) {
            Collections.sort(bucket, (a, b) -> Integer.compare(b.surface.length(), a.surface.length()));
        }
    }
}
