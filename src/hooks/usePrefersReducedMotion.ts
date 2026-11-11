import { createContext, useContext } from "react";
import { useMediaQuery } from "./useMediaQuery";

/* Lab OS's Reduce motion setting overrides the device preference for the apps inside it. */
export const ReducedMotionOverride = createContext<boolean | undefined>(undefined);

export function usePrefersReducedMotion() {
  const device = useMediaQuery("(prefers-reduced-motion: reduce)");
  return useContext(ReducedMotionOverride) ?? device;
}
