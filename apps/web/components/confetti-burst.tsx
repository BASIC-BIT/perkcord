"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ConfettiBurst() {
  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const burst = (spread: number, startVelocity: number, particleCount: number) => {
      confetti({
        particleCount,
        spread,
        startVelocity,
        origin: { y: 0.65 },
        scalar: 0.9,
      });
    };

    burst(70, 30, 90);
    const timeout = window.setTimeout(() => burst(100, 35, 70), 180);
    return () => window.clearTimeout(timeout);
  }, []);

  return null;
}
