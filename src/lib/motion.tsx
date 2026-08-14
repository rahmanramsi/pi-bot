import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export { AnimatePresence, MotionConfig, motion, useReducedMotion };

export const motionSprings = {
  press: { type: "spring", stiffness: 520, damping: 30, mass: 0.2 },
  layout: { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
  panel: { type: "spring", stiffness: 360, damping: 34, mass: 0.8 },
} as const;

export const motionTransitions = {
  micro: { duration: 0.12, ease: "easeOut" },
  standard: { duration: 0.22, ease: "easeOut" },
  emphasis: { duration: 0.36, ease: [0.16, 1, 0.3, 1] },
} as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
