import { useMemo } from "react";
import * as THREE from "three";

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Lightweight analytical space glow shader
const frag = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    vec3 cool = vec3(0.02, 0.05, 0.15);
    vec3 warm = vec3(0.15, 0.04, 0.12);
    float band = exp(-pow((d.y - 0.05) * 3.0, 2.0));
    vec3 col = mix(cool, warm, smoothstep(-0.5, 0.5, d.x));
    col += vec3(0.1, 0.15, 0.3) * band * 0.4;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Nebula() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-2}>
      <sphereGeometry args={[80, 32, 32]} />
    </mesh>
  );
}
