import type { ProjectEntry } from "../types/content";
import { getAccentTone } from "../lib/accentTone";

type ProjectVisualProps = Pick<ProjectEntry, "title" | "stack" | "accent" | "visualMode" | "archetype">;

function ProjectVisual({ title, stack, accent, visualMode, archetype }: ProjectVisualProps) {
  const tone = getAccentTone(accent);

  return (
    <div className={`project-visual project-visual--${visualMode} project-visual--${archetype} project-visual--tone-${tone}`} aria-hidden="true">
      <div className="project-visual__mesh">
        <span className="project-visual__terrain" />
        <span className="project-visual__grid-overlay" />
        <span className="project-visual__reticle" />
        <span className="project-visual__ring project-visual__ring--one" />
        <span className="project-visual__ring project-visual__ring--two" />
        <span className="project-visual__bar project-visual__bar--one" />
        <span className="project-visual__bar project-visual__bar--two" />
        <span className="project-visual__bar project-visual__bar--three" />
        <span className="project-visual__line project-visual__line--one" />
        <span className="project-visual__line project-visual__line--two" />
        <span className="project-visual__node project-visual__node--one" />
        <span className="project-visual__node project-visual__node--two" />
        <span className="project-visual__node project-visual__node--three" />
      </div>

      <div className="project-visual__footer">
        <strong>{title}</strong>
        <div className="project-visual__chips">
          {stack.slice(0, 3).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProjectVisual;
