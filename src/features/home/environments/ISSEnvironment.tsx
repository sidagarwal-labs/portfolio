import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* ── position anchor (from siteContent contact section) ── */
const CENTER: [number, number, number] = [0, 22, -4];

/* ── ISS Model ── */
function ISS({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.08; });
  return (
    <group ref={ref} position={position} scale={2.5}>
      <mesh>
        <boxGeometry args={[4, 0.12, 0.12]} />
        <meshStandardMaterial color="#e0e8f0" emissive="#8090a0" emissiveIntensity={0.4} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 1.2, 12]} />
        <meshStandardMaterial color="#f0f4f8" emissive="#a0b0c0" emissiveIntensity={0.3} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.5, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.8, 10]} />
        <meshStandardMaterial color="#e8ecf0" emissive="#90a0b0" emissiveIntensity={0.3} roughness={0.4} metalness={0.5} />
      </mesh>
      {[-1.6, -0.8, 0.8, 1.6].map((x) => (
        <group key={x}>
          <mesh position={[x, 0, 0.7]}>
            <boxGeometry args={[0.5, 0.02, 1.2]} />
            <meshStandardMaterial color="#2a5a9a" emissive="#1060cc" emissiveIntensity={0.35} roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[x, 0, -0.7]}>
            <boxGeometry args={[0.5, 0.02, 1.2]} />
            <meshStandardMaterial color="#2a5a9a" emissive="#1060cc" emissiveIntensity={0.35} roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Earth below the station ── */
function EarthBelow() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.008; });
  return (
    <mesh ref={ref} position={[CENTER[0], CENTER[1] - 40, CENTER[2]]}>
      <sphereGeometry args={[30, 64, 64]} />
      <meshStandardMaterial color="#1a5c8a" emissive="#0a4d70" emissiveIntensity={0.35} roughness={0.75} metalness={0.05} />
    </mesh>
  );
}

/* ── Atmosphere glow ring around Earth ── */
function AtmosphereGlow() {
  return (
    <mesh position={[CENTER[0], CENTER[1] - 40, CENTER[2]]} rotation={[0.3, 0, 0]}>
      <torusGeometry args={[30.5, 0.6, 16, 64]} />
      <meshBasicMaterial color="#4aa8d8" transparent opacity={0.12} depthWrite={false} />
    </mesh>
  );
}

/* ── Orbiting debris / companion satellites ── */
function OrbitalDebris() {
  const items = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      radius: 6 + Math.random() * 10,
      speed: 0.05 + Math.random() * 0.1,
      yOff: (Math.random() - 0.5) * 4,
      phase: (i / 12) * Math.PI * 2,
      size: 0.04 + Math.random() * 0.08,
    })), []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const d = items[i];
      if (!d) return;
      child.position.set(
        CENTER[0] + Math.cos(t * d.speed + d.phase) * d.radius,
        CENTER[1] + d.yOff + Math.sin(t * d.speed * 0.5) * 1.5,
        CENTER[2] + Math.sin(t * d.speed + d.phase) * d.radius,
      );
    });
  });

  return (
    <group ref={groupRef}>
      {items.map((d, i) => (
        <mesh key={i}>
          <boxGeometry args={[d.size, d.size, d.size * 3]} />
          <meshStandardMaterial color="#c0c8d0" emissive="#606870" emissiveIntensity={0.3} roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Full ISS / Contact Environment ── */
export default function ISSEnvironment() {
  const issOrbitRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (issOrbitRef.current) {
      const t = state.clock.elapsedTime * 0.1;
      issOrbitRef.current.position.set(
        CENTER[0] + Math.cos(t) * 6,
        CENTER[1] + Math.sin(t * 0.5) * 2,
        CENTER[2] + Math.sin(t) * 6,
      );
      issOrbitRef.current.rotation.y = t;
    }
  });

  return (
    <group>
      {/* Dark space backdrop */}
      <mesh position={[CENTER[0], CENTER[1], CENTER[2]]}>
        <sphereGeometry args={[110, 24, 24]} />
        <meshBasicMaterial color="#020408" side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[20, 35, 10]} intensity={2.0} color="#ffffff" />
      <pointLight position={[CENTER[0], CENTER[1] + 5, CENTER[2] + 5]} intensity={1.5} color="#88bbee" distance={40} />

      <EarthBelow />
      <AtmosphereGlow />

      <group ref={issOrbitRef}>
        <pointLight position={[0, 0.5, 0]} intensity={8} color="#c8e0ff" distance={25} />
        <ISS position={[0, 0, 0]} />
      </group>

      <OrbitalDebris />
    </group>
  );
}
