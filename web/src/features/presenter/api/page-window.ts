/**
 * How many pages are fetched at a time.
 *
 * Small enough that opening a 600-page bundle is not a megabyte download for
 * one screen of text, large enough that a fast scroll does not outrun it.
 */
export const PAGE_WINDOW = 25;
