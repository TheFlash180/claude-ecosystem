import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { W } from '../lib/config';

/** Exercise demo photo with a graceful volt-dumbbell fallback if it fails
 *  to load (e.g. offline before the cache is warm). Either a fixed `size`,
 *  or `fill` to take the width of its container as a square. */
export function ExerciseImage({ src, alt, size, radius = 12, fill = false }: {
  src: string; alt: string; size?: number; radius?: number; fill?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const box = fill
    ? { width: '100%', aspectRatio: '1 / 1' as const }
    : { width: size, height: size };

  if (!src || failed) {
    return (
      <div style={{
        ...box, borderRadius: radius, flexShrink: 0, background: W.raised,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Dumbbell size={(size ?? 60) * 0.4} color={W.voltDim} strokeWidth={1.6} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: 'cover', borderRadius: radius, flexShrink: 0, background: W.raised }}
    />
  );
}
