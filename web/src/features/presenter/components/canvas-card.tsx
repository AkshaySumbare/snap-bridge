/**
 * A single card on the workspace canvas.
 *
 * Excerpts and notes share one frame so dragging and linking behave
 * identically whatever the card holds — an excerpt keeps a citation and a
 * thread back to its passage, a note carries the reader's own words.
 */

import { ChevronLeft, ChevronRight, FileText, Plus, Quote, X } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { HIGHLIGHT_STYLES, LINK_DOCS_PER_PAGE } from "../constants";
import { usePageLoader } from "../api/use-page-loader";
import { useLiquidTextStore } from "../stores/liquid-text-store";
import { useLiquidTextUiStore } from "../stores/liquid-text-ui-store";
import type { ArgumentLink, LiquidDocument, WorkspaceCard } from "../types";
import { CardActions } from "./card-actions";
import { ClampedText } from "./clamped-text";
import { NoteEditor } from "./note-editor";

interface CanvasCardProps {
  card: WorkspaceCard;
  position: { x: number; y: number };
  selectedIds: readonly string[];
  draggingCardId: string | null;
  onStartDrag: (event: React.PointerEvent, card: WorkspaceCard) => void;
  onSelect: (event: React.MouseEvent, cardId: string) => void;
  /** Filed under a wrapper: full width, stacked, no free position. */
  inWrapper?: boolean;
}

/**
 * One reference on an argument: a short label the reader writes, with any
 * documents that back it filed underneath.
 *
 * The label comes first and the documents are optional — a reader writes
 * "ref to 1" while reading and hangs the source on it later, which is the
 * opposite order to attach-a-document-then-name-it.
 */
/**
 * How a reference row talks to the card about its notch.
 *
 * The notch belongs to the row — it has to sit level with the reference it
 * points for, and stay there when a neighbour opens — but *which* reference
 * is open is one answer per card, so the state lives up there and comes back
 * down through this.
 */
interface PassageNav {
  passageFor: (linkId: string) => { paragraphId: string; pageNumber: number } | null;
  openLinkId: string | null;
  /** The notch the connector lands on: the open one, else the first there is. */
  anchorLinkId: string | null;
  toggle: (linkId: string) => void;
}

function ArgumentLinkRow({
  card,
  link,
  nav,
}: {
  card: Extract<WorkspaceCard, { kind: "note" }>;
  link: ArgumentLink;
  nav: PassageNav;
}) {
  const setActiveDocument = useLiquidTextStore((state) => state.setActiveDocument);
  const documents = useLiquidTextStore((state) => state.project.documents);
  const addCardConnection = useLiquidTextStore((state) => state.addCardConnection);
  const removeCardConnection = useLiquidTextStore((state) => state.removeCardConnection);
  const linkingPassage = useLiquidTextUiStore((state) => state.linkingPassage);
  const setLastConnectedAnchor = useLiquidTextUiStore((state) => state.setLastConnectedAnchor);
  const updateCardLinkLabel = useLiquidTextStore((state) => state.updateCardLinkLabel);
  const openModal = useLiquidTextUiStore((state) => state.openModal);
  const attachDocumentToLink = useLiquidTextStore((state) => state.attachDocumentToLink);
  const detachDocumentFromLink = useLiquidTextStore((state) => state.detachDocumentFromLink);

  const attached = link.documentIds
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is LiquidDocument => document !== undefined);
  const unattached = documents.filter((document) => !link.documentIds.includes(document.id));

  /**
   * Which attached document is expanded underneath, and where the run of
   * numbered chips starts. Both are view state of this one row — nothing
   * else needs them, and they should not survive the row being unmounted.
   */
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(0);

  const lastStart = Math.max(0, attached.length - LINK_DOCS_PER_PAGE);
  const start = Math.min(windowStart, lastStart);
  const visible = attached.slice(start, start + LINK_DOCS_PER_PAGE);
  const paged = attached.length > LINK_DOCS_PER_PAGE;
  // Detaching the open document leaves a dangling id; resolve rather than trust it.
  const openDocument = attached.find((document) => document.id === openDocumentId) ?? null;
  const previewText = openDocument?.pages[0]?.paragraphs.find(
    (paragraph) => !paragraph.heading && paragraph.text.trim().length > 0,
  )?.text;

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  /**
   * While a passage is waiting to be placed, every reference wears a box.
   * Ticked means "this reference is about that passage" — the box reads the
   * card's own connections for this link rather than any separate selection
   * state, so it always tells the truth, and unticking takes the line away.
   *
   * Last match, not first: ticking adds one line and unticking should take
   * back the one this pass added, leaving any earlier ones alone.
   */
  const linkedIndex = linkingPassage
    ? card.connections.reduce(
        (found, connection, index) =>
          connection.linkId === link.id && connection.paragraphId === linkingPassage.paragraphId
            ? index
            : found,
        -1,
      )
    : -1;

  function togglePassageLink() {
    if (!linkingPassage) return;
    if (linkedIndex >= 0) {
      removeCardConnection(card.id, linkedIndex);
      return;
    }
    addCardConnection(
      card.id,
      {
        // The passage's document, not the card's: an argument can point at
        // clauses across several documents, and one created from scratch has
        // no document of its own.
        documentId: linkingPassage.documentId,
        paragraphId: linkingPassage.paragraphId,
        pageNumber: linkingPassage.pageNumber,
        ratioX: linkingPassage.ratioX,
        ratioY: linkingPassage.ratioY,
      },
      link.id,
    );
    setLastConnectedAnchor({
      documentId: linkingPassage.documentId,
      paragraphId: linkingPassage.paragraphId,
    });
  }

  const passage = nav.passageFor(link.id);
  const open = nav.openLinkId === link.id;

  return (
    <div
      className={cn(
        "group/link relative rounded-md border border-border-subtle bg-surface-sunken px-1.5 py-1",
        linkedIndex >= 0 && "border-status-info ring-1 ring-status-info",
      )}
    >
      {/*
        Level with this reference's own top border, in the gutter the card
        leaves for it. Anchored to the row rather than pooled at the top of
        the card, so opening one reference's run cannot shove another
        reference's notch off its line.
      */}
      {passage && (
        <span
          data-link-notch={`${card.id}:${link.id}`}
          {...(nav.anchorLinkId === link.id ? { "data-card-notch": card.id } : {})}
          className="absolute -left-4 top-0"
        >
          <button
            type="button"
            aria-pressed={open}
            title={
              open
                ? `${link.label || "Link"} — p.${passage.pageNumber} · click to close`
                : `Go to ${link.label || "Link"} — p.${passage.pageNumber}`
            }
            aria-label={`Go to ${link.label || "Link"}, page ${passage.pageNumber}`}
            onPointerDown={stop}
            onClick={(event) => {
              stop(event);
              nav.toggle(link.id);
            }}
            className={cn(
              "flex h-5 w-4 items-center justify-center rounded-none border shadow-elevation-raised transition-colors",
              open
                ? "border-status-info bg-status-info text-surface-overlay"
                : "border-border-subtle bg-surface-overlay text-text-muted hover:bg-surface-sunken hover:text-foreground",
            )}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </span>
      )}

      <div className="flex items-center gap-1">
        {/*
          Only a reference with nothing on it yet offers a box. One holding a
          passage already has its notch: a tick that silently moved the line
          somewhere else is not what a checked box means.
        */}
        {linkingPassage !== null && passage === null && (
          <Checkbox
            checked={linkedIndex >= 0}
            onCheckedChange={togglePassageLink}
            onClick={stop}
            className="shrink-0"
            aria-label={`Link the passage to ${link.label.trim().length > 0 ? link.label : "this reference"}`}
          />
        )}
        <input
          value={link.label}
          placeholder="ref to 1"
          onPointerDown={stop}
          onClick={stop}
          onChange={(event) => updateCardLinkLabel(card.id, link.id, event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:italic placeholder:text-text-muted"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Attach a document to this reference"
              title="Attach document"
              onPointerDown={stop}
              onClick={stop}
              className="shrink-0 rounded text-text-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64" onClick={stop}>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-text-muted">
              Attach a document
            </DropdownMenuLabel>
            {unattached.map((document) => (
              <DropdownMenuItem
                key={document.id}
                onSelect={() => attachDocumentToLink(card.id, link.id, document.id)}
              >
                {document.title}
              </DropdownMenuItem>
            ))}
            {unattached.length === 0 && (
              <p className="px-2 py-1.5 text-[11px] text-text-muted">
                Every project document is already attached here.
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          aria-label="Remove this reference"
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            openModal({ kind: "deleteLink", cardId: card.id, linkId: link.id });
          }}
          className="shrink-0 text-text-muted opacity-0 transition-opacity hover:text-destructive group-hover/link:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {attached.length > 0 && (
        <div className="mt-1 border-t border-border-subtle pt-1">
          <div className="flex items-center gap-1">
            {paged && (
              <button
                type="button"
                aria-label="Previous documents"
                disabled={start === 0}
                onPointerDown={stop}
                onClick={(event) => {
                  stop(event);
                  setWindowStart(Math.max(0, start - LINK_DOCS_PER_PAGE));
                }}
                className={cn(
                  "shrink-0 rounded text-text-muted transition-colors",
                  start === 0 ? "cursor-not-allowed opacity-40" : "hover:text-foreground",
                )}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
            )}

            {visible.map((document, offset) => {
              const number = start + offset + 1;
              const isOpen = document.id === openDocumentId;
              return (
                <button
                  key={document.id}
                  type="button"
                  title={document.title}
                  aria-pressed={isOpen}
                  onPointerDown={stop}
                  onClick={(event) => {
                    stop(event);
                    setOpenDocumentId(isOpen ? null : document.id);
                  }}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold tabular-nums transition-colors",
                    isOpen
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border-default text-text-secondary hover:bg-surface-raised hover:text-foreground",
                  )}
                >
                  {number}
                </button>
              );
            })}

            {paged && (
              <button
                type="button"
                aria-label="More documents"
                disabled={start >= lastStart}
                onPointerDown={stop}
                onClick={(event) => {
                  stop(event);
                  setWindowStart(Math.min(lastStart, start + LINK_DOCS_PER_PAGE));
                }}
                className={cn(
                  "shrink-0 rounded text-text-muted transition-colors",
                  start >= lastStart ? "cursor-not-allowed opacity-40" : "hover:text-foreground",
                )}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {openDocument && (
            <div className="mt-1 rounded border border-border-subtle bg-surface-raised px-1.5 py-1">
              <div className="group/doc flex items-center gap-1">
                <FileText className="h-2.5 w-2.5 shrink-0 text-text-muted" />
                <button
                  type="button"
                  onPointerDown={stop}
                  onClick={(event) => {
                    stop(event);
                    setActiveDocument(openDocument.id);
                  }}
                  title={openDocument.title}
                  className="min-w-0 flex-1 truncate text-left text-[10px] font-medium text-text-secondary hover:underline"
                >
                  {openDocument.title}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${openDocument.title}`}
                  onPointerDown={stop}
                  onClick={(event) => {
                    stop(event);
                    detachDocumentFromLink(card.id, link.id, openDocument.id);
                    setOpenDocumentId(null);
                  }}
                  className="shrink-0 text-text-muted opacity-0 transition-opacity hover:text-destructive group-hover/doc:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>

              {/*
                Stand-in preview: a document has no summary of its own, so
                the first lines of page one serve as one.
              */}
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-text-muted">
                {openDocument.kind} · {openDocument.pages.length} pages
              </p>
              {previewText && (
                <p className="mt-0.5 line-clamp-3 font-serif text-[10px] leading-snug text-text-secondary">
                  {previewText}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The argument's references — the left-hand column of its card. */
function ArgumentLinks({
  card,
  nav,
}: {
  card: Extract<WorkspaceCard, { kind: "note" }>;
  nav: PassageNav;
}) {
  if (card.links.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {card.links.map((link) => (
        <ArgumentLinkRow key={link.id} card={card} link={link} nav={nav} />
      ))}
    </div>
  );
}

function CardBody({ card }: { card: WorkspaceCard }) {
  const updateCardText = useLiquidTextStore((state) => state.updateCardText);
  const editingCardId = useLiquidTextUiStore((state) => state.editingCardId);
  const setEditingCard = useLiquidTextUiStore((state) => state.setEditingCard);

  const editing = editingCardId === card.id;
  const value = card.text;

  if (editing) {
    return (
      <NoteEditor
        value={value}
        className="font-serif text-[12.5px] leading-relaxed"
        onSave={(text) => {
          updateCardText(card.id, text);
          setEditingCard(null);
        }}
        onCancel={() => setEditingCard(null)}
      />
    );
  }

  if (value.trim().length === 0) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditingCard(card.id);
        }}
        className="w-full text-left font-serif text-[12.5px] italic text-text-muted"
      >
        Type your note…
      </button>
    );
  }

  return (
    <div onDoubleClick={() => setEditingCard(card.id)}>
      <ClampedText
        text={value}
        className={cn(
          "whitespace-pre-wrap font-serif text-[12.5px] leading-relaxed text-foreground",
          card.kind === "excerpt" && "border-l-2 border-border-default pl-2",
        )}
      />
    </div>
  );
}

export function CanvasCard({
  card,
  position,
  selectedIds,
  draggingCardId,
  onStartDrag,
  onSelect,
  inWrapper = false,
}: CanvasCardProps) {
  const setActiveDocument = useLiquidTextStore((state) => state.setActiveDocument);
  const spotlightCardId = useLiquidTextUiStore((state) => state.spotlightCardId);
  const connectorCardIds = useLiquidTextUiStore((state) => state.connectorCardIds);
  const toggleConnector = useLiquidTextUiStore((state) => state.toggleConnector);
  const openLinkKey = useLiquidTextUiStore((state) => state.openLinkKey);
  const setOpenLinkKey = useLiquidTextUiStore((state) => state.setOpenLinkKey);
  const setMobilePane = useLiquidTextUiStore((state) => state.setMobilePane);
  const focusParagraph = useLiquidTextUiStore((state) => state.focusParagraph);
  const pages = usePageLoader();
  const setEditingCard = useLiquidTextUiStore((state) => state.setEditingCard);
  const addCardLink = useLiquidTextStore((state) => state.addCardLink);
  const addNoteInWrapper = useLiquidTextStore((state) => state.addNoteInWrapper);

  const style = HIGHLIGHT_STYLES[card.color];
  const selected = selectedIds.includes(card.id);
  const connectorShown = connectorCardIds.includes(card.id);

  const sourceHighlightId =
    card.kind === "excerpt" ? card.highlightId : (card.source?.highlightId ?? null);
  const sourceAnchor = card.kind === "note" ? (card.source?.anchor ?? null) : null;
  const hasThread =
    Boolean(sourceHighlightId) || sourceAnchor !== null || card.connections.length > 0;

  /**
   * Every passage this card points at, in the order it was made: the card's
   * own source first, then each connected reference.
   *
   * One notch per thread on the card's left edge. Clicking a notch takes the
   * reader to *that* passage in the document — the whole document, scrolled
   * and ringed — rather than swapping the reader for a collated list of the
   * card's passages, which showed the words but lost the argument around
   * them.
   */
  /**
   * One notch per reference, pointing at that reference's one passage.
   *
   * A reference holds a single passage — ticking it somewhere new moves it —
   * so the notch is a plain go-there/close toggle with nothing to page
   * through. It lives in the reference's own row, level with it, so opening
   * one cannot shift another off its line.
   */
  const passageByLink = new Map<
    string,
    { paragraphId: string; pageNumber: number; documentId: string }
  >();
  for (const connection of card.connections) {
    // Connections filed under no reference get no notch; they can only come
    // from data older than the reference checkboxes, and a nameless tab
    // beside the named ones is worse than nothing.
    if (connection.linkId === null) continue;
    passageByLink.set(connection.linkId, {
      paragraphId: connection.paragraphId,
      pageNumber: connection.pageNumber,
      // Kept so a jump can load the page it lives on without first having to
      // find the paragraph — which is the very thing that may be missing.
      documentId: connection.documentId,
    });
  }

  /** This card's open reference, if the open one anywhere belongs to it. */
  const openLink =
    connectorShown && openLinkKey?.startsWith(`${card.id}:`)
      ? openLinkKey.slice(card.id.length + 1)
      : null;

  const passageNav: PassageNav = {
    passageFor: (linkId) => passageByLink.get(linkId) ?? null,
    openLinkId: openLink,
    // The connector lands on the open reference's notch, or on the first
    // notch there is — never on a row that has none.
    anchorLinkId:
      (openLink !== null && passageByLink.has(openLink)
        ? openLink
        : card.kind === "note"
          ? card.links.find((link) => passageByLink.has(link.id))?.id
          : undefined) ?? null,

    toggle: (linkId) => {
      if (openLink === linkId) {
        toggleConnector(card.id);
        setOpenLinkKey(null);
        return;
      }
      const passage = passageByLink.get(linkId);
      if (!passage) return;

      // Draw this reference's line while the reader is over there, so the
      // passage and the argument it belongs to are visibly the same thing.
      setOpenLinkKey(`${card.id}:${linkId}`);
      /*
        The notch sends the reader to the passage. On a narrow screen that
        passage is in the pane next door, so follow it — the collapse branch
        above deliberately does not, because closing a reference is not going
        anywhere.
      */
      setMobilePane("reader");
      if (!connectorShown) toggleConnector(card.id);
      setActiveDocument(passage.documentId);

      /*
       * The passage may be on a page nobody has scrolled to.
       *
       * A reader who connected page 26 of a hundred-page contract, left, and
       * came back has only the first twenty-five loaded — so this used to
       * find no paragraph and return without a word, and the notch simply
       * did nothing. The connection knows its own page; fetch up to it, then
       * go.
       */
      if (pages.hasPage(passage.documentId, passage.pageNumber)) {
        focusParagraph(passage.paragraphId);
        return;
      }
      void pages
        .ensurePage(passage.documentId, passage.pageNumber)
        .then(() => focusParagraph(passage.paragraphId));
    },
  };

  const header = card.kind === "excerpt" ? `${card.documentTitle} · p.${card.pageNumber}` : "";

  /**
   * The footer says only what the card cannot show any other way. With the
   * notches carrying "go to the passage", a card with threads needs no
   * control here at all; one without them needs to say how to get some.
   */
  const footerAction =
    "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-foreground";

  const linkControls = hasThread ? null : (
    <span className="text-[11px] text-text-muted">
      Add a link, then tick it to attach a passage
    </span>
  );

  /**
   * An argument filed under a Point puts its controls inside the white text
   * box, so that box is the card's only fill: the document column and the
   * footer stay on the Point's own background beside and below it.
   */
  const isPointArgument = inWrapper && card.kind === "note";

  const headerRow = (
    <div
      onPointerDown={(event) => {
        // A wrapper member has no free position to drag to — it leaves via
        // its ⋯ menu instead, so the handle must not start a phantom drag.
        if (!inWrapper) onStartDrag(event, card);
      }}
      className={cn(
        "flex items-center gap-1.5",
        isPointArgument
          ? "cursor-default"
          : "cursor-grab rounded-t-xl border-b border-border-subtle px-2 py-1.5 active:cursor-grabbing",
      )}
    >
      {card.kind === "excerpt" && <Quote className="h-3 w-3 shrink-0 text-text-muted" />}
      <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wide text-text-muted">
        {header}
      </span>
      <CardActions card={card} />
    </div>
  );

  return (
    <div
      data-card-id={card.id}
      onClick={(event) => onSelect(event, card.id)}
      style={
        inWrapper
          ? undefined
          : { left: position.x, top: position.y, width: card.width, position: "absolute" }
      }
      className={cn(
        "group relative rounded-xl transition-shadow",
        inWrapper ? "w-full" : "absolute",
        // Only the argument's TEXT gets the white box (below). The document
        // column and the footer row sit outside it, so the card itself
        // carries no fill — just its colour ring when one is set.
        isPointArgument
          ? "border border-transparent"
          : "border border-border-subtle bg-surface-overlay shadow-elevation-raised",
        // The colour ring marks the argument's text, not the chrome around
        // it, so an in-Point argument paints it on the white box instead.
        card.color !== "clear" && !isPointArgument && style.border,
        selected && !isPointArgument && "ring-2 ring-primary",
        spotlightCardId === card.id && "ring-2 ring-status-warning",
        draggingCardId === card.id && "cursor-grabbing shadow-elevation-pop",
      )}
    >
      {!isPointArgument && headerRow}

      {!card.collapsed && (
        <div
          className={cn(
            // A Point argument keeps a left gutter for its notch, so the tab
            // sits beside the reference boxes rather than over their border.
            isPointArgument ? "py-0 pl-4 pr-0" : "px-2.5 py-2",
          )}
        >
          {card.kind === "note" ? (
            // Documents in their own column on the left, each a separate
            // boxed row; the argument's own white box sits beside them,
            // not merged with them — no shared border, just a gap.
            <div className="flex items-stretch gap-2.5">
              <div className="w-[30%] min-w-0 shrink-0">
                <ArgumentLinks card={card} nav={passageNav} />
              </div>
              {/* The only white in the card, and it fills the row's height. */}
              <div
                className={cn(
                  // Square right corners and no right border: the box runs
                  // into the Point's own frame rather than floating short of it.
                  "min-w-0 flex-1 rounded-l-lg border border-r-0 bg-surface-overlay px-2.5 py-2",
                  card.color !== "clear" ? style.border : "border-border-subtle",
                )}
              >
                {headerRow}
                <CardBody card={card} />
              </div>
            </div>
          ) : (
            <CardBody card={card} />
          )}

          {card.kind === "excerpt" && (
            <p className="mt-1.5 text-[10px] italic text-text-muted">
              ct: {card.documentTitle}, p.{card.pageNumber}
            </p>
          )}
          {card.kind === "excerpt" && <div className="mt-1">{linkControls}</div>}

          {/*
            A note out on the canvas gets the same footer as one filed under a
            Point. It had none before, because connecting started from the card
            and a loose note was assumed to be a thought in progress; now that
            a passage is dropped ONTO the card, the card is the target and has
            to say so.
          */}
          {card.kind === "note" && !inWrapper && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {/* A loose note needs the same way in: references are what a
                  passage gets ticked onto. */}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  addCardLink(card.id);
                }}
                className={footerAction}
              >
                <Plus className="h-3 w-3" />
                Add link
              </button>
              {linkControls}
            </div>
          )}

          {/*
            "Argument" actions — only for a note that is a Point's member.
            Show link/Connect sit at the left of this same row, immediately
            left of Attach Document, so every action for the argument lives
            on one horizontal line at the card's bottom edge.
          */}
          {card.kind === "note" && inWrapper && (
            <div className="mt-2 flex items-start gap-2.5 pb-1.5 pr-2 pt-1.5">
              {/* Under the references column, where the links it adds appear. */}
              <span className="w-[30%] shrink-0">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    addCardLink(card.id);
                  }}
                  className={footerAction}
                >
                  <Plus className="h-3 w-3" />
                  Add link
                </button>
              </span>

              {/* Under the argument's own box, at its right edge. */}
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                {linkControls}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!card.wrapperId) return;
                    const newNoteId = addNoteInWrapper(card.wrapperId);
                    setEditingCard(newNoteId);
                  }}
                  className={cn(footerAction, "ml-auto")}
                >
                  <Plus className="h-3 w-3" />
                  Add New
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
