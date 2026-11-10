import { useState } from "react";
import { Play } from "lucide-react";
import { youtubeEmbedUrl, youtubeThumbnail, type FeaturedMatch } from "../../content/robotics";

/* A match thumbnail that loads YouTube's player in its place only when pressed.
   Child classes are derived from className (`__play`, `__icon`). */
function MatchPlayer({ match, className, onPlay }: { match: FeaturedMatch; className: string; onPlay?: () => void }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className={className}>
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(match.id)}
          title={match.event}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          className={`${className}__play`}
          aria-label={`Play ${match.event}`}
          onClick={() => {
            setPlaying(true);
            onPlay?.();
          }}
        >
          <img src={youtubeThumbnail(match.id)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
          <span className={`${className}__icon`}><Play size={26} aria-hidden="true" /></span>
        </button>
      )}
    </div>
  );
}

export default MatchPlayer;
