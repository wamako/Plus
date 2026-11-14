const KEY = "last-write-v1";
let sequence = 0;

export class JournalError extends Error {
  constructor() {
    super("Could not save and verify the action record in extension storage.");
    this.unknown = true;
  }
}

function sameValue(saved, expected) {
  if (saved === expected) return true;
  if (!saved || !expected || typeof saved !== "object" || typeof expected !== "object" ||
      Array.isArray(saved) !== Array.isArray(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(saved).length === keys.length && keys.every(key =>
    Object.hasOwn(saved, key) && sameValue(saved[key], expected[key]));
}

export function checkpointJournal(storage, journal, key = KEY) {
  // Compare the entire serialized checkpoint, including diagnostics, not just its
  // phase: an old acknowledged count must not authorize the next mutation.
  const checkpoint = { ...journal };
  try {
    storage.set(key, { ...checkpoint });
    const saved = storage.get(key);
    if (!saved || typeof saved !== "object" ||
        !Object.keys(checkpoint).every(key => sameValue(saved[key], checkpoint[key]))) {
      throw new JournalError();
    }
  } catch {
    // Native storage failures can include private paths or values.
    throw new JournalError();
  }
}

export function beginJournal(storage, fields, key = KEY) {
  const journal = { ...fields, operationId: `${Date.now()}:${++sequence}:${Math.random()}` };
  try {
    checkpointJournal(storage, journal, key);
  } catch {
    throw new Error("Could not save and verify the action record in extension storage. Nothing was sent.");
  }
  return journal;
}

export function recordFailure(storage, journal, error, key = KEY) {
  journal.phase = error.unknown ? "unknown" : "stopped";
  try {
    checkpointJournal(storage, journal, key);
    return "";
  } catch {
    // Reporting a failed checkpoint must retain the original outcome, URI and
    // confirmed count even when the best-effort failure record also fails.
    return " The action record could not be verified.";
  }
}
