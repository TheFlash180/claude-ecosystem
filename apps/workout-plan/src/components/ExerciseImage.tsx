import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { W } from '../lib/config';

/** Exercise demo photo with a graceful volt-dumbbell fallback if it fails
 *  to load (e.g. offline before the cache is warm). */
export function ExerciseImage({ src, alt, size, radius = 12 }: {
  src: string; alt: string; size: number; radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: W.raised, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Dumbbell size={size * 0.4} color={W.voltDim} strokeWidth={1.6} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: radius, flexShrink: 0, background: W.raised }}
    />
  );
}
