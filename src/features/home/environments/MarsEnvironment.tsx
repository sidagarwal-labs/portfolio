import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* ── position anchor (from siteContent lab section) ── */
const CENTER: [number, number, number] = [-30, 0, -60];

/* ── Mars sky dome — dusty red-orange gradient ── */
function MarsSky() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(120, 32, 32);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const zenith = new THREE.Color("#2a1008");
    const mid = new THREE.Color("#6a2810");
    const horizon = new THREE.Color("#c86030");
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i);
      const t = Math.max(0, Math.min(1, (y + 120) / 240));
      const c = new THREE.Color();
      if (t < 0.45) c.lerpColors(horizon, mid, t / 0.45);
      else c.lerpColors(mid, zenith, (t - 0.45) / 0.55);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, []);

  return (
    <mesh geometry={geo} position={[CENTER[0], CENTER[1], CENTER[2]]}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

/* ── Terrain — red rocky ground with elevation variations ── */
function MarsGround() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(200, 200, 80, 80);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      const h = Math.sin(x * 0.04) * 1.6
        + Math.cos(z * 0.05) * 1.2
        + Math.sin(x * 0.12 + z * 0.1) * 0.5
        + Math.sin(x * 0.3) * Math.cos(z * 0.25) * 0.3;
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[CENTER[0], CENTER[1] - 2, CENTER[2]]}>
      <meshStandardMaterial color="#b84420" roughness={0.94} metalness={0.03} />
    </mesh>
  );
}

/* ── Olympus Mons-style mountains — large dramatic peaks ── */
function MarsMountains() {
  const mountains = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      const distance = 35 + Math.random() * 40;
      return {
        x: CENTER[0] + Math.cos(angle) * distance,
        z: CENTER[2] + Math.sin(angle) * distance,
        h: 6 + Math.random() * 20,
        w: 4 + Math.random() * 8,
      };
    }), []);

  return (
    <group>
      {mountains.map((m, i) => (
        <mesh key={i} position={[m.x, CENTER[1] - 2 + m.h * 0.35, m.z]}>
          <coneGeometry args={[m.w, m.h, 7]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? "#9a3210" : i % 3 === 1 ? "#a84418" : "#8a2a0c"}
            roughness={0.96}
            metalness={0.02}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── Rocky outcrops closer to the camera ── */
function MarsRocks() {
  const rocks = useMemo(() =>
    Array.from({ length: 50 }, () => ({
      x: CENTER[0] + (Math.random() - 0.5) * 70,
      z: CENTER[2] + (Math.random() - 0.5) * 70,
      s: 0.3 + Math.random() * 1.2,
      ry: Math.random() * Math.PI * 2,
    })), []);

  return (
    <group>
      {rocks.map((r, i) => (
        <mesh key={i} position={[r.x, CENTER[1] - 1.6 + r.s * 0.25, r.z]} rotation={[0, r.ry, Math.random() * 0.3]} scale={[r.s, r.s * 0.7, r.s]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#8a3012" : "#703018"} roughness={0.96} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Dust particles blowing in the wind ── */
function MarsDust() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const v = new Float32Array(600);
    for (let i = 0; i < v.length; i += 3) {
      v[i] = CENTER[0] + (Math.random() - 0.5) * 80;
      v[i + 1] = CENTER[1] + Math.random() * 12;
      v[i + 2] = CENTER[2] + (Math.random() - 0.5) * 80;
    }
    return v;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) + Math.sin(state.clock.elapsedTime * 0.5 + i) * 0.015);
      pos.setY(i, pos.getY(i) + 0.005);
      if (pos.getY(i) > CENTER[1] + 12) pos.setY(i, CENTER[1]);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={positions.length / 3} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#d08050" size={0.08} sizeAttenuation transparent opacity={0.25} depthWrite={false} />
    </points>
  );
}

/* ── Mars Rover prop ── */
function MarsRover() {
  return (
    <group position={[CENTER[0] + 3, CENTER[1] - 1.7, CENTER[2] + 2]}>
      {/* Body */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.8, 0.3, 0.5]} />
        <meshStandardMaterial color="#d8d8d0" roughness={0.45} metalness={0.55} />
      </mesh>
      {/* Mast */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 6]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.12, 0.08, 0.08]} />
        <meshStandardMaterial color="#222222" roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Solar panel */}
      <mesh position={[0, 0.55, 0]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[1.0, 0.02, 0.6]} />
        <meshStandardMaterial color="#1a3a6a" emissive="#0044aa" emissiveIntensity={0.2} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Wheels */}
      {[[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.06, 8]} />
          <meshStandardMaterial color="#444444" roughness={0.8} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ── "Welcome to Mars" sign ── */
function MarsWelcomeSign() {
  return (
    <group position={[CENTER[0] + 5, CENTER[1] - 2, CENTER[2] + 5]} rotation={[0, -0.5, 0]}>
      {/* Left post — old wood style */}
      <mesh position={[-0.9, 0.7, 0]}>
        <boxGeometry args={[0.08, 1.4, 0.08]} />
        <meshStandardMaterial color="#6a4830" roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Right post */}
      <mesh position={[0.9, 0.7, 0]}>
        <boxGeometry args={[0.08, 1.4, 0.08]} />
        <meshStandardMaterial color="#6a4830" roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Main sign board */}
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[2.0, 0.6, 0.06]} />
        <meshStandardMaterial color="#8a6840" roughness={0.92} metalness={0.02} />
      </mesh>
      {/* Text area — lighter plank */}
      <mesh position={[0, 1.25, 0.035]}>
        <planeGeometry args={[1.8, 0.45]} />
        <meshBasicMaterial color="#5a3820" />
      </mesh>
      {/* Decorative top plank */}
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[2.2, 0.08, 0.06]} />
        <meshStandardMaterial color="#7a5838" roughness={0.92} metalness={0.02} />
      </mesh>
    </group>
  );
}

/* ── Olympus Mons — tallest mountain in the solar system (massive shield volcano) ── */
function OlympusMons() {
  const geo = useMemo(() => {
    // Wide, gently-sloping shield volcano shape
    const g = new THREE.ConeGeometry(18, 28, 24, 1);
    const pos = g.attributes.position;
    // Flatten it significantly to look like a shield volcano
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        // Compress the top so it's broad and flat-topped
        pos.setY(i, y * 0.5);
      }
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <group position={[CENTER[0] - 25, CENTER[1] - 2, CENTER[2] - 30]}>
      {/* The massive volcano */}
      <mesh geometry={geo} position={[0, 6, 0]}>
        <meshStandardMaterial color="#a04020" roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Caldera at the top — darker depression */}
      <mesh position={[0, 13.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4, 16]} />
        <meshStandardMaterial color="#6a2810" roughness={0.98} />
      </mesh>
      {/* Snow/frost cap — Mars has CO2 frost at high altitudes */}
      <mesh position={[0, 12.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4, 8, 16]} />
        <meshStandardMaterial color="#d8c0b0" roughness={0.9} metalness={0.05} transparent opacity={0.4} />
      </mesh>
      {/* Sign post at the base */}
      <group position={[12, 0, 8]} rotation={[0, 0.8, 0]}>
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.06, 1.2, 0.06]} />
          <meshStandardMaterial color="#6a4830" roughness={0.95} metalness={0.02} />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[1.2, 0.35, 0.05]} />
          <meshStandardMaterial color="#8a6840" roughness={0.92} metalness={0.02} />
        </mesh>
        {/* "Olympus Mons" label area */}
        <mesh position={[0, 1.1, 0.03]}>
          <planeGeometry args={[1.0, 0.22]} />
          <meshBasicMaterial color="#4a2818" />
        </mesh>
        {/* Arrow pointing at the mountain */}
        <mesh position={[-0.5, 0.85, 0.03]} rotation={[0, 0, 0.5]}>
          <planeGeometry args={[0.2, 0.04]} />
          <meshBasicMaterial color="#f5a623" />
        </mesh>
      </group>
    </group>
  );
}

/* ── Valles Marineris landmark sign — the Grand Canyon of Mars ── */
function VallesMarinerisSign() {
  return (
    <group position={[CENTER[0] + 12, CENTER[1] - 2, CENTER[2] - 8]} rotation={[0, -1.2, 0]}>
      {/* Wooden directional sign post */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.07, 1.6, 0.07]} />
        <meshStandardMaterial color="#5a3820" roughness={0.95} metalness={0.02} />
      </mesh>
      {/* Arrow sign pointing right — "Valles Marineris →" */}
      <mesh position={[0.4, 1.3, 0]}>
        <boxGeometry args={[1.0, 0.25, 0.04]} />
        <meshStandardMaterial color="#7a5030" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[0.4, 1.3, 0.025]}>
        <planeGeometry args={[0.85, 0.16]} />
        <meshBasicMaterial color="#3a2010" />
      </mesh>
      {/* Arrow tip */}
      <mesh position={[0.95, 1.3, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshStandardMaterial color="#7a5030" roughness={0.92} metalness={0.02} />
      </mesh>
      {/* Second arrow pointing left — "Rover Landing Site ←" */}
      <mesh position={[-0.3, 1.0, 0]}>
        <boxGeometry args={[0.85, 0.22, 0.04]} />
        <meshStandardMaterial color="#6a4428" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[-0.3, 1.0, 0.025]}>
        <planeGeometry args={[0.7, 0.14]} />
        <meshBasicMaterial color="#3a2010" />
      </mesh>
      {/* Third sign — "Olympus Mons ↑" */}
      <mesh position={[0.2, 0.65, 0]}>
        <boxGeometry args={[0.9, 0.22, 0.04]} />
        <meshStandardMaterial color="#7a5838" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[0.2, 0.65, 0.025]}>
        <planeGeometry args={[0.75, 0.14]} />
        <meshBasicMaterial color="#3a2010" />
      </mesh>
    </group>
  );
}

/* ── Mars habitat / outpost ── */
function MarsOutpost() {
  return (
    <group position={[CENTER[0] - 5, CENTER[1] - 2, CENTER[2] + 4]}>
      {/* Inflatable habitat — cylindrical */}
      <mesh position={[0, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.5, 1.2, 8, 12]} />
        <meshStandardMaterial color="#c8a080" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Airlock entrance */}
      <mesh position={[0.8, 0.4, 0.35]}>
        <cylinderGeometry args={[0.2, 0.2, 0.3, 8]} />
        <meshStandardMaterial color="#888888" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Solar panels on ground */}
      <mesh position={[-2, 0.15, 0]} rotation={[-0.6, 0, 0]}>
        <boxGeometry args={[1.5, 0.02, 0.8]} />
        <meshStandardMaterial color="#1a3a6a" emissive="#001144" emissiveIntensity={0.1} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* Comm tower */}
      <group position={[2, 0, -0.5]}>
        <mesh position={[0, 1.0, 0]}>
          <cylinderGeometry args={[0.02, 0.03, 2.0, 6]} />
          <meshStandardMaterial color="#aaaaaa" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 2.0, 0]} rotation={[0.4, 0, 0]}>
          <coneGeometry args={[0.2, 0.12, 12, 1, true]} />
          <meshStandardMaterial color="#cccccc" roughness={0.4} metalness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/* ── Full Mars Environment ── */
export default function MarsEnvironment() {
  return (
    <group>
      {/* Lighting — warm orange sun through dusty atmosphere */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[-20, 30, 10]} intensity={2.0} color="#ffaa60" />
      <pointLight position={[CENTER[0], CENTER[1] + 15, CENTER[2]]} intensity={0.8} color="#ff8040" distance={60} />
      <hemisphereLight args={["#c86030", "#6a2810", 0.3]} />
      <MarsSky />
      <MarsGround />
      <MarsMountains />
      <MarsRocks />
      <MarsDust />
      <MarsRover />
      <MarsWelcomeSign />
      <OlympusMons />
      <VallesMarinerisSign />
      <MarsOutpost />
    </group>
  );
}
