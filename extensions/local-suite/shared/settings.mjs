import { validUsername } from "./liked-songs.mjs";
export function storedText(storage, key) {
  try {
    const value = storage.get(key);
    return typeof value === "string" ? value : "";
  } catch { return ""; }
}
export function writeTextSetting(storage, key, text) {
  if (typeof text !== "string") throw new Error("Invalid setting value.");
  if (text) storage.set(key, text);
  else storage.remove(key);
  const saved = storage.get(key);
  if (text ? saved !== text : saved !== null && saved !== undefined && saved !== "")
    throw new Error("Setting could not be verified.");
  return text;
}
export const apiKeyIssue = value => /^[0-9a-f]{32}$/i.test(value)
  ? "" : "Paste only your 32-character Last.fm API key, then save.";
export const usernameIssue = value => !value || validUsername(value)
  ? "" : "Enter a Spotify username, without a profile URL or spaces.";
