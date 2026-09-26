/**
 * The editor a note or comment opens into.
 *
 * Two things it does that a bare `<textarea>` does not. It grows with the
 * text instead of scrolling inside a fixed box — a reader writing a long
 * point should watch it accumulate, not lose the top of their own sentence
 * to a four-row window. And it commits explicitly: Save and Cancel chips
 * sit under the field, so leaving the card is not the same as accepting
 * what is in it.
 *
 * Blur deliberately does NOT save. It used to, and it cannot: clicking
 * Cancel blurs the field first, so a blur-commit would write the text the
 * click was there to discard.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface NoteEditorProps {
  value: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  /** Typography of the field — cards read in serif, seam comments in sans. */
  className?: string;
  /** Height floor, in rows, so an empty field is still a comfortable target. */
  minRows?: number;
}

export function NoteEditor({ value, onSave, onCancel, className, minRows = 3 }: NoteEditorProps) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Re-measure from scratch on every keystroke: shrinking back needs the
  // height reset to `auto` first, or `scrollHeight` just reports the old,
  // taller box and the field never gets smaller again.
  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.focus();
    // Caret to the end rather than selecting everything — the common edit is
    // adding to a note, and a full selection makes the next key destroy it.
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const chip =
    "rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none transition-colors";

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        rows={minRows}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave(draft);
          }
        }}
        className={cn(
          "w-full resize-none overflow-hidden rounded-md border border-border-default bg-input-background p-2 text-foreground outline-none",
          className,
        )}
      />

      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            chip,
            "border-border-default text-text-secondary hover:bg-surface-sunken hover:text-foreground",
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className={cn(chip, "border-primary bg-primary text-primary-foreground hover:opacity-90")}
        >
          Save
        </button>
      </div>
    </div>
  );
}
