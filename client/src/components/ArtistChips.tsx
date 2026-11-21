import type { Artist } from '@onthefeat/shared';

export function Avatar({ artist, size = 40 }: { artist: Artist; size?: number }) {
  return artist.picture ? (
    <img className="avatar" src={artist.picture} alt="" width={size} height={size} />
  ) : (
    <span className="avatar avatar-empty" style={{ width: size, height: size }}>
      {artist.name.slice(0, 1)}
    </span>
  );
}

export function Matchup({ start, target, won }: { start: Artist; target: Artist; won: boolean }) {
  return (
    <div className="matchup">
      <div className="endpoint">
        <Avatar artist={start} size={72} />
        <span className="label">Start</span>
        <strong>{start.name}</strong>
      </div>
      <div className={`link ${won ? 'link-done' : ''}`} aria-hidden>
        {won ? '✓' : '⋯'}
      </div>
      <div className={`endpoint ${won ? 'endpoint-won' : ''}`}>
        <Avatar artist={target} size={72} />
        <span className="label">Cel</span>
        <strong>{target.name}</strong>
      </div>
    </div>
  );
}
