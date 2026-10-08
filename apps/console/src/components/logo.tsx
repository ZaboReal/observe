"use client";

import { useEffect, useRef } from "react";

import { shirtMark } from "@/lib/mark";

/** The animated mark in its black circle, as on the product site. Still when the viewer prefers reduced motion. */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = shirtMark(canvas, { reduceMotion: media.matches, hover: canvas.parentElement });
    const restart = () => {
      stop();
      stop = shirtMark(canvas, { reduceMotion: media.matches, hover: canvas.parentElement });
    };
    media.addEventListener("change", restart);
    return () => {
      media.removeEventListener("change", restart);
      stop();
    };
  }, []);

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#070708] shadow-[0_0_0_1px_rgb(16_18_21/0.3),0_1px_2px_rgb(16_18_21/0.05),0_10px_24px_-12px_rgb(22_30_46/0.35)] ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas ref={ref} aria-hidden="true" className="block size-full [filter:drop-shadow(0_0_1.2px_rgba(255,236,212,0.55))]" />
    </span>
  );
}
