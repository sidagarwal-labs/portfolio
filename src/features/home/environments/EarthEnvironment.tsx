import { Line, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* ── position anchor (from siteContent intro section) ── */
const CENTER: [number, number, number] = [0, 0, -4];

/* ── Sky dome — gradient from horizon warm-orange to zenith deep-blue ── */
function SkyDome() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(120, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const zenith = new THREE.Color("#0a1628");
    const mid = new THREE.Color("#1a3a6a");
    const horizon = new THREE.Color("#f59e0b");
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i);
      const t = Math.max(0, Math.min(1, y / 120));
      const c = new THREE.Color();
      if (t < 0.15) c.lerpColors(horizon, mid, t / 0.15);
      else c.lerpColors(mid, zenith, (t - 0.15) / 0.85);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, []);

  return (
    <mesh geometry={geo} position={[CENTER[0], CENTER[1] - 2, CENTER[2]]}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

/* ── Clouds ── */
function Clouds() {
  const cloudsData = useMemo(() =>
    Array.from({ length: 35 }, () => ({
      x: (Math.random() - 0.5) * 100,
      y: 18 + Math.random() * 30,
      z: (Math.random() - 0.5) * 100 + CENTER[2],
      scaleX: 4 + Math.random() * 10,
      scaleY: 1.2 + Math.random() * 2,
      opacity: 0.15 + Math.random() * 0.2,
      speed: 0.08 + Math.random() * 0.15,
    })), []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const d = cloudsData[i];
      if (!d) return;
      child.position.x = d.x + Math.sin(t * d.speed + i) * 3;
    });
  });

  return (
    <group ref={groupRef}>
      {cloudsData.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.scaleX, c.scaleY, 3]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#e8ddd0" transparent opacity={c.opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Flying Objects (planes/drones) ── */
function FlyingObjects() {
  const groupRef = useRef<THREE.Group>(null);
  const paths = useMemo(() => [
    { speed: 0.35, y: 12, radius: 22, offset: 0 },
    { speed: 0.2, y: 18, radius: 30, offset: Math.PI * 0.7 },
    { speed: 0.5, y: 8, radius: 16, offset: Math.PI * 1.4 },
  ], []);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const p = paths[i];
      if (!p) return;
      const angle = t * p.speed + p.offset;
      child.position.set(
        Math.cos(angle) * p.radius + CENTER[0],
        p.y + CENTER[1],
        Math.sin(angle) * p.radius + CENTER[2],
      );
      child.rotation.y = -angle + Math.PI / 2;
    });
  });
  return (
    <group ref={groupRef}>
      {paths.map((_, i) => (
        <group key={i}>
          <mesh><boxGeometry args={[0.6, 0.06, 0.06]} /><meshStandardMaterial color="#c0c8d0" metalness={0.7} roughness={0.3} /></mesh>
          <mesh><boxGeometry args={[0.12, 0.01, 0.7]} /><meshStandardMaterial color="#a0a8b0" metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[-0.26, 0.05, 0]}><boxGeometry args={[0.06, 0.12, 0.02]} /><meshStandardMaterial color="#a0a8b0" metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0.3, 0, 0]}><sphereGeometry args={[0.015, 6, 6]} /><meshBasicMaterial color={i % 2 === 0 ? "#ff0000" : "#00ff00"} /></mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Car Traffic ── */
function CarTraffic() {
  const groupRef = useRef<THREE.Group>(null);
  const carsData = useMemo(() => {
    const c: { lanePos: number; axis: "x" | "z"; dir: number; speed: number; offset: number; color: string }[] = [];
    const colors = ["#ff4444", "#ffcc00", "#ffffff", "#4488ff", "#ff8844", "#44ff88"];
    for (let i = 0; i < 18; i++) {
      c.push({
        lanePos: -12 + Math.random() * 20,
        axis: i < 10 ? "x" : "z",
        dir: Math.random() > 0.5 ? 1 : -1,
        speed: 2 + Math.random() * 3,
        offset: Math.random() * 40,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    return c;
  }, []);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const car = carsData[i];
      if (!car) return;
      const pos = ((t * car.speed + car.offset) % 40 - 20) * car.dir;
      if (car.axis === "x") child.position.set(pos, 0.1, car.lanePos);
      else child.position.set(car.lanePos, 0.1, pos);
    });
  });
  return (
    <group ref={groupRef}>
      {carsData.map((car, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.3, 0.12, 0.18]} />
          <meshBasicMaterial color={car.color} />
        </mesh>
      ))}
    </group>
  );
}

/* ── City Skyline ── */
function CitySkyline() {
  const companies = useMemo(() => [
    { name: "Microsoft", color: "#2a7de1", emissive: "#0078d4", sign: "#00bcf2", x: 0, z: -8, w: 1.6, d: 1.6, h: 8, roofColor: "#1a5caa" },
    { name: "OpenAI", color: "#2ecc71", emissive: "#10a37f", sign: "#10a37f", x: -5, z: -6, w: 1.3, d: 1.3, h: 6.5, roofColor: "#188a5c" },
    { name: "Anthropic", color: "#d4845a", emissive: "#e8956a", sign: "#f0a875", x: 5.5, z: -10, w: 1.2, d: 1.2, h: 6, roofColor: "#b06840" },
    { name: "Apple", color: "#8e8e93", emissive: "#b0b0b5", sign: "#d0d0d5", x: -8.5, z: -4, w: 1.4, d: 1.4, h: 7, roofColor: "#636366" },
    { name: "NVIDIA", color: "#76b900", emissive: "#8bd000", sign: "#a0e020", x: 7.5, z: -5, w: 1.1, d: 1.1, h: 5.5, roofColor: "#5a8a00" },
    { name: "Google", color: "#4285f4", emissive: "#5a9cf6", sign: "#7ab8ff", x: 2.8, z: -13, w: 1.5, d: 1.5, h: 7, roofColor: "#3070d0" },
  ], []);

  const buildings = useMemo(() => {
    const b: { x: number; z: number; w: number; d: number; h: number; color: string; roofColor: string; hasAwning: boolean }[] = [];
    const palettes = [
      { wall: "#e07050", roof: "#c05030" },
      { wall: "#d4a055", roof: "#b08040" },
      { wall: "#6aaa5a", roof: "#4a8a3a" },
      { wall: "#5888c0", roof: "#3868a0" },
      { wall: "#c87070", roof: "#a85050" },
      { wall: "#7a9a6a", roof: "#5a7a4a" },
      { wall: "#d4c080", roof: "#b4a060" },
      { wall: "#8898b0", roof: "#687898" },
      { wall: "#c09060", roof: "#a07040" },
      { wall: "#90b870", roof: "#70a050" },
      { wall: "#b0a0c0", roof: "#9080a0" },
      { wall: "#e0a070", roof: "#c08050" },
    ];
    for (let i = 0; i < 90; i++) {
      const angle = (i / 90) * Math.PI * 2;
      const radius = 4 + Math.random() * 14;
      const pal = palettes[Math.floor(Math.random() * palettes.length)];
      b.push({
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 3,
        z: Math.sin(angle) * radius + (Math.random() - 0.5) * 3 + CENTER[2],
        w: 0.35 + Math.random() * 0.85,
        d: 0.35 + Math.random() * 0.85,
        h: 0.6 + Math.random() * 3.8,
        color: pal.wall,
        roofColor: pal.roof,
        hasAwning: Math.random() > 0.6,
      });
    }
    return b;
  }, []);

  const trees = useMemo(() => {
    const t: { x: number; z: number; scale: number; trunkH: number; crownR: number }[] = [];
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 5 + Math.random() * 16;
      t.push({
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
        z: Math.sin(angle) * radius + (Math.random() - 0.5) * 2 + CENTER[2],
        scale: 0.5 + Math.random() * 0.7,
        trunkH: 0.3 + Math.random() * 0.4,
        crownR: 0.25 + Math.random() * 0.25,
      });
    }
    return t;
  }, []);

  return (
    <group position={[CENTER[0], CENTER[1] - 2.3, 0]}>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, CENTER[2]]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4a6a50" roughness={0.92} metalness={0.02} />
      </mesh>
      {/* Roads */}
      {[[-6, CENTER[2]], [0, CENTER[2]], [6, CENTER[2]]].map(([x, z], i) => (
        <mesh key={`rh-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, z]}>
          <planeGeometry args={[2.2, 60]} />
          <meshStandardMaterial color="#888888" roughness={0.88} metalness={0.02} />
        </mesh>
      ))}
      {[[-4, -10], [-4, 0], [-4, 8]].map(([z, x], i) => (
        <mesh key={`rv-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, z + CENTER[2]]}>
          <planeGeometry args={[60, 2.2]} />
          <meshStandardMaterial color="#888888" roughness={0.88} metalness={0.02} />
        </mesh>
      ))}
      {/* Lane markings */}
      {Array.from({ length: 24 }, (_, i) => i * 2.5 - 28).map((off, i) => (
        <group key={`lane-${i}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, off + CENTER[2]]}>
            <planeGeometry args={[0.1, 1]} />
            <meshBasicMaterial color="#ffdd44" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[off, 0.007, CENTER[2]]}>
            <planeGeometry args={[1, 0.1]} />
            <meshBasicMaterial color="#ffdd44" />
          </mesh>
        </group>
      ))}

      {/* Company HQ buildings */}
      {companies.map((c) => (
        <group key={c.name}>
          <mesh position={[c.x, c.h / 2, c.z]}>
            <boxGeometry args={[c.w, c.h, c.d]} />
            <meshStandardMaterial color={c.color} emissive={c.emissive} emissiveIntensity={0.4} roughness={0.5} metalness={0.1} />
          </mesh>
          <mesh position={[c.x, c.h + 0.06, c.z]}>
            <boxGeometry args={[c.w + 0.08, 0.12, c.d + 0.08]} />
            <meshStandardMaterial color={c.roofColor} roughness={0.5} metalness={0.15} />
          </mesh>
          <mesh position={[c.x, c.h + 0.4, c.z + c.d / 2 + 0.02]}>
            <planeGeometry args={[c.w * 0.9, 0.35]} />
            <meshBasicMaterial color={c.sign} transparent opacity={0.85} />
          </mesh>
          <Text position={[c.x, c.h + 0.8, c.z + c.d / 2 + 0.05]} fontSize={0.3} color={c.sign} anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000000" font={undefined}>{c.name}</Text>
          {Array.from({ length: Math.floor(c.h / 0.7) }, (_, f) => (
            <group key={f}>
              <mesh position={[c.x, 0.5 + f * 0.7, c.z + c.d / 2 + 0.02]}>
                <planeGeometry args={[c.w * 0.7, 0.2]} />
                <meshBasicMaterial color="#ffe866" transparent opacity={0.45 + Math.sin(f * 1.3) * 0.12} depthWrite={false} />
              </mesh>
            </group>
          ))}
          <mesh position={[c.x, 0.3, c.z + c.d / 2 + 0.02]}>
            <planeGeometry args={[0.25, 0.5]} />
            <meshBasicMaterial color="#3a2a1a" />
          </mesh>
        </group>
      ))}

      {/* Regular buildings */}
      {buildings.map((b, i) => (
        <group key={i}>
          <mesh position={[b.x, b.h / 2, b.z]}>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.15} roughness={0.6} metalness={0.05} />
          </mesh>
          <mesh position={[b.x, b.h + 0.04, b.z]}>
            <boxGeometry args={[b.w + 0.04, 0.08, b.d + 0.04]} />
            <meshStandardMaterial color={b.roofColor} roughness={0.55} metalness={0.08} />
          </mesh>
          <mesh position={[b.x, b.h / 2, b.z + b.d / 2 + 0.01]}>
            <planeGeometry args={[b.w * 0.75, b.h * 0.7]} />
            <meshBasicMaterial color="#ffe866" transparent opacity={0.22} depthWrite={false} />
          </mesh>
          {b.hasAwning && (
            <mesh position={[b.x, b.h * 0.35, b.z + b.d / 2 + 0.12]}>
              <boxGeometry args={[b.w * 0.8, 0.04, 0.18]} />
              <meshStandardMaterial color={b.roofColor} roughness={0.5} />
            </mesh>
          )}
        </group>
      ))}

      {/* Trees */}
      {trees.map((t, i) => (
        <group key={`tree-${i}`} position={[t.x, 0, t.z]} scale={t.scale}>
          <mesh position={[0, t.trunkH / 2, 0]}>
            <cylinderGeometry args={[0.06, 0.08, t.trunkH, 6]} />
            <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
          </mesh>
          <mesh position={[0, t.trunkH + t.crownR * 0.7, 0]}>
            <sphereGeometry args={[t.crownR, 8, 8]} />
            <meshStandardMaterial color={i % 3 === 0 ? "#2eaa40" : i % 3 === 1 ? "#3cc850" : "#228833"} emissive="#1a6620" emissiveIntensity={0.15} roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* Grid lines */}
      {Array.from({ length: 14 }, (_, i) => i * 3 - 18).map((x) => (
        <Line key={`sx${x}`} points={[[x, 0.01, -30 + CENTER[2]], [x, 0.01, 22 + CENTER[2]]]} color="#aaaaaa" lineWidth={0.3} transparent opacity={0.06} />
      ))}
      {Array.from({ length: 14 }, (_, i) => i * 3 - 20).map((z) => (
        <Line key={`sz${z}`} points={[[-22, 0.01, z + CENTER[2]], [22, 0.01, z + CENTER[2]]]} color="#aaaaaa" lineWidth={0.3} transparent opacity={0.06} />
      ))}
      <CarTraffic />
      <FlyingObjects />
    </group>
  );
}

/* ── Full Earth Environment ── */
export default function EarthEnvironment() {
  return (
    <group>
      {/* Lighting — warm golden hour */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[15, 25, 10]} intensity={1.4} color="#fff0d4" />
      <pointLight position={[-10, 12, 8]} intensity={0.5} color="#f59e0b" />
      <pointLight position={[14, 6, -10]} intensity={0.3} color="#f97316" />
      <hemisphereLight args={["#6090c0", "#4a6a50", 0.35]} />
      <SkyDome />
      <Clouds />
      <CitySkyline />
    </group>
  );
}
