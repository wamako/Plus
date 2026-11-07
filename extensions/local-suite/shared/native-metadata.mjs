import { clean, finite, genreTags, normalizeTrack } from "./model.mjs";
const alphabet =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function gidToUri(kind, gid) {
  if (typeof gid !== "string" || !/^([0-9a-f]{32})$/i.test(gid)) return "";
  let value = BigInt(`0x${gid}`),
    id = "";
  do {
    id = alphabet[Number(value % 62n)] + id;
    value /= 62n;
  } while (value > 0n);
  return `spotify:${kind}:${id.padStart(22, "0")}`;
}
export function uriToHex(uri) {
  const match = /^spotify:(track|album|artist):([0-9A-Za-z]{22})$/.exec(uri);
  if (!match) throw new Error("Invalid metadata URI.");
  let value = 0n;
  for (const digit of match[2])
    value = value * 62n + BigInt(alphabet.indexOf(digit));
  if (value >= 1n << 128n)
    throw new Error("Spotify identifier exceeds 128 bits.");
  return value.toString(16).padStart(32, "0");
}
export function metadataDate(date) {
  if (!Number.isInteger(date?.year) || date.year < 1000 || date.year > 9999)
    return "";
  let value = String(date.year);
  if (Number.isInteger(date.month) && date.month >= 1 && date.month <= 12) {
    value += `-${String(date.month).padStart(2, "0")}`;
    if (Number.isInteger(date.day) && date.day >= 1 && date.day <= 31)
      value += `-${String(date.day).padStart(2, "0")}`;
  }
  return value;
}
function artwork(raw) {
  const images = Array.isArray(raw?.cover_group?.image)
    ? raw.cover_group.image
    : [];
  const image = images.find((i) => i.size === "LARGE") || images[0];
  return /^[0-9a-f]{40}$/i.test(image?.file_id || "")
    ? `https://i.scdn.co/image/${image.file_id}`
    : "";
}
export function rawTrack(raw, uri) {
  if (!raw || typeof raw.name !== "string")
    throw new Error("Track metadata is unavailable.");
  const album = raw.album || {};
  return normalizeTrack({
    uri: raw.canonical_uri || uri,
    name: raw.name,
    artists: (raw.artist || []).map((a) => ({
      name: a.name || "",
      uri: gidToUri("artist", a.gid),
    })),
    durationMs: finite(raw.duration),
    explicit: typeof raw.explicit === "boolean" ? raw.explicit : undefined,
    popularity: finite(raw.popularity),
    album: {
      name: album.name || "",
      uri: gidToUri("album", album.gid),
      image: artwork(album),
      release_date: metadataDate(album.date),
      album_type: album.type?.toLowerCase(),
    },
    external_ids: {
      isrc:
        (raw.external_id || []).find(
          (i) => String(i.type).toLowerCase() === "isrc",
        )?.id || "",
    },
  });
}
export function withAlbum(track, album) {
  const refs = Array.isArray(album?.artists) ? album.artists : [];
  const artists = track.artists.map((a) =>
    a.uri
      ? a
      : {
          ...a,
          uri: refs.find((ref) => clean(ref.name) === clean(a.name))?.uri || "",
        },
  );
  return {
    ...track,
    artists,
    album: track.album || album?.name || "",
    albumUri: track.albumUri || album?.uri || "",
    image: track.image || album?.image || "",
    releaseDate: track.releaseDate || metadataDate(album?.date),
    releaseType: track.releaseType || album?.type?.toLowerCase() || "",
  };
}
export function nativeGenres(artist) {
  const raw = artist?.raw || artist || {};
  return genreTags([
    ...(Array.isArray(raw.genre) ? raw.genre : []),
    ...(Array.isArray(raw.genres) ? raw.genres : []),
  ]);
}

// Context resolver metadata uses the same keys as R10's ContextTrack reader.
export function contextTrackMetadata(item) {
  const md = item?.metadata;
  if (typeof md?.title !== "string" || !md.title.trim()) return null;
  const valid = (uri, kind) =>
    new RegExp(`^spotify:${kind}:[A-Za-z0-9]{22}$`).test(uri || "") ? uri : "";
  const duration = /^\d+$/.test(String(md.duration)) ? Number(md.duration) : null;
  const imageId = String(md.image_large_url || md.image_url || "")
    .replace(/^spotify:image:/, "");
  const image = /^[0-9a-f]{40}$/i.test(imageId)
    ? `https://i.scdn.co/image/${imageId}` : "";
  const raw = {
    uri: item.uri,
    title: md.title,
    artists: [{ name: typeof md.artist_name === "string" ? md.artist_name : "", uri: valid(md.artist_uri, "artist") }],
    durationMs: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    album: { name: md.album_title || "", uri: valid(md.album_uri, "album"), image },
  };
  if (md.is_explicit === "true" || md.is_explicit === "false")
    raw.explicit = md.is_explicit === "true";
  return normalizeTrack(raw);
}
