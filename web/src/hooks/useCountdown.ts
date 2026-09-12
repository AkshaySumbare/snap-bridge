import { useCallback, useEffect, useState } from "react";

export function useCountdown(initialSeconds: number) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) return;

    const timer = window.setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [remaining]);

  const reset = useCallback((seconds = initialSeconds) => {
    setRemaining(seconds);
  }, [initialSeconds]);

  return {
    remaining,
    isActive: remaining > 0,
    reset,
  };
}
