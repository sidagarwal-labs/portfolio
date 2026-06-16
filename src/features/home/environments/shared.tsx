import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { SceneSection } from "../../../types/content";

/* ── Environment fog + background configs per section ── */
export const ENVIRONMENT_THEMES: Record<string, { fog: string; fogNear: number; fogFar: number; bg: string }> = {
  intro:   { fog: "#0c1628", fogNear: 20, fogFar: 140, bg: "#0c1628" },
  impact:  { fog: "#0a0a0e", fogNear: 22, fogFar: 150, bg: "#050508" },
  lab:     { fog: "#1a0c06", fogNear: 18, fogFar: 130, bg: "#1a0c06" },
  library: { fog: "#060a12", fogNear: 12, fogFar: 100, bg: "#060a12" },
  contact: { fog: "#020408", fogNear: 20, fogFar: 140, bg: "#020408" },
};

/* ── Dynamic Fog & Background (lerps between environments) ── */
export function EnvironmentFog({ sectionId, reducedMotion }: { sectionId: string; reducedMotion: boolean }) {
  const { scene } = useThree();
  const targetColor = useRef(new THREE.Color(ENVIRONMENT_THEMES[sectionId]?.bg ?? "#0a0e1a"));
  const currentColor = useRef(new THREE.Color(ENVIRONMENT_THEMES[sectionId]?.bg ?? "#0a0e1a"));
  const targetFogColor = useRef(new THREE.Color(ENVIRONMENT_THEMES[sectionId]?.fog ?? "#0a0e1a"));
  const currentFogColor = useRef(new THREE.Color(ENVIRONMENT_THEMES[sectionId]?.fog ?? "#0a0e1a"));

  useFrame((_, delta) => {
    const theme = ENVIRONMENT_THEMES[sectionId] ?? ENVIRONMENT_THEMES.intro;
    targetColor.current.set(theme.bg);
    targetFogColor.current.set(theme.fog);

    const speed = reducedMotion ? 1 : Math.min(delta * 1.8, 1);
    currentColor.current.lerp(targetColor.current, speed);
    currentFogColor.current.lerp(targetFogColor.current, speed);

    if (!scene.background || !(scene.background instanceof THREE.Color)) {
      scene.background = currentColor.current.clone();
    } else {
      (scene.background as THREE.Color).copy(currentColor.current);
    }

    if (!scene.fog) {
      scene.fog = new THREE.Fog(currentFogColor.current.clone(), theme.fogNear, theme.fogFar);
    } else {
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(currentFogColor.current);
      fog.near += (theme.fogNear - fog.near) * speed;
      fog.far += (theme.fogFar - fog.far) * speed;
    }
  });

  return null;
}

/* ── Camera Rig (spring-damper) ── */
export function CameraRig({ activeSection, reducedMotion }: { activeSection: SceneSection; reducedMotion: boolean }) {
  const posTarget = useRef(new THREE.Vector3(...activeSection.cameraPosition));
  const lookTarget = useRef(new THREE.Vector3(...activeSection.position));
  const currentPos = useRef(new THREE.Vector3(...activeSection.cameraPosition));
  const currentLook = useRef(new THREE.Vector3(...activeSection.position));
  const posVel = useRef(new THREE.Vector3());
  const lookVel = useRef(new THREE.Vector3());
  // Preallocated scratch vectors so the per-frame spring integration
  // does not allocate (avoids GC pauses that show up as periodic hitches).
  const scratchForce = useRef(new THREE.Vector3());
  const scratchDamp = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    posTarget.current.set(...activeSection.cameraPosition);
    lookTarget.current.set(...activeSection.position);

    if (reducedMotion) {
      currentPos.current.copy(posTarget.current);
      currentLook.current.copy(lookTarget.current);
    } else {
      const dt = Math.min(delta, 0.05);
      const stiffness = 12;
      const damping = 8;

      // vel += ((target - current) * stiffness - vel * damping) * dt; current += vel * dt
      scratchForce.current.copy(posTarget.current).sub(currentPos.current).multiplyScalar(stiffness);
      scratchDamp.current.copy(posVel.current).multiplyScalar(damping);
      scratchForce.current.sub(scratchDamp.current).multiplyScalar(dt);
      posVel.current.add(scratchForce.current);
      scratchForce.current.copy(posVel.current).multiplyScalar(dt);
      currentPos.current.add(scratchForce.current);

      scratchForce.current.copy(lookTarget.current).sub(currentLook.current).multiplyScalar(stiffness);
      scratchDamp.current.copy(lookVel.current).multiplyScalar(damping);
      scratchForce.current.sub(scratchDamp.current).multiplyScalar(dt);
      lookVel.current.add(scratchForce.current);
      scratchForce.current.copy(lookVel.current).multiplyScalar(dt);
      currentLook.current.add(scratchForce.current);

      if (currentPos.current.distanceTo(posTarget.current) < 0.2 && posVel.current.length() < 0.5) {
        currentPos.current.copy(posTarget.current);
        posVel.current.set(0, 0, 0);
      }
      if (currentLook.current.distanceTo(lookTarget.current) < 0.2 && lookVel.current.length() < 0.5) {
        currentLook.current.copy(lookTarget.current);
        lookVel.current.set(0, 0, 0);
      }
    }
    state.camera.position.copy(currentPos.current);
    state.camera.lookAt(currentLook.current);
  });
  return null;
}

/* ── Star Field (visible from all environments) ── */
export function StarField() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => Float32Array.from({ length: 3000 }, () => THREE.MathUtils.randFloatSpread(300)), []);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.002; });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={positions.length / 3} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.12} sizeAttenuation transparent opacity={0.8} depthWrite={false} />
    </points>
  );
}
