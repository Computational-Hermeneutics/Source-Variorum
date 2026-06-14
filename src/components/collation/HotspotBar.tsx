"use client";

import { useMemo } from "react";
import type { Hotspots } from "@/lib/collate/hotspots";

/**
 * Heat histogram of version hotspots: across the base text, how many of the
 * other witnesses diverge at each point. Tall + hot (red) = many versions
 * disagree (a contested passage); short + cool (amber) = most agree. The
 * ShakerVis "Viv" idea — where the witnesses are least stable.
 */
const BUCKETS = 240;
const H = 100;

/** Heat ramp 0..1 → amber → orange → deep red. */
function heat(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [246, 201, 69]],
    [0.5, [232, 119, 46]],
    [1, [179, 38, 30]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(179,38,30)";
}

export function HotspotBar({ hotspots, large }: { hotspots: Hotspots; large?: boolean }) {
  const { bars, max } = useMemo(() => {
    const { freq, others, baseLength } = hotspots;
    const denom = Math.max(1, others);
    const bars = new Array(BUCKETS).fill(0).map((_, i) => {
      const s = Math.floor((i / BUCKETS) * baseLength);
      const e = Math.max(s + 1, Math.floor(((i + 1) / BUCKETS) * baseLength));
      let sum = 0;
      for (let j = s; j < e && j < baseLength; j++) sum += freq[j];
      const avg = sum / Math.max(1, e - s);
      return avg / denom; // 0..1 intensity
    });
    return { bars, max: Math.max(...bars, 0.001) };
  }, [hotspots]);

  if (hotspots.baseLength === 0 || hotspots.others === 0) return null;

  return (
    <svg viewBox={`0 0 ${BUCKETS} ${H}`} preserveAspectRatio="none" className={"w-full block " + (large ? "h-40" : "h-8")}>
      <rect x={0} y={0} width={BUCKETS} height={H} className="fill-muted/30" />
      {bars.map((v, i) =>
        v > 0 ? <rect key={i} x={i} y={H - (v / max) * (H - 2)} width={1} height={(v / max) * (H - 2)} fill={heat(v)} opacity={0.9} /> : null
      )}
    </svg>
  );
}
