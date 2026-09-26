/**
 * ULIDs for locally-created nodes.
 *
 * These ids leave the client: the sync contract requires the device to name
 * every node it creates, so that a connection made offline can reference a
 * reference made in the same session, and so a retried batch updates rather
 * than duplicating. The server validates the shape and rejects anything else.
 *
 * ULID rather than UUIDv4 because they sort by creation time, which keeps
 * index locality sane on the collections these land in.
 *
 * Layout: 10 characters of millisecond timestamp, then 16 of randomness,
 * Crockford base32 throughout.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

function encodeTime(ms: number): string {
  let out = "";
  let remaining = ms;
  for (let i = 0; i < TIME_CHARS; i += 1) {
    out = CROCKFORD[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function encodeRandom(): string {
  const values = new Uint8Array(RANDOM_CHARS);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(values);
  } else {
    // Some test environments have no WebCrypto. Uniqueness within a session
    // is all that is at stake here — the timestamp prefix carries ordering.
    for (let i = 0; i < RANDOM_CHARS; i += 1) values[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < RANDOM_CHARS; i += 1) out += CROCKFORD[values[i]! % 32];
  return out;
}

/** A new node id. 26 characters, sortable by creation time. */
export function createId(): string {
  return encodeTime(Date.now()) + encodeRandom();
}

/** The shape the server accepts. Exported so tests can assert against it. */
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
