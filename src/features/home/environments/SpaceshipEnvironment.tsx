import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* ── position anchor (from siteContent library section) ── */
const CENTER: [number, number, number] = [0, 15, -90];

/* ── Spaceship Interior Environment ── */
export default function SpaceshipEnvironment() {
  const panelRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (panelRef.current) {
      panelRef.current.children.forEach((c, i) => {
        const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat && mat.opacity !== undefined)
          mat.opacity = 0.4 + Math.sin(state.clock.elapsedTime * 2 + i * 1.5) * 0.2;
      });
    }
  });

  /* Stars visible through the viewport */
  const viewportStars = useMemo(() =>
    Array.from({ length: 40 }, () => ({
      x: (Math.random() - 0.5) * 3.5,
      y: 0.5 + (Math.random() - 0.5) * 2,
      z: -4.3 - Math.random() * 5,
    })), []);

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <group position={CENTER}>
        <pointLight position={[0, 1.5, -1]} intensity={4.0} color="#88bbdd" distance={18} />
        <pointLight position={[0, -1, -3]} intensity={2.5} color="#f59e0b" distance={16} />
        <pointLight position={[0, 0, 2]} intensity={2.0} color="#ff6b35" distance={14} />
        <pointLight position={[0, 2, 0]} intensity={1.5} color="#ffffff" distance={12} />

        {/* Hull cylinder */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.5, 3.5, 8, 24, 1, true]} />
          <meshStandardMaterial color="#3a5060" emissive="#1a2838" emissiveIntensity={0.3} roughness={0.5} metalness={0.4} side={THREE.BackSide} />
        </mesh>

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
          <circleGeometry args={[3.4, 24]} />
          <meshStandardMaterial color="#2a3a4a" emissive="#0a1520" emissiveIntensity={0.2} roughness={0.7} metalness={0.3} />
        </mesh>

        {/* Viewport window */}
        <mesh position={[0, 0.5, -4]}>
          <planeGeometry args={[4, 2.5]} />
          <meshBasicMaterial color="#0a1828" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
        <Line
          points={[[-2, 1.75, -3.99], [2, 1.75, -3.99], [2, -0.75, -3.99], [-2, -0.75, -3.99], [-2, 1.75, -3.99]]}
          color="#f59e0b" lineWidth={1.5} transparent opacity={0.5}
        />

        {/* Stars through viewport */}
        {viewportStars.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, s.z]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
          </mesh>
        ))}

        {/* Left console */}
        <group position={[-2.8, 0, -1]}>
          <mesh rotation={[0, Math.PI / 6, 0]}>
            <boxGeometry args={[1.2, 1.8, 0.1]} />
            <meshStandardMaterial color="#1a2838" emissive="#0a1828" emissiveIntensity={0.3} roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh rotation={[0, Math.PI / 6, 0]} position={[0, 0, 0.06]}>
            <planeGeometry args={[1, 1.5]} />
            <meshBasicMaterial color="#003344" transparent opacity={0.4} />
          </mesh>
        </group>

        {/* Blinking lights */}
        <group ref={panelRef}>
          {[[-0.3, 0.4], [0, 0.4], [0.3, 0.4], [-0.2, 0], [0.2, 0], [-0.3, -0.4], [0.1, -0.4]].map(([x, y], i) => (
            <mesh key={i} position={[x - 2.6, y, -0.88]} rotation={[0, Math.PI / 6, 0]}>
              <circleGeometry args={[0.04, 8]} />
              <meshBasicMaterial color={i % 3 === 0 ? "#84cc16" : i % 3 === 1 ? "#f59e0b" : "#f472b6"} transparent opacity={0.5} />
            </mesh>
          ))}
        </group>

        {/* Right console */}
        <group position={[2.8, 0, -1]}>
          <mesh rotation={[0, -Math.PI / 6, 0]}>
            <boxGeometry args={[1.2, 1.8, 0.1]} />
            <meshStandardMaterial color="#1a2838" emissive="#0a1828" emissiveIntensity={0.3} roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh rotation={[0, -Math.PI / 6, 0]} position={[0, 0, 0.06]}>
            <planeGeometry args={[1, 1.5]} />
            <meshBasicMaterial color="#003344" transparent opacity={0.4} />
          </mesh>
        </group>

        {/* Pilot seats */}
        {[-0.8, 0.8].map((x) => (
          <group key={x} position={[x, -1.4, -1.5]}>
            <mesh><boxGeometry args={[0.6, 0.8, 0.5]} /><meshStandardMaterial color="#253545" roughness={0.6} metalness={0.2} /></mesh>
            <mesh position={[0, 0.6, -0.2]}><boxGeometry args={[0.6, 0.6, 0.15]} /><meshStandardMaterial color="#253545" roughness={0.6} metalness={0.2} /></mesh>
          </group>
        ))}

        {/* Ceiling lights */}
        {[-1.2, -0.4, 0.4, 1.2].map((x) => (
          <mesh key={x} position={[x, 2.1, 0]}>
            <boxGeometry args={[0.4, 0.06, 0.9]} />
            <meshBasicMaterial color="#e0f0ff" transparent opacity={0.7} />
          </mesh>
        ))}

        {/* Hull ring accents */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -2]}>
          <torusGeometry args={[3.2, 0.04, 8, 48]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.2} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 1]}>
          <torusGeometry args={[3.2, 0.03, 8, 48]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.15} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
