/**
 * Draws every connector in the workspace: card → its source passage and each
 * connected point in the reader.
 *
 * Rendered as one SVG spanning both panes, `pointer-events: none` except on
 * the hover-remove controls, so it never eats a click meant for the document
 * or a card.
 *
 * It sits above the reader/canvas seam on purpose. At a lower layer the
 * remove control was painted *through* the transparent full-height resize
 * button on that seam — visible, hoverable, and completely unclickable,
 * because the click landed on the resize grip instead. A connector's midpoint
 * runs from a passage on the left to a notch on the right, so the seam is
 * exactly where it tends to fall.
 *
 * Only the one open reference is ever interactive, so raising it costs the
 * canvas nothing the reader has not deliberately asked for.
 */

import { cn } from "@/lib/utils";

import { CONNECTOR_DOT_RADIUS, HIGHLIGHT_STYLES } from "../constants";
import type { AnchorMap } from "../hooks/use-connector-anchors";
import { anchorKey } from "../hooks/use-passage-anchors";
import type { WorkspaceCard } from "../types";
import { connectorPath } from "../utils/geometry";

interface ConnectorLayerProps {
  anchors: AnchorMap;
  cards: readonly WorkspaceCard[];
  spotlightCardId: string | null;
  /** Cards whose Show link is switched on. Nothing else is drawn. */
  visibleCardIds: readonly string[];
  /** `cardId:linkId` of the one reference whose line is drawn. */
  openLinkKey: string | null;
  /** Hover-remove on a drawn connection line. */
  onRemoveConnection: (cardId: string, index: number) => void;
}

export function ConnectorLayer({
  anchors,
  cards,
  spotlightCardId,
  visibleCardIds,
  openLinkKey,
  onRemoveConnection,
}: ConnectorLayerProps) {
  const visible = new Set(visibleCardIds);

  const sourceConnectors = cards.flatMap((card) => {
    if (!visible.has(card.id)) return [];

    const to = anchors.cardsLeft[card.id];
    if (!to) return [];

    // A card may hold several threads: its original source (a highlight, or
    // the point it was pinned to) plus one per reference. Each lands on its
    // own reference's notch — landing them all on the card's edge drew every
    // line onto whichever tab happened to be first.
    const froms: Array<{
      key: string;
      point: { x: number; y: number };
      to: { x: number; y: number };
      onRemove?: () => void;
    }> = [];

    const highlightId = card.kind === "excerpt" ? card.highlightId : card.source?.highlightId;
    if (highlightId && anchors.highlights[highlightId]) {
      froms.push({ key: `hl-${highlightId}`, point: anchors.highlights[highlightId]!, to });
    }
    const passageAnchor = card.kind === "note" ? card.source?.anchor : null;
    if (passageAnchor && anchors.passagePoints[anchorKey(passageAnchor)]) {
      froms.push({
        key: `src-${anchorKey(passageAnchor)}`,
        point: anchors.passagePoints[anchorKey(passageAnchor)]!,
        to,
      });
    }
    card.connections.forEach((connection, index) => {
      // One reference at a time: opening a notch draws that reference's line
      // and no other. Connections filed under no reference have no notch to
      // be opened from, so they ride with the card as before.
      if (connection.linkId !== null && openLinkKey !== `${card.id}:${connection.linkId}`) {
        return;
      }
      const point = anchors.passagePoints[anchorKey(connection)];
      if (point) {
        froms.push({
          key: `conn-${anchorKey(connection)}`,
          point,
          to:
            (connection.linkId ? anchors.linkNotches[`${card.id}:${connection.linkId}`] : null) ??
            to,
          onRemove: () => onRemoveConnection(card.id, index),
        });
      }
    });

    return froms.map(({ key, point, to: landing, onRemove }) => ({
      id: `src-${card.id}-${key}`,
      path: connectorPath(point, landing),
      stroke: HIGHLIGHT_STYLES[card.color].stroke,
      from: point,
      to: landing,
      spotlit: spotlightCardId === card.id,
      onRemove,
    }));
  });

  return (
    <svg
      data-lt-connectors=""
      className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
    >
      {sourceConnectors.map((connector) => {
        const midX = (connector.from.x + connector.to.x) / 2;
        const midY = (connector.from.y + connector.to.y) / 2;
        return (
          <g key={connector.id} className="group/conn">
            {connector.onRemove && (
              /* Fat invisible stroke so the thin line is actually hoverable. */
              <path
                d={connector.path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                className="pointer-events-auto"
                aria-hidden
              />
            )}
            <path
              d={connector.path}
              aria-hidden
              fill="none"
              stroke={connector.stroke}
              strokeWidth={connector.spotlit ? 2.5 : 1.5}
              strokeLinecap="round"
              opacity={connector.spotlit ? 1 : 0.75}
              className={cn(
                connector.spotlit && "animate-pulse",
                connector.onRemove &&
                  "transition-[stroke-width] group-hover/conn:[stroke-width:2.5]",
              )}
            />
            <circle
              aria-hidden
              cx={connector.from.x}
              cy={connector.from.y}
              r={CONNECTOR_DOT_RADIUS}
              fill={connector.stroke}
            />
            <circle
              aria-hidden
              cx={connector.to.x}
              cy={connector.to.y}
              r={CONNECTOR_DOT_RADIUS}
              fill={connector.stroke}
            />

            {connector.onRemove && (
              <g
                role="button"
                tabIndex={0}
                aria-label="Remove this link"
                onClick={connector.onRemove}
                onKeyDown={(event) => {
                  // A control that only a mouse can reach is not a control.
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  connector.onRemove?.();
                }}
                className="pointer-events-auto cursor-pointer opacity-0 transition-opacity focus:opacity-100 focus:outline-none group-hover/conn:opacity-100"
              >
                {/*
                  A larger, invisible target than the badge that is drawn. The
                  visible circle is 18px across, which is a small thing to hit
                  on a line the reader is already tracing with the pointer.
                */}
                <circle cx={midX} cy={midY} r={16} fill="transparent" />
                <circle
                  cx={midX}
                  cy={midY}
                  r={9}
                  fill="var(--color-surface)"
                  stroke="var(--color-status-danger)"
                />
                <path
                  d={`M ${midX - 3.5} ${midY - 3.5} L ${midX + 3.5} ${midY + 3.5} M ${midX + 3.5} ${midY - 3.5} L ${midX - 3.5} ${midY + 3.5}`}
                  stroke="var(--color-status-danger)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
                <title>Remove this link</title>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
