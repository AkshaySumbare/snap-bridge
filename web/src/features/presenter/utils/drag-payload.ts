/**
 * Payloads for the reader → canvas drags.
 *
 * Serialised onto `text/plain` rather than a custom dataTransfer type: during
 * `dragover` — the moment the canvas has to decide whether to accept the drop
 * — Safari exposes only the type list, and reads of custom types come back
 * empty. A marker inside the JSON does the discrimination instead.
 */

import { DRAG_PAYLOAD_MARKER } from "../constants";

/**
 * What is being dragged. Kept separate from the marker so the write side can
 * take it directly — `Omit<Union, "marker">` collapses a union to its common
 * keys, which would erase `cardId`.
 */
export type DragPayloadBody =
  /** A comment docked in the reader's gutter, being pulled onto the canvas. */
  { kind: "margin-note"; cardId: string };

export type DragPayload = DragPayloadBody & { marker: typeof DRAG_PAYLOAD_MARKER };

export function writeDragPayload(dataTransfer: DataTransfer, payload: DragPayloadBody) {
  dataTransfer.setData("text/plain", JSON.stringify({ marker: DRAG_PAYLOAD_MARKER, ...payload }));
  dataTransfer.effectAllowed = "move";
}

export function readDragPayload(dataTransfer: DataTransfer): DragPayload | null {
  const raw = dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { marker?: unknown }).marker === DRAG_PAYLOAD_MARKER
    ) {
      return parsed as DragPayload;
    }
  } catch {
    // Plain text dropped from outside the app — not ours, ignore it.
  }
  return null;
}
