export const MAX_ITEMS = 10000;
export const idFromUri = (uri, kind) => {
  const value = String(uri ?? "");
  const match =
    /^spotify:(track|album|artist|playlist):([A-Za-z0-9]{22})$/.exec(value);
  if (!match || (kind && match[1] !== kind))
    throw new Error(`Enter a valid Spotify ${kind || "item"} link or URI.`);
  return { kind: match[1], id: match[2], uri: value };
};
export function spotifyUri(input, kind) {
  let value = String(input ?? "").trim();
  if (value.startsWith("https://open.spotify.com/")) {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("intl-")) parts.shift();
    if (parts.length !== 2) throw new Error("Invalid Spotify link.");
    value = `spotify:${parts[0]}:${parts[1]}`;
  }
  return idFromUri(value, kind).uri;
}
export function clean(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
export const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export function genreName(value) {
  const name = clean(value).replace(/[_-]/g, " ").replace(/\s+/g, " ");
  const aliases = {
    hiphop: "hip hop",
    rnb: "r&b",
    "r and b": "r&b",
    "drum & bass": "drum and bass",
    dnb: "drum and bass",
    lofi: "lo fi",
  };
  return aliases[name] || name;
}
export function genreTags(values) {
  return [
    ...new Set(
      values
        .map((value) =>
          genreName(typeof value === "string" ? value : value?.name),
        )
        .filter(
          (name) =>
            name &&
            name.length < 80 &&
            !/^\d+$/.test(name) &&
            ![
              "seen live",
              "favorites",
              "favourite",
              "favorite",
              "my favorites",
              "under 2000 listeners",
              "spotify",
              "all",
            ].includes(name),
        ),
    ),
  ];
}
export function normalizeTrack(raw, index = 0) {
  const item = raw?.item ?? raw?.track ?? raw ?? {};
  const artists = (
    Array.isArray(item.artists) ? item.artists : [item.artist || ""]
  ).map((artist) =>
    typeof artist === "string"
      ? { name: artist, uri: "" }
      : {
          name: artist?.name || "",
          uri: artist?.uri || (artist?.id ? `spotify:artist:${artist.id}` : ""),
        },
  );
  const album = item.album || {};
  return {
    uri: item.uri || "",
    title: item.title || item.name || raw?.name || "Unknown track",
    artist: artists
      .map((artist) => artist.name)
      .filter(Boolean)
      .join(", "),
    artists,
    album: typeof album === "string" ? album : album.title || album.name || "",
    albumUri: album.uri || "",
    image: album.image || album.images?.[0]?.url || "",
    durationMs: finite(item.durationMs ?? item.duration_ms),
    explicit: typeof item.explicit === "boolean" ? item.explicit : null,
    available: typeof item.is_playable === "boolean" ? item.is_playable : null,
    releaseDate: album.release_date || item.releaseDate || "",
    releaseType: album.album_type || item.releaseType || "",
    addedAt: raw?.added_at ? Date.parse(raw.added_at) : finite(raw?.addedAt),
    popularity: finite(item.popularity),
    isrc: item.external_ids?.isrc || item.isrc || "",
    liked: typeof item.liked === "boolean" ? item.liked : null,
    genres: genreTags(item.genres || []),
    features: item.features || {},
    sourceIndex: index,
    rowId: raw?.rowId || "",
    playCount: finite(item.playCount),
    scrobbles: finite(item.scrobbles),
    lastPlayed: finite(item.lastPlayed),
  };
}
export function trackMetric(track, metric) {
  if (track.metadataUnavailable && metric !== "added" && metric !== "liked")
    return null;
  switch (metric) {
    case "title":
      return clean(track.title);
    case "artist":
      return clean(track.artist);
    case "album":
      return clean(track.album);
    case "release":
      return /^\d{4}(-\d{2})?(-\d{2})?$/.test(track.releaseDate)
        ? `${track.releaseDate.slice(0, 4)}-${track.releaseDate.slice(5, 7) || "01"}-${track.releaseDate.slice(8, 10) || "01"}`
        : null;
    case "added":
      return finite(track.addedAt);
    case "duration":
      return finite(track.durationMs);
    case "liked":
      return typeof track.liked === "boolean" ? Number(track.liked) : null;
    case "popularity":
    case "playCount":
    case "scrobbles":
    case "lastPlayed":
      return finite(track[metric]);
    default:
      return finite(track.features?.[metric]);
  }
}
export function sortTracks(tracks, metric = "title", descending = false) {
  return tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => {
      const x = trackMetric(a.track, metric),
        y = trackMetric(b.track, metric);
      if (x == null) return y == null ? a.index - b.index : 1;
      if (y == null) return -1;
      const difference =
        typeof x === "string"
          ? x.localeCompare(String(y))
          : Number(x) - Number(y);
      return (descending ? -difference : difference) || a.index - b.index;
    })
    .map((row) => row.track);
}
export function filterTracks(tracks, options = {}) {
  const seen = new Set(),
    artists = new Set();
  const selected = genreTags(options.genres || []);
  const exclude = new Set(options.exclude || []);
  return tracks.filter((track) => {
    if (exclude.has(track.uri)) return false;
    if (
      options.query &&
      !clean(`${track.title} ${track.artist} ${track.album}`).includes(
        clean(options.query),
      )
    )
      return false;
    if (options.liked === "liked" && track.liked !== true) return false;
    if (options.liked === "unliked" && track.liked !== false) return false;
    if (options.explicit === "clean" && track.explicit !== false) return false;
    if (options.explicit === "explicit" && track.explicit !== true)
      return false;
    if (options.availableOnly && track.available !== true) return false;
    if (
      options.releaseTypes?.length &&
      !options.releaseTypes.includes(track.releaseType)
    )
      return false;
    const tags = new Set(genreTags(track.genres || []));
    if (
      selected.length &&
      !(options.match === "all"
        ? selected.every((tag) => tags.has(tag))
        : selected.some((tag) => tags.has(tag)))
    )
      return false;
    if (options.dedupe) {
      const key =
        options.dedupe === "recording" && track.isrc
          ? `isrc:${track.isrc.toUpperCase()}`
          : track.uri;
      if (!key || seen.has(key)) return false;
      seen.add(key);
    }
    const primary = clean(
      track.artists?.[0]?.uri || track.artists?.[0]?.name || track.artist,
    );
    if (options.onePerArtist && primary) {
      if (artists.has(primary)) return false;
      artists.add(primary);
    }
    return true;
  });
}
export function smartShuffle(tracks, rng = Math.random) {
  const pool = tracks
      .map((track) => ({ track, random: rng() }))
      .sort((a, b) => a.random - b.random)
      .map((row) => row.track),
    result = [];
  let previous = "";
  while (pool.length) {
    let index = pool.findIndex(
      (track) => clean(track.artists?.[0]?.name || track.artist) !== previous,
    );
    if (index < 0) index = 0;
    const [track] = pool.splice(index, 1);
    result.push(track);
    previous = clean(track.artists?.[0]?.name || track.artist);
  }
  return result;
}
export function energyWave(tracks) {
  const known = tracks.filter(
      (track) => finite(track.features?.energy) != null,
    ),
    unknown = tracks.filter((track) => finite(track.features?.energy) == null);
  const sorted = sortTracks(known, "energy");
  return [
    ...sorted.filter((_, i) => i % 2 === 0),
    ...sorted.filter((_, i) => i % 2 === 1).reverse(),
    ...unknown,
  ];
}
export function genreCounts(tracks) {
  const counts = new Map();
  for (const track of tracks)
    for (const name of genreTags(track.genres || []))
      counts.set(name, (counts.get(name) || 0) + 1);
  return [...counts]
    .map(([name, count]) => ({
      name,
      count,
      percentage: tracks.length ? Math.round((100 * count) / tracks.length) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
export function csv(rows, columns) {
  const cell = (value) =>
    `"${String(value ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""')}"`;
  return [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
}
export function requireConfirmation(token, expected) {
  if (token !== expected || !token)
    throw new Error("Preview and confirm this action first.");
}
