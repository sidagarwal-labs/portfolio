import type { PropsWithChildren } from "react";
import SiteNavigation from "./SiteNavigation";
import { usePageReveal } from "../hooks/usePageReveal";

type PageFrameProps = PropsWithChildren<{
  className?: string;
}>;

function PageFrame({ children, className = "" }: PageFrameProps) {
  const isReady = usePageReveal();

  return (
    <div className={isReady ? `page-shell page-shell--ready ${className}`.trim() : `page-shell page-shell--entering ${className}`.trim()}>
      <div className="scene-static" aria-hidden="true">
        <div className="scene-static__gradient" />
        <div className="scene-static__grid" />
        <div className="scene-static__glow scene-static__glow--left" />
        <div className="scene-static__glow scene-static__glow--right" />
        <div className="scene-static__code-rain" />
        <div className="scene-static__scatter" />
      </div>

      <SiteNavigation />

      <main className="content-shell site-shell">{children}</main>
    </div>
  );
}

export default PageFrame;
