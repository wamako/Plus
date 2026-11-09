const KEY = "last-write-v1";
let sequence = 0;

export class JournalError extends Error {
  constructor() {
    super("Could not save and verify the action record in extension storage.");
    this.unknown = true;
  }
}

export function checkpointJournal(storage, journal) {
  // Records contain scalar fields. Compare the entire checkpoint, not just its
  // phase: an old acknowledged count must not authorize the next mutation.
  const checkpoint = { ...journal };
  try {
    storage.set(KEY, { ...checkpoint });
    const saved = storage.get(KEY);
    if (!saved || typeof saved !== "object" ||
        !Object.keys(checkpoint).every(key => saved[key] === checkpoint[key])) {
      throw new JournalError();
    }
  } catch {
    // Native storage failures can include private paths or values.
    throw new JournalError();
  }
}

export function beginJournal(storage, fields) {
  const journal = { ...fields, operationId: `${Date.now()}:${++sequence}:${Math.random()}` };
  try {
    checkpointJournal(storage, journal);
  } catch {
    throw new Error("Could not save and verify the action record in extension storage. Nothing was sent.");
  }
  return journal;
}

export function recordFailure(storage, journal, error) {
  journal.phase = error.unknown ? "unknown" : "stopped";
  try {
    checkpointJournal(storage, journal);
    return "";
  } catch {
    // Reporting a failed checkpoint must retain the original outcome, URI and
    // confirmed count even when the best-effort failure record also fails.
    return " The action record could not be verified.";
  }
}
