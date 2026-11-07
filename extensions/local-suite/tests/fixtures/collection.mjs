const v = (n) => {
  const out = [];
  do {
    out.push((n & 127) | (n > 127 ? 128 : 0));
    n = Math.floor(n / 128);
  } while (n);
  return Buffer.from(out);
};
const str = (tag, text) => {
  const b = Buffer.from(text);
  return Buffer.concat([v(tag * 8 + 2), v(b.length), b]);
};
export function collectionResponse(items, next = "", sync = "snapshot") {
  return Buffer.concat([
    ...items.map((item) => {
      const b = Buffer.concat([
        str(1, item.uri),
        ...(item.seconds !== undefined
          ? [Buffer.from([16]), v(item.seconds)]
          : []),
        ...(item.removed ? [Buffer.from([24, 1])] : []),
      ]);
      return Buffer.concat([Buffer.from([10]), v(b.length), b]);
    }),
    str(2, next),
    str(3, sync),
  ]);
}
