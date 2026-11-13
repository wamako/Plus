#!/usr/bin/env python3
"""Apply Wave 3 (Phase 3.4) patches to staged API-2 extension assets."""
from pathlib import Path
import json

MARKER = "/* w3-ja-kanji-fallback */"

# Curated compound + single-kanji lyric reading table aligned with JapaneseRomanizer.java
JA_LEXICON = [
    ("愛している", "aishiteiru"),
    ("愛してる", "aishiteru"),
    ("愛して", "aishite"),
    ("いつまでも", "itsumademo"),
    ("どこまでも", "dokomademo"),
    ("ありがとう", "arigatou"),
    ("有り難う", "arigatou"),
    ("さようなら", "sayounara"),
    ("世界中の", "sekaijuu no"),
    ("世界中", "sekaijuu"),
    ("大丈夫", "daijoubu"),
    ("大好き", "daisuki"),
    ("大嫌い", "daikirai"),
    ("思い出", "omoide"),
    ("想い出", "omoide"),
    ("心の中", "kokoro no naka"),
    ("夕焼け", "yuuyake"),
    ("三日月", "mikazuki"),
    ("夏休み", "natsuyasumi"),
    ("当たり前", "atarimae"),
    ("誕生日", "tanjoubi"),
    ("交差点", "kousaten"),
    ("こんばんは", "konbanwa"),
    ("こんにちは", "konnichiwa"),
    ("忘れない", "wasurenai"),
    ("忘れて", "wasurete"),
    ("忘れる", "wasureru"),
    ("信じてる", "shinjiteru"),
    ("信じて", "shinjite"),
    ("信じる", "shinjiru"),
    ("待ってる", "matteru"),
    ("待って", "matte"),
    ("見つけた", "mitsuketa"),
    ("見つけて", "mitsukete"),
    ("消えない", "kienai"),
    ("消えて", "kiete"),
    ("消える", "kieru"),
    ("変わらない", "kawaranai"),
    ("変わって", "kawatte"),
    ("変わる", "kawaru"),
    ("届かない", "todokanai"),
    ("届いて", "todoite"),
    ("抱きしめて", "dakishimete"),
    ("抱きしめる", "dakishimeru"),
    ("新しい", "atarashii"),
    ("知らない", "shiranai"),
    ("始まりの", "hajimari no"),
    ("始まり", "hajimari"),
    ("始まる", "hajimaru"),
    ("終わらない", "owaranai"),
    ("終わり", "owari"),
    ("終わる", "owaru"),
    ("一人きり", "hitorikiri"),
    ("二人きり", "futarikiri"),
    ("世界", "sekai"),
    ("夜空", "yozora"),
    ("星空", "hoshizora"),
    ("青空", "aozora"),
    ("朝日", "asahi"),
    ("太陽", "taiyou"),
    ("満月", "mangetsu"),
    ("時間", "jikan"),
    ("瞬間", "shunkan"),
    ("永遠", "eien"),
    ("運命", "unmei"),
    ("未来", "mirai"),
    ("過去", "kako"),
    ("現在", "genzai"),
    ("昨日", "kinou"),
    ("今日", "kyou"),
    ("明日", "ashita"),
    ("今夜", "konya"),
    ("毎日", "mainichi"),
    ("毎年", "maitoshi"),
    ("季節", "kisetsu"),
    ("春風", "harukaze"),
    ("冬空", "fuyuzora"),
    ("約束", "yakusoku"),
    ("記憶", "kioku"),
    ("秘密", "himitsu"),
    ("奇跡", "kiseki"),
    ("希望", "kibou"),
    ("孤独", "kodoku"),
    ("現実", "genjitsu"),
    ("真実", "shinjitsu"),
    ("感情", "kanjou"),
    ("鼓動", "kodou"),
    ("呼吸", "kokyuu"),
    ("体温", "taion"),
    ("言葉", "kotoba"),
    ("物語", "monogatari"),
    ("魔法", "mahou"),
    ("夢中", "muchuu"),
    ("透明", "toumei"),
    ("青春", "seishun"),
    ("後悔", "koukai"),
    ("涙色", "namidairo"),
    ("笑顔", "egao"),
    ("横顔", "yokogao"),
    ("気持ち", "kimochi"),
    ("幸せ", "shiawase"),
    ("悲しみ", "kanashimi"),
    ("喜び", "yorokobi"),
    ("優しさ", "yasashisa"),
    ("優しい", "yasashii"),
    ("強さ", "tsuyosa"),
    ("弱さ", "yowasa"),
    ("痛み", "itami"),
    ("痛い", "itai"),
    ("寂しい", "sabishii"),
    ("眩しい", "mabushii"),
    ("愛しい", "itoshii"),
    ("恋しい", "koishii"),
    ("懐かしい", "natsukashii"),
    ("本当", "hontou"),
    ("理由", "wake"),
    ("友達", "tomodachi"),
    ("仲間", "nakama"),
    ("恋人", "koibito"),
    ("彼女", "kanojo"),
    ("彼氏", "kareshi"),
    ("一人", "hitori"),
    ("二人", "futari"),
    ("みんな", "minna"),
    ("自分", "jibun"),
    ("誰か", "dareka"),
    ("何か", "nanika"),
    ("何度", "nando"),
    ("全部", "zenbu"),
    ("全て", "subete"),
    ("少し", "sukoshi"),
    ("もっと", "motto"),
    ("ずっと", "zutto"),
    ("きっと", "kitto"),
    ("突然", "totsuzen"),
    ("偶然", "guuzen"),
    ("花火", "hanabi"),
    ("桜色", "sakurairo"),
    ("天使", "tenshi"),
    ("悪魔", "akuma"),
    ("天気", "tenki"),
    ("夕方", "yuugata"),
    ("音楽", "ongaku"),
    ("電車", "densha"),
    ("信号", "shingou"),
    ("景色", "keshiki"),
    ("風景", "fuukei"),
    ("東京", "toukyou"),
    ("日本", "nihon"),
    ("あなた", "anata"),
    ("貴方", "anata"),
    ("待つ", "matsu"),
    ("笑って", "waratte"),
    ("笑う", "warau"),
    ("泣いて", "naite"),
    ("泣く", "naku"),
    ("走って", "hashitte"),
    ("走る", "hashiru"),
    ("歩いて", "aruite"),
    ("歩く", "aruku"),
    ("探して", "sagashite"),
    ("探す", "sagasu"),
    ("届く", "todoku"),
    ("輝く", "kagayaku"),
    ("輝いて", "kagayaite"),
    ("光る", "hikaru"),
    ("好き", "suki"),
    ("嫌い", "kirai"),
    ("古い", "furui"),
    ("高い", "takai"),
    ("遠い", "tooi"),
    ("近い", "chikai"),
    ("深い", "fukai"),
    ("強い", "tsuyoi"),
    ("弱い", "yowai"),
    ("白い", "shiroi"),
    ("黒い", "kuroi"),
    ("赤い", "akai"),
    ("青い", "aoi"),
    ("黄色", "kiiro"),
    ("生まれる", "umareru"),
    ("生きる", "ikiru"),
    ("生きて", "ikite"),
    ("死ぬ", "shinu"),
    ("思う", "omou"),
    ("思って", "omotte"),
    ("想う", "omou"),
    ("願う", "negau"),
    ("願い", "negai"),
    ("祈り", "inori"),
    ("祈る", "inoru"),
    ("叫ぶ", "sakebu"),
    ("歌う", "utau"),
    ("踊る", "odoru"),
    ("会いたい", "aitai"),
    ("会える", "aeru"),
    ("会う", "au"),
    ("見る", "miru"),
    ("見て", "mite"),
    ("聞く", "kiku"),
    ("聴く", "kiku"),
    ("知る", "shiru"),
    ("分かる", "wakaru"),
    ("行く", "iku"),
    ("来る", "kuru"),
    ("帰る", "kaeru"),
    ("帰ろう", "kaerou"),
    ("飛ぶ", "tobu"),
    ("落ちる", "ochiru"),
    ("咲く", "saku"),
    ("散る", "chiru"),
    ("眠る", "nemuru"),
    ("覚める", "sameru"),
    ("起きる", "okiru"),
    ("心", "kokoro"),
    ("涙", "namida"),
    ("嘘", "uso"),
    ("翼", "tsubasa"),
    ("光", "hikari"),
    ("闇", "yami"),
    ("星", "hoshi"),
    ("月", "tsuki"),
    ("空", "sora"),
    ("雲", "kumo"),
    ("風", "kaze"),
    ("雨", "ame"),
    ("雪", "yuki"),
    ("虹", "niji"),
    ("雷", "kaminari"),
    ("花", "hana"),
    ("桜", "sakura"),
    ("海", "umi"),
    ("波", "nami"),
    ("山", "yama"),
    ("川", "kawa"),
    ("森", "mori"),
    ("春", "haru"),
    ("夏", "natsu"),
    ("秋", "aki"),
    ("冬", "fuyu"),
    ("朝", "asa"),
    ("昼", "hiru"),
    ("夜", "yoru"),
    ("今", "ima"),
    ("昔", "mukashi"),
    ("愛", "ai"),
    ("恋", "koi"),
    ("夢", "yume"),
    ("歌", "uta"),
    ("声", "koe"),
    ("音", "oto"),
    ("色", "iro"),
    ("影", "kage"),
    ("傷", "kizu"),
    ("道", "michi"),
    ("町", "machi"),
    ("街", "machi"),
    ("扉", "tobira"),
    ("鍵", "kagi"),
    ("窓", "mado"),
    ("部屋", "heya"),
    ("家", "ie"),
    ("駅", "eki"),
    ("私", "watashi"),
    ("僕", "boku"),
    ("俺", "ore"),
    ("君", "kimi"),
    ("誰", "dare"),
    ("何", "nani"),
    ("手", "te"),
    ("目", "me"),
    ("瞳", "hitomi"),
    ("唇", "kuchibiru"),
    ("胸", "mune"),
    ("背中", "senaka"),
    ("肩", "kata"),
    ("指", "yubi"),
    ("髪", "kami"),
    ("顔", "kao"),
    ("一", "ichi"),
    ("二", "ni"),
    ("三", "san"),
    ("四", "yon"),
    ("五", "go"),
    ("六", "roku"),
    ("七", "nana"),
    ("八", "hachi"),
    ("九", "kyuu"),
    ("十", "juu"),
    ("百", "hyaku"),
    ("千", "sen"),
    ("万", "man"),
    ("年", "toshi"),
    ("日", "hi"),
    ("前", "mae"),
    ("後", "ato"),
    ("上", "ue"),
    ("下", "shita"),
    ("中", "naka"),
    ("外", "soto"),
    ("隣", "tonari"),
]

TARGET_JA_LINE = '  if (code === "ja") return /[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{20000}-\\u{323af}]/u.test(text) ? void 0 : (0, import_wanakana.toRomaji)(text);'


def _build_helper_js() -> str:
    # Sort longest surface first so compound matches win over single characters.
    ordered = sorted(JA_LEXICON, key=lambda kv: (-len(kv[0]), kv[0]))
    entries_json = json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))
    return (
        f"{MARKER}\n"
        f"var __w3JaLexicon = {entries_json};\n"
        "function __w3JaRomanize(text, toRomaji) {\n"
        "  if (!/[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u{20000}-\\u{323af}]/u.test(text)) {\n"
        "    return toRomaji(text);\n"
        "  }\n"
        "  var out = \"\";\n"
        "  var i = 0;\n"
        "  while (i < text.length) {\n"
        "    var matched = null;\n"
        "    for (var j = 0; j < __w3JaLexicon.length; j++) {\n"
        "      var entry = __w3JaLexicon[j];\n"
        "      if (text.startsWith(entry[0], i)) {\n"
        "        matched = entry;\n"
        "        break;\n"
        "      }\n"
        "    }\n"
        "    if (matched) {\n"
        "      if (out.length > 0 && !/[\\s(]$/.test(out)) out += \" \";\n"
        "      out += matched[1] + \" \";\n"
        "      i += matched[0].length;\n"
        "    } else {\n"
        "      var kanaStart = i;\n"
        "      while (i < text.length) {\n"
        "        var ch = text[i];\n"
        "        var isKanji = (ch >= \"\\u3400\" && ch <= \"\\u4dbf\") || (ch >= \"\\u4e00\" && ch <= \"\\u9fff\") || (ch >= \"\\uf900\" && ch <= \"\\ufaff\");\n"
        "        if (isKanji) break;\n"
        "        i++;\n"
        "      }\n"
        "      if (i > kanaStart) {\n"
        "        out += toRomaji(text.slice(kanaStart, i));\n"
        "      } else {\n"
        "        if (out.length > 0 && !/[\\s(]$/.test(out)) out += \" \";\n"
        "        out += text[i] + \" \";\n"
        "        i++;\n"
        "      }\n"
        "    }\n"
        "  }\n"
        "  var cleaned = out.replace(/\\s+/g, \" \").replace(/\\s+([,.)!?])/g, \"$1\").trim();\n"
        "  return /[A-Za-z]/.test(cleaned) ? cleaned : void 0;\n"
        "}\n"
    )


def patch_beautiful_lyrics_bundle(bundle_js: Path) -> bool:
    """Patches beautiful-lyrics/index.js idempotently to romanize Kanji lyric lines."""
    content = bundle_js.read_text(encoding="utf-8")
    if MARKER in content:
        return False
    anchor = "function localRomanization(text, language) {"
    if anchor not in content or TARGET_JA_LINE not in content:
        raise ValueError(f"Expected localRomanization anchors not found in {bundle_js}")
    content = content.replace(anchor, _build_helper_js() + anchor, 1)
    content = content.replace(
        TARGET_JA_LINE,
        '  if (code === "ja") return __w3JaRomanize(text, function(s) { return (0, import_wanakana.toRomaji)(s); });',
        1,
    )
    bundle_js.write_text(content, encoding="utf-8")
    return True


def apply(assets: Path) -> None:
    bundle_js = assets / "api2-extensions" / "beautiful-lyrics" / "index.js"
    if bundle_js.is_file():
        patch_beautiful_lyrics_bundle(bundle_js)
