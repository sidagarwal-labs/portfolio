import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { SceneSection } from "../../types/content";
import {
  CameraRig,
  StarField,
  EnvironmentFog,
  EarthEnvironment,
  MoonEnvironment,
  MarsEnvironment,
  SpaceshipEnvironment,
  ISSEnvironment,
} from "./environments";

type KnowledgeOrbitSceneProps = {
  sections: SceneSection[];
  activeSectionId: string;
  onSectionChange: (sectionId: string) => void;
  reducedMotion: boolean;
};

/* ── Travel paths between environments (subtle route lines) ── */
function TravelPaths() {
  const paths = useMemo(() => [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(10, 5, -10),
      new THREE.Vector3(20, 4, -20),
      new THREE.Vector3(30, 2, -28),
    ]).getPoints(60),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(30, 2, -28),
      new THREE.Vector3(10, 6, -40),
      new THREE.Vector3(-10, 4, -50),
      new THREE.Vector3(-30, 2, -58),
    ]).getPoints(60),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-30, 2, -58),
      new THREE.Vector3(-18, 10, -70),
      new THREE.Vector3(-6, 14, -82),
      new THREE.Vector3(0, 15, -88),
    ]).getPoints(60),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 15, -88),
      new THREE.Vector3(-4, 18, -60),
      new THREE.Vector3(-2, 20, -30),
      new THREE.Vector3(0, 22, -6),
    ]).getPoints(60),
  ], []);

  return (
    <>
      {paths.map((pts, i) => (
        <Line key={i} points={pts} color="#f59e0b" lineWidth={0.6} transparent opacity={0.06} />
      ))}
    </>
  );
}

/* ── Main Scene (orchestrator) ── */
function KnowledgeOrbitScene({ sections, activeSectionId, reducedMotion }: KnowledgeOrbitSceneProps) {
  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const sid = activeSection.id;

  return (
    <>
      {/* Dynamic fog & background color */}
      <EnvironmentFog sectionId={sid} reducedMotion={reducedMotion} />

      {/* Global elements */}
      <StarField />
      <TravelPaths />

      {/* Per-section immersive environments — only the active section is mounted,
          so hidden environments don't build geometry or run animation loops */}
      {sid === "intro" && <EarthEnvironment />}
      {sid === "impact" && <MoonEnvironment />}
      {sid === "lab" && <MarsEnvironment />}
      {sid === "library" && <SpaceshipEnvironment />}
      {sid === "contact" && <ISSEnvironment />}

      {/* Camera */}
      <CameraRig activeSection={activeSection} reducedMotion={reducedMotion} />
    </>
  );
}

export default KnowledgeOrbitScene;
