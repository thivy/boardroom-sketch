import { useEffect, useState } from "react";

/** A clock that ticks, so relative times and fading states keep moving without new data. */
export function useNow(every = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
