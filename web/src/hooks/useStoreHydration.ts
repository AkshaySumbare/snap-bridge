import { useEffect, useState } from "react";
import type { StoreApi, UseBoundStore } from "zustand";

type PersistedStore = UseBoundStore<StoreApi<unknown>> & {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: () => void) => () => void;
  };
};

export function useStoreHydration(store: PersistedStore) {
  const [hydrated, setHydrated] = useState(store.persist.hasHydrated());

  useEffect(() => {
    const unsub = store.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(store.persist.hasHydrated());
    return unsub;
  }, [store]);

  return hydrated;
}
