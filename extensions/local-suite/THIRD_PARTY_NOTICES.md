# Attribution and pinned references

These are independently implemented Android adaptations, not official releases
by the original extension authors and not drop-in desktop bundles. No upstream
extension source or genre dataset is included in the phone bundles.

| Inspiration / reference                                                                       | Inspected commit                         | License observed                                  |
| --------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| [HeadshotInteractive/listening-stats](https://github.com/HeadshotInteractive/listening-stats) | 738383945b01c55373af740d5b3d08985467a4e2 | MIT                                               |
| [hoeci/sort-play](https://github.com/hoeci/sort-play)                                         | 476b43d142911ca79178c0a1f8edc92901ea6222 | MIT                                               |
| [LucasOe/spicetify-genres](https://github.com/LucasOe/spicetify-genres)                       | 59dd0e75e2dce5da4c525ebed22eb43ab19f3ba3 | No source license found; referenced, not copied   |
| [paramkathir/spotify-playlist-plus](https://github.com/paramkathir/spotify-playlist-plus)     | e47a8d2e3768e3ebc479bbcf4f409278efb78b71 | No source license found; referenced, not copied   |
| [Spotify Plus SDK](https://github.com/LeNerd46/SpotifyPlus)                                   | 615455bf0a7a81cd2d01382a1f1e9e0a699fb082 | Runtime external; pinned for build and validation |

The genre page requests descriptive data at runtime from
https://lucasoe.github.io/spicetify-genres/api/ after an explicit genre tap.
That data is credited in the page. Last.fm and Stats.fm are optional remote
providers; their data and availability remain their responsibility.

Each bundle includes abort-controller 3.0.0 and event-target-shim 5.0.1:

## abort-controller — MIT License

Copyright (c) 2017 Toru Nagashima

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## event-target-shim — MIT License

Copyright (c) 2015 Toru Nagashima

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Read-only saved collection protocol references (0.1.2)

The collection-v2 page fields and content type were checked against
[collection2v2.proto](https://github.com/LargeModGames/spotatui-librespot/blob/spotatui/protocol/proto/collection2v2.proto)
and the author's [SpClient collection paging implementation](https://github.com/LargeModGames/spotatui-librespot/blob/spotatui/core/src/spclient.rs).
Context URI/page semantics were checked against
[librespot SpClient](https://github.com/librespot-org/librespot/blob/dev/core/src/spclient.rs)
and its Context/ContextPage protocol descriptors. The extension implements its
own bounded read-only wire encoder/parser; no upstream library code is bundled,
and no collection write, remove or delta mutation operation is implemented.
