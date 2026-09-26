/**
 * Public surface of the LiquidText feature.
 *
 * Only the root view is exported — everything else (stores, hooks, the API
 * layer) is internal, per the feature-slice contract in `.cursorrules` §2.
 */

export { LiquidTextView } from "./components/liquid-text-view";
