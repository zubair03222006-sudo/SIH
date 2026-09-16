import { Suspense, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { Earth } from "./Earth";
import { Markers } from "./Markers";
import { Routes } from "./Routes";
import { Satellites } from "./Satellites";
import { Nebula } from "./Nebula";

function SpinningEarth({ radius, sunDirection }: { radius: number; sunDirection: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame(({ clock }, dt) => {
    if (groupRef.current) {
      // Disabled independent rotation.y to avoid visual marker drift under active camera view.
      // Auto-rotation of the camera by OrbitControls handles the visual rotation instead.
      const t = clock.elapsedTime;
      groupRef.current.position.y = Math.sin(t * 0.45) * 0.012;
      groupRef.current.position.x = Math.cos(t * 0.3) * 0.008;
    }
  });
  return (
    <group ref={groupRef}>
      <Earth radius={radius} sunDirection={sunDirection} />
      <Routes radius={radius} />
      <Markers radius={radius} />
    </group>
  );
}

function Sun({ sunRef }: { sunRef: React.MutableRefObject<THREE.Vector3> }) {
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.04;
    sunRef.current.set(Math.cos(t) * 8, Math.sin(t * 0.2) * 2, Math.sin(t) * 8);
    if (lightRef.current) lightRef.current.position.copy(sunRef.current);
  });
  return (
    <>
      <directionalLight ref={lightRef} intensity={2.0} color="#ffffff" />
      <ambientLight intensity={1.5} color="#ffffff" />
      <hemisphereLight args={["#ffffff", "#93c5fd", 1.0]} />
    </>
  );
}

function GlobePlaceholder() {
  return (
    <mesh>
      <sphereGeometry args={[1, 24, 24]} />
      <meshBasicMaterial color="#1e293b" wireframe transparent opacity={0.25} />
    </mesh>
  );
}

function HUDControlsBridge({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  const { camera } = useThree();

  useEffect(() => {
    const handleZoom = (e: Event) => {
      const customEvent = e as CustomEvent;
      const amount = customEvent.detail;
      const dir = camera.position.clone().normalize();
      const currentDist = camera.position.length();
      const newDist = Math.max(1.6, Math.min(6, currentDist + amount));
      camera.position.copy(dir.multiplyScalar(newDist));
    };

    const handleRotate = () => {
      if (controlsRef.current) {
        controlsRef.current.rotateLeft(Math.PI / 8);
        controlsRef.current.update();
      }
    };

    window.addEventListener("globe-zoom", handleZoom);
    window.addEventListener("globe-rotate", handleRotate);
    return () => {
      window.removeEventListener("globe-zoom", handleZoom);
      window.removeEventListener("globe-rotate", handleRotate);
    };
  }, [camera, controlsRef]);

  return null;
}

export default function GlobeScene() {
  const sunRef = useRef(new THREE.Vector3(5, 1, 3));
  const controlsRef = useRef<any>(null!);
  const radius = 1;

  const dpr = useMemo<[number, number]>(() => [1, 1.5], []);

  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 0.4, 3.2], fov: 38, near: 0.1, far: 200 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        powerPreference: "high-performance",
      }}
      style={{ background: "radial-gradient(ellipse at center, #050813 0%, #000005 70%)" }}
    >
      <Suspense fallback={<GlobePlaceholder />}>
        <Sun sunRef={sunRef} />
        <Nebula />
        <Stars radius={60} depth={30} count={1500} factor={2.5} saturation={0} fade speed={0.1} />
        <SpinningEarth radius={radius} sunDirection={sunRef.current} />
        <Satellites count={24} radius={radius} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
          zoomSpeed={0.6}
          minDistance={1.6}
          maxDistance={6}
          autoRotate
          autoRotateSpeed={0.2}
        />
        <HUDControlsBridge controlsRef={controlsRef} />
      </Suspense>
    </Canvas>
  );
}
