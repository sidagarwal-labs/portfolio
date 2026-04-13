import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* ── position anchor (from siteContent impact section) ── */
const CENTER: [number, number, number] = [30, 0, -30];

/* ── Lunar sky dome — black with stars visible overhead ── */
function LunarSky() {
  return (
    <mesh position={[CENTER[0], CENTER[1], CENTER[2]]}>
      <sphereGeometry args={[110, 24, 24]} />
      <meshBasicMaterial color="#050508" side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

/* ── Ground — vast grey lunar plain ── */
function LunarGround() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(200, 200, 80, 80);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      // Gentle rolling terrain with small bumps
      const h = Math.sin(x * 0.06) * 0.8
        + Math.cos(z * 0.08) * 0.6
        + Math.sin(x * 0.2 + z * 0.15) * 0.25
        + Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.12;
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[CENTER[0], CENTER[1] - 2, CENTER[2]]}>
      <meshStandardMaterial color="#b8b0a8" roughness={0.95} metalness={0.02} />
    </mesh>
  );
}

/* ── Craters — bowl-shaped depressions on the surface ── */
function Craters() {
  const craters = useMemo(() =>
    Array.from({ length: 22 }, () => ({
      x: CENTER[0] + (Math.random() - 0.5) * 80,
      z: CENTER[2] + (Math.random() - 0.5) * 80,
      r: 1.5 + Math.random() * 5,
      depth: 0.2 + Math.random() * 0.6,
    })), []);

  return (
    <group>
      {craters.map((cr, i) => (
        <group key={i} position={[cr.x, CENTER[1] - 1.9, cr.z]}>
          {/* Crater rim */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[cr.r * 0.8, cr.r, 24]} />
            <meshStandardMaterial color="#a09890" roughness={0.96} />
          </mesh>
          {/* Crater floor — darker */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -cr.depth, 0]}>
            <circleGeometry args={[cr.r * 0.75, 24]} />
            <meshStandardMaterial color="#807870" roughness={0.98} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Mountains — jagged peaks on the horizon ── */
function LunarMountains() {
  const mountains = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      const angle = (i / 30) * Math.PI * 2;
      const distance = 40 + Math.random() * 35;
      return {
        x: CENTER[0] + Math.cos(angle) * distance,
        z: CENTER[2] + Math.sin(angle) * distance,
        h: 3 + Math.random() * 12,
        w: 2 + Math.random() * 5,
        color: `hsl(40, ${2 + Math.random() * 6}%, ${52 + Math.random() * 18}%)`,
      };
    }), []);

  return (
    <group>
      {mountains.map((m, i) => (
        <mesh key={i} position={[m.x, CENTER[1] - 2 + m.h * 0.4, m.z]}>
          <coneGeometry args={[m.w, m.h, 6]} />
          <meshStandardMaterial color={m.color} roughness={0.95} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Boulders scattered around ── */
function LunarBoulders() {
  const boulders = useMemo(() =>
    Array.from({ length: 40 }, () => ({
      x: CENTER[0] + (Math.random() - 0.5) * 60,
      z: CENTER[2] + (Math.random() - 0.5) * 60,
      s: 0.2 + Math.random() * 0.8,
      ry: Math.random() * Math.PI * 2,
    })), []);

  return (
    <group>
      {boulders.map((b, i) => (
        <mesh key={i} position={[b.x, CENTER[1] - 1.8 + b.s * 0.3, b.z]} rotation={[0, b.ry, 0]} scale={b.s}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#9a9490" roughness={0.96} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Lander + Flag props ── */
function LunarProps() {
  return (
    <group position={[CENTER[0] + 2, CENTER[1] - 2, CENTER[2] - 1]}>
      {/* Lander */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 0.5, 8]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.5} metalness={0.6} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.5, 0.15, Math.cos(a) * 0.5]} rotation={[0, a, Math.PI / 12]}>
          <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
          <meshStandardMaterial color="#a0a0a0" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ── US Flag planted on the surface ── */
function USFlag() {
  return (
    <group position={[CENTER[0] - 1, CENTER[1] - 2, CENTER[2] + 2]}>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.8, 6]} />
        <meshStandardMaterial color="#c0c0c0" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Horizontal support */}
      <mesh position={[0.3, 1.7, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 0.6, 6]} />
        <meshStandardMaterial color="#c0c0c0" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Flag — stripes */}
      <mesh position={[0.3, 1.55, 0.01]}>
        <planeGeometry args={[0.6, 0.35]} />
        <meshBasicMaterial color="#bf0a30" side={THREE.DoubleSide} />
      </mesh>
      {/* Blue canton */}
      <mesh position={[0.08, 1.64, 0.02]}>
        <planeGeometry args={[0.2, 0.18]} />
        <meshBasicMaterial color="#002868" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── "Welcome to the Moon" sign ── */
function WelcomeSign() {
  return (
    <group position={[CENTER[0] + 5, CENTER[1] - 2, CENTER[2] + 4]} rotation={[0, -0.4, 0]}>
      {/* Left post */}
      <mesh position={[-0.8, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 1.2, 6]} />
        <meshStandardMaterial color="#8a8078" roughness={0.9} metalness={0.15} />
      </mesh>
      {/* Right post */}
      <mesh position={[0.8, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 1.2, 6]} />
        <meshStandardMaterial color="#8a8078" roughness={0.9} metalness={0.15} />
      </mesh>
      {/* Sign board */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[1.8, 0.5, 0.05]} />
        <meshStandardMaterial color="#d8d0c0" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Text overlay — dark stripe */}
      <mesh position={[0, 1.1, 0.03]}>
        <planeGeometry args={[1.6, 0.35]} />
        <meshBasicMaterial color="#2a2420" />
      </mesh>
      {/* Arrow left bracket */}
      <mesh position={[-0.7, 1.1, 0.04]}>
        <planeGeometry args={[0.08, 0.2]} />
        <meshBasicMaterial color="#f5a623" />
      </mesh>
      {/* Arrow right bracket */}
      <mesh position={[0.7, 1.1, 0.04]}>
        <planeGeometry args={[0.08, 0.2]} />
        <meshBasicMaterial color="#f5a623" />
      </mesh>
    </group>
  );
}

/* ── Starship-like rocket on launch pad ── */
function StarshipOnPad() {
  return (
    <group position={[CENTER[0] - 6, CENTER[1] - 2, CENTER[2] - 5]}>
      {/* Launch pad — flat octagonal base */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 8]} />
        <meshStandardMaterial color="#555555" roughness={0.85} metalness={0.4} />
      </mesh>
      {/* Pad ring detail */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.2, 8]} />
        <meshStandardMaterial color="#888888" roughness={0.7} metalness={0.5} />
      </mesh>

      {/* Booster (Super Heavy) — wider bottom stage */}
      <mesh position={[0, 2.8, 0]}>
        <cylinderGeometry args={[0.55, 0.6, 5.0, 12]} />
        <meshStandardMaterial color="#c8c4b8" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Grid fins on booster */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * 0.6, 4.8, Math.cos(a) * 0.6]} rotation={[0, a, 0]}>
          <boxGeometry args={[0.02, 0.4, 0.3]} />
          <meshStandardMaterial color="#333333" roughness={0.6} metalness={0.7} />
        </mesh>
      ))}
      {/* Stage separation ring */}
      <mesh position={[0, 5.35, 0]}>
        <cylinderGeometry args={[0.56, 0.55, 0.1, 12]} />
        <meshStandardMaterial color="#444444" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* Ship (Starship upper) — tapered body */}
      <mesh position={[0, 7.6, 0]}>
        <cylinderGeometry args={[0.25, 0.5, 4.4, 12]} />
        <meshStandardMaterial color="#c8c4b8" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Nose cone */}
      <mesh position={[0, 10.1, 0]}>
        <coneGeometry args={[0.25, 0.8, 12]} />
        <meshStandardMaterial color="#c8c4b8" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Forward flaps */}
      {[0.3, -0.3].map((x, i) => (
        <mesh key={i} position={[x, 9.2, 0]} rotation={[0, 0, x > 0 ? 0.15 : -0.15]}>
          <boxGeometry args={[0.02, 1.0, 0.3]} />
          <meshStandardMaterial color="#333333" roughness={0.5} metalness={0.7} />
        </mesh>
      ))}
      {/* Aft flaps */}
      {[0.5, -0.5].map((x, i) => (
        <mesh key={i} position={[x, 5.8, 0]} rotation={[0, 0, x > 0 ? 0.1 : -0.1]}>
          <boxGeometry args={[0.02, 1.2, 0.35]} />
          <meshStandardMaterial color="#333333" roughness={0.5} metalness={0.7} />
        </mesh>
      ))}

      {/* Engine bells at bottom */}
      {[
        [0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.15, z]}>
          <coneGeometry args={[0.12, 0.25, 8]} />
          <meshStandardMaterial color="#444444" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}

      {/* Launch tower / support structure */}
      <group position={[1.8, 0, 0]}>
        {/* Main column */}
        <mesh position={[0, 5, 0]}>
          <boxGeometry args={[0.25, 10, 0.25]} />
          <meshStandardMaterial color="#cc4400" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* Horizontal arms */}
        {[2.5, 5.2, 7.8].map((y, i) => (
          <mesh key={i} position={[-0.6, y, 0]}>
            <boxGeometry args={[1.0, 0.08, 0.15]} />
            <meshStandardMaterial color="#cc4400" roughness={0.7} metalness={0.3} />
          </mesh>
        ))}
        {/* "Chopstick" catch arms at top */}
        <mesh position={[-0.9, 8.5, 0.2]} rotation={[0, 0, 0.15]}>
          <boxGeometry args={[0.8, 0.1, 0.08]} />
          <meshStandardMaterial color="#cc4400" roughness={0.7} metalness={0.3} />
        </mesh>
        <mesh position={[-0.9, 8.5, -0.2]} rotation={[0, 0, 0.15]}>
          <boxGeometry args={[0.8, 0.1, 0.08]} />
          <meshStandardMaterial color="#cc4400" roughness={0.7} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/* ── Small space base buildings ── */
function MoonBase() {
  return (
    <group position={[CENTER[0] + 8, CENTER[1] - 2, CENTER[2] + 1]}>
      {/* Habitat dome 1 */}
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.8, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.5} metalness={0.5} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial color="#888888" roughness={0.7} metalness={0.4} />
      </mesh>

      {/* Habitat dome 2 */}
      <mesh position={[2.0, 0.5, -0.5]}>
        <sphereGeometry args={[0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c8c8c8" roughness={0.5} metalness={0.5} transparent opacity={0.85} />
      </mesh>

      {/* Connecting corridor between domes */}
      <mesh position={[1.0, 0.2, -0.25]} rotation={[0, 0.25, 0]}>
        <boxGeometry args={[1.2, 0.35, 0.35]} />
        <meshStandardMaterial color="#b0b0b0" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Rectangular workshop building */}
      <mesh position={[-1.8, 0.4, 0.5]}>
        <boxGeometry args={[1.2, 0.8, 0.8]} />
        <meshStandardMaterial color="#a8a8a0" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Workshop door */}
      <mesh position={[-1.8, 0.2, 0.91]}>
        <planeGeometry args={[0.3, 0.4]} />
        <meshBasicMaterial color="#444444" />
      </mesh>

      {/* Solar panel array */}
      <group position={[3.5, 0, 0.5]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.0, 6]} />
          <meshStandardMaterial color="#c0c0c0" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 1.0, 0]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[1.2, 0.02, 0.6]} />
          <meshStandardMaterial color="#1a3a6a" emissive="#002266" emissiveIntensity={0.15} roughness={0.3} metalness={0.6} />
        </mesh>
      </group>

      {/* Communication antenna */}
      <group position={[-2.8, 0, -0.5]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.6, 6]} />
          <meshStandardMaterial color="#c0c0c0" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 1.6, 0]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.3, 0.15, 16, 1, true]} />
          <meshStandardMaterial color="#d0d0d0" roughness={0.4} metalness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/* ── Astronaut hitting golf ball ── */
function AstronautGolfer() {
  return (
    <group position={[CENTER[0] - 3, CENTER[1] - 2, CENTER[2] + 5]} rotation={[0, 0.6, 0]}>
      {/* Boots */}
      <mesh position={[-0.08, 0.08, 0]}>
        <boxGeometry args={[0.12, 0.16, 0.18]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0.08, 0.08, 0]}>
        <boxGeometry args={[0.12, 0.16, 0.18]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.07, 0.35, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.4, 8]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0.07, 0.35, 0.03]} rotation={[0.15, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.4, 8]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Torso / suit body */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.14, 0.16, 0.45, 8]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.65} metalness={0.2} />
      </mesh>
      {/* Backpack / life support */}
      <mesh position={[0, 0.72, -0.12]}>
        <boxGeometry args={[0.2, 0.3, 0.1]} />
        <meshStandardMaterial color="#c0c0c0" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Helmet */}
      <mesh position={[0, 1.02, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#e8e8e0" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Visor */}
      <mesh position={[0, 1.03, 0.1]}>
        <sphereGeometry args={[0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#cc8800" roughness={0.1} metalness={0.8} />
      </mesh>
      {/* Arms — right arm swinging golf club */}
      <mesh position={[0.18, 0.75, 0.08]} rotation={[0.6, 0, -0.2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.35, 8]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-0.18, 0.78, 0.05]} rotation={[0.4, 0, 0.2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.35, 8]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* Golf club */}
      <group position={[0.22, 0.55, 0.2]} rotation={[0.8, 0, -0.15]}>
        {/* Shaft */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.6, 6]} />
          <meshStandardMaterial color="#c0c0c0" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Club head */}
        <mesh position={[0.03, 0, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.08]} />
          <meshStandardMaterial color="#444444" roughness={0.4} metalness={0.6} />
        </mesh>
      </group>
      {/* Golf ball on the ground */}
      <mesh position={[0.15, 0.03, 0.35]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ── Earth visible in the sky ── */
function EarthInSky() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.01; });
  return (
    <mesh ref={ref} position={[CENTER[0] - 25, 35, CENTER[2] - 30]}>
      <sphereGeometry args={[6, 32, 32]} />
      <meshStandardMaterial color="#1a5c8a" emissive="#0a6090" emissiveIntensity={0.5} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

/* ── Full Moon Environment ── */
export default function MoonEnvironment() {
  return (
    <group>
      {/* Lighting — stark white sunlight, no atmosphere scatter */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[30, 40, 20]} intensity={2.5} color="#ffffff" />
      <pointLight position={[CENTER[0], CENTER[1] + 15, CENTER[2]]} intensity={0.6} color="#e8e0d0" distance={50} />
      <LunarSky />
      <LunarGround />
      <Craters />
      <LunarMountains />
      <LunarBoulders />
      <LunarProps />
      <USFlag />
      <WelcomeSign />
      <StarshipOnPad />
      <MoonBase />
      <AstronautGolfer />
      <EarthInSky />
    </group>
  );
}
