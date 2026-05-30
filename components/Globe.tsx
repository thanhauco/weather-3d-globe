"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Stars, Line, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { CitySnapshot, PlaceSnapshot, StormSummary, StormTrack } from "@/lib/types";
import { latLonToVec3, sunDirection } from "@/lib/geo";
import { weatherEmoji, tempColor } from "@/lib/weatherIcons";

const R = 1.4;

const DAY_MAP = "https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/2_no_clouds_4k.jpg";
const NIGHT_MAP = "https://unpkg.com/three-globe/example/img/earth-night.jpg";
const SPEC_MAP = "https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/water_4k.png";
const BUMP_MAP = "https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/elev_bump_4k.jpg";
const CLOUD_MAP = "https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png";

// Level-of-detail markers. When zoomed out only the largest metros show; as
// you zoom into a region, smaller local cities fade in and the far side of the
// globe is culled. Population is in thousands.
const MARKER_CAMERA_MIN = 2.0; // matches OrbitControls minDistance
const MARKER_CAMERA_MAX = 7; // matches OrbitControls maxDistance
const MARKER_POP_CEILING = 9000; // pop threshold when fully zoomed out
const MARKER_MAX_VISIBLE = 70; // hard cap to keep it readable

interface GlobeProps {
  cities: CitySnapshot[];
  at: Date;
  selectedId: number | null;
  onSelect: (id: number) => void;
  autoRotate: boolean;
  focus: { lat: number; lon: number; distance?: number } | null;
  focusPlace: PlaceSnapshot | null;
  stormMode: boolean;
  selectedStorm: StormSummary | null;
  stormTrack: StormTrack | null;
  windMode: boolean;
}

// Initial camera distance so the globe fills ~70% of the viewport height.
const FIT_DISTANCE = 4.9;

export default function Globe({
  cities,
  at,
  selectedId,
  onSelect,
  autoRotate,
  focus,
  focusPlace,
  stormMode,
  selectedStorm,
  stormTrack,
  windMode,
}: GlobeProps) {
  const controlsRef = useRef<any>(null);
  return (
    <Canvas
      camera={{ position: [0, 0.7, FIT_DISTANCE], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#03040c"]} />
      <ambientLight intensity={0.18} />
      <Stars radius={80} depth={40} count={4000} factor={3} fade speed={0.6} />
      <Suspense fallback={null}>
        <Earth at={at} />
        <Clouds at={at} />
        <Atmosphere />
        {windMode && <WindField cities={cities} />}
        {!focusPlace && !stormMode && !selectedStorm && (
          <Markers cities={cities} selectedId={selectedId} onSelect={onSelect} />
        )}
        <FocusPin place={focusPlace} at={at} />
        <StormVisuals stormTrack={stormTrack} at={at} />
      </Suspense>
      <CameraRig focus={focus} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={2.0}
        maxDistance={7}
        autoRotate={autoRotate}
        autoRotateSpeed={0.35}
        rotateSpeed={0.5}
      />
    </Canvas>
  );
}

// Smoothly flies the camera so the focused lat/lon faces the viewer.
function CameraRig({
  focus,
  controlsRef,
}: {
  focus: { lat: number; lon: number; distance?: number } | null;
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  const target = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!focus) {
      target.current = null;
      return;
    }
    // Position the camera along the surface-point direction at the requested
    // zoom (defaults to a close zoom for searches).
    const dir = latLonToVec3(focus.lat, focus.lon, 1).normalize();
    target.current = dir.multiplyScalar(focus.distance ?? 2.6);
  }, [focus]);

  useFrame(() => {
    if (!target.current) return;
    camera.position.lerp(target.current, 0.05);
    controlsRef.current?.update?.();
    if (camera.position.distanceTo(target.current) < 0.015) {
      target.current = null;
    }
  });

  return null;
}

function Earth({ at }: { at: Date }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [dayMap, nightMap, specMap, bumpMap] = useTexture([
    DAY_MAP,
    NIGHT_MAP,
    SPEC_MAP,
    BUMP_MAP,
  ]);

  const material = useMemo(() => {
    const maxAniso = 16;
    [dayMap, nightMap].forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
    });
    [specMap, bumpMap].forEach((t) => {
      t.anisotropy = maxAniso;
    });
    return new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        specMap: { value: specMap },
        bumpMap: { value: bumpMap },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        texel: { value: new THREE.Vector2(1 / 4096, 1 / 2048) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewW;
        varying vec3 vTangentW;
        varying vec3 vBitangentW;
        void main() {
          vUv = uv;
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vNormalW = n;
          // East/north tangent basis for an equirectangular sphere.
          vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n));
          vTangentW = east;
          vBitangentW = normalize(cross(n, east));
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vViewW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform sampler2D specMap;
        uniform sampler2D bumpMap;
        uniform vec3 sunDir;
        uniform vec2 texel;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vViewW;
        varying vec3 vTangentW;
        varying vec3 vBitangentW;

        void main() {
          vec3 n = normalize(vNormalW);
          vec3 s = normalize(sunDir);

          float water = texture2D(specMap, vUv).r;

          // --- Bump mapping: gentle terrain relief, land only ---
          float step = 2.5;
          float bScale = 0.12 * (1.0 - water);
          float h0 = texture2D(bumpMap, vUv).r;
          float hx = texture2D(bumpMap, vUv + vec2(texel.x * step, 0.0)).r;
          float hy = texture2D(bumpMap, vUv + vec2(0.0, texel.y * step)).r;
          vec3 bn = normalize(
            n - (vTangentW * (hx - h0) + vBitangentW * (hy - h0)) * bScale * 40.0
          );

          float geomLight = dot(n, s);
          float bumpLight = max(dot(bn, s), 0.0);

          // Smooth day/night transition across the terminator.
          float dayMix = smoothstep(-0.10, 0.32, geomLight);

          vec3 day = texture2D(dayMap, vUv).rgb;
          // Lift + saturate so land/ocean read vividly and richly.
          day = pow(day, vec3(0.88)) * 1.22;
          float lum = dot(day, vec3(0.299, 0.587, 0.114));
          day = mix(vec3(lum), day, 1.3);
          // Subtle relief shading on land only.
          day *= mix(1.0, 0.7 + 0.5 * bumpLight, (1.0 - water) * 0.6);

          vec3 night = texture2D(nightMap, vUv).rgb * 1.8;

          vec3 color = mix(night, day, dayMix);

          // Specular sun-glint on water (specMap: white = water).
          vec3 hVec = normalize(s + vViewW);
          float spec = pow(max(dot(n, hVec), 0.0), 80.0) * water * dayMix;
          color += vec3(0.75, 0.85, 1.0) * spec * 0.85;

          // Warm rim along the terminator.
          float term = 1.0 - abs(geomLight);
          color += vec3(0.22, 0.13, 0.05) * pow(clamp(term, 0.0, 1.0), 3.0);

          // Subtle blue fresnel toward the limb for an atmospheric edge.
          float fres = pow(1.0 - max(dot(n, vViewW), 0.0), 3.0);
          color += vec3(0.18, 0.36, 0.7) * fres * (0.4 + 0.6 * dayMix);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }, [dayMap, nightMap, specMap, bumpMap]);

  useFrame(() => {
    const dir = sunDirection(at);
    (material.uniforms.sunDir.value as THREE.Vector3).set(dir.x, dir.y, dir.z);
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[R, 192, 192]} />
    </mesh>
  );
}

function Clouds({ at }: { at: Date }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cloudMap = useTexture(CLOUD_MAP);

  const material = useMemo(() => {
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.anisotropy = 8;
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        cloudMap: { value: cloudMap },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main() {
          vUv = uv;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D cloudMap;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main() {
          float alpha = texture2D(cloudMap, vUv).r;
          float intensity = dot(normalize(vNormalW), normalize(sunDir));
          float lit = smoothstep(-0.15, 0.35, intensity);
          // Clouds are bright in daylight, dim grey at night.
          vec3 col = mix(vec3(0.10, 0.12, 0.18), vec3(1.0), lit);
          gl_FragColor = vec4(col, alpha * (0.25 + 0.65 * lit));
        }
      `,
    });
  }, [cloudMap]);

  useFrame((_, delta) => {
    const dir = sunDirection(at);
    (material.uniforms.sunDir.value as THREE.Vector3).set(dir.x, dir.y, dir.z);
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.006;
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[R * 1.012, 96, 96]} />
    </mesh>
  );
}

function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {},
        vertexShader: /* glsl */ `
          varying vec3 vNormalV;
          void main() {
            vNormalV = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vNormalV;
          void main() {
            float rim = pow(1.0 - abs(vNormalV.z), 3.0);
            vec3 glow = mix(vec3(0.25, 0.5, 1.0), vec3(0.55, 0.75, 1.0), rim);
            gl_FragColor = vec4(glow, rim * 1.1);
          }
        `,
      }),
    []
  );
  return (
    <mesh material={material} scale={1.18}>
      <sphereGeometry args={[R, 64, 64]} />
    </mesh>
  );
}

// Synthetic-but-plausible global wind field: prevailing zonal winds (tropical
// easterlies, mid-latitude westerlies, polar easterlies) with a gentle
// meridional wobble. Local speed is biased by nearby city observations so the
// flow reacts to the live data. Returns degrees/second [dLon, dLat].
function windVector(
  lat: number,
  lon: number,
  speedScale: number
): [number, number] {
  const rad = Math.PI / 180;
  // Base zonal direction by latitude band (+east / -west).
  let zonal: number;
  const a = Math.abs(lat);
  if (a < 30) zonal = -1; // trade winds → west
  else if (a < 60) zonal = 1; // westerlies → east
  else zonal = -0.7; // polar easterlies → west
  // Smooth the band transitions and taper toward the poles.
  zonal *= Math.cos(lat * rad);
  // Meridional wobble produces swirling, less robotic streamlines.
  const merid =
    0.35 * Math.sin(lon * 2 * rad + lat * rad) * Math.cos(lat * 1.5 * rad);
  const k = 9 * speedScale;
  return [zonal * k, merid * k];
}

// Animated wind-flow particle layer. Particles drift along the wind field and
// respawn when they age out, producing flowing streaklines over the globe.
function WindField({ cities }: { cities: CitySnapshot[] }) {
  const COUNT = 1400;
  const pointsRef = useRef<THREE.Points>(null);

  // Average observed wind to scale the whole field's liveliness.
  const speedScale = useMemo(() => {
    if (!cities.length) return 1;
    const avg =
      cities.reduce((s, c) => s + (c.wind_kph || 0), 0) / cities.length;
    return Math.min(1.8, Math.max(0.5, avg / 18));
  }, [cities]);

  // Per-particle lat/lon/age, plus the GPU position + color buffers.
  const state = useMemo(() => {
    const lat = new Float32Array(COUNT);
    const lon = new Float32Array(COUNT);
    const age = new Float32Array(COUNT);
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      lat[i] = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
      lon[i] = Math.random() * 360 - 180;
      age[i] = Math.random() * 3;
    }
    return { lat, lon, age, positions, colors };
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(state.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(state.colors, 3));
    return g;
  }, [state]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.018,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const { lat, lon, age, positions, colors } = state;
    for (let i = 0; i < COUNT; i++) {
      age[i] += delta;
      if (age[i] > 3.2) {
        // Respawn somewhere fresh to keep coverage even.
        lat[i] = Math.asin(2 * Math.random() - 1) * (180 / Math.PI);
        lon[i] = Math.random() * 360 - 180;
        age[i] = 0;
      }
      const [dLon, dLat] = windVector(lat[i], lon[i], speedScale);
      // Convert eastward deg/s to lon deg/s (compress near the poles).
      const cosLat = Math.max(0.2, Math.cos(lat[i] * (Math.PI / 180)));
      lon[i] += (dLon / cosLat) * delta;
      lat[i] += dLat * delta;
      if (lon[i] > 180) lon[i] -= 360;
      if (lon[i] < -180) lon[i] += 360;
      if (lat[i] > 89) lat[i] = 89;
      if (lat[i] < -89) lat[i] = -89;

      const v = latLonToVec3(lat[i], lon[i], R * 1.02);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;

      // Fade in then out over the particle lifetime.
      const life = age[i] / 3.2;
      const fade = Math.sin(life * Math.PI);
      const speed = Math.hypot(dLon, dLat) / (9 * speedScale);
      // Cyan (slow) → white (fast), brightened by fade.
      colors[i * 3] = (0.4 + 0.6 * speed) * fade;
      colors[i * 3 + 1] = (0.8 + 0.2 * speed) * fade;
      colors[i * 3 + 2] = fade;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function Markers({
  cities,
  selectedId,
  onSelect,
}: {
  cities: CitySnapshot[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const { camera } = useThree();
  const earthRef = useRef<THREE.Mesh>(null);

  // Precompute each city's unit direction once.
  const cityDirs = useMemo(
    () =>
      cities.map((c) => ({
        c,
        dir: latLonToVec3(c.lat, c.lon, 1).normalize(),
      })),
    [cities]
  );

  // Track camera zoom/orientation, throttled so we only recompute when the
  // view changes meaningfully (not every frame).
  const viewRef = useRef({ dist: 3.8, dir: new THREE.Vector3(0, 0, 1) });
  const [tick, setTick] = useState(0);
  useFrame(() => {
    const dist = camera.position.length();
    const dir = camera.position.clone().normalize();
    const prev = viewRef.current;
    if (Math.abs(dist - prev.dist) > 0.04 || dir.dot(prev.dir) < 0.9995) {
      viewRef.current = { dist, dir };
      setTick((n) => (n + 1) % 100000);
    }
  });

  // Choose which cities to label based on the current zoom level.
  const visible = useMemo(() => {
    const { dist, dir } = viewRef.current;
    const t = Math.min(
      1,
      Math.max(
        0,
        (dist - MARKER_CAMERA_MIN) / (MARKER_CAMERA_MAX - MARKER_CAMERA_MIN)
      )
    );
    // Zoomed in (t→0): low population floor + tight region.
    // Zoomed out (t→1): only huge metros + whole front hemisphere.
    const minPop = t * t * MARKER_POP_CEILING;
    const dotCutoff = 0.86 * (1 - t);
    return cityDirs
      .filter(({ c, dir: cd }) => c.population >= minPop && cd.dot(dir) >= dotCutoff)
      .sort((a, b) => b.c.population - a.c.population)
      .slice(0, MARKER_MAX_VISIBLE)
      .map(({ c }) => c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityDirs, tick]);

  return (
    <group>
      {/* invisible occluder matching the earth so back-side markers hide */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[R * 0.99, 48, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {visible.map((c) => {
        const pos = latLonToVec3(c.lat, c.lon, R * 1.015);
        const selected = c.id === selectedId;
        return (
          <Html
            key={c.id}
            position={[pos.x, pos.y, pos.z]}
            center
            distanceFactor={6}
            occlude={earthRef.current ? [earthRef] : undefined}
            zIndexRange={[20, 0]}
          >
            <Marker
              city={c}
              selected={selected}
              onSelect={() => onSelect(c.id)}
            />
          </Html>
        );
      })}
    </group>
  );
}

function Marker({
  city,
  selected,
  onSelect,
}: {
  city: CitySnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = tempColor(city.temp_c);
  return (
    <button
      onClick={onSelect}
      className="group relative flex -translate-y-1/2 select-none flex-col items-center"
      style={{ pointerEvents: "auto" }}
    >
      <div
        className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none shadow-lg transition-transform ${
          selected ? "scale-125 ring-2 ring-sky-300" : "group-hover:scale-110"
        }`}
        style={{
          background: "rgba(8,12,22,0.82)",
          border: `1.5px solid ${color}`,
          color: "#e8f0fb",
          boxShadow: `0 0 10px ${color}66`,
        }}
      >
        <span style={{ fontSize: 13 }}>
          {weatherEmoji(city.condition, city.local_hour)}
        </span>
        <span>{Math.round(city.temp_c)}°</span>
      </div>
      <div
        className={`mt-0.5 max-w-[90px] truncate text-[9px] font-medium text-slate-200/90 opacity-0 transition-opacity ${
          selected ? "opacity-100" : "group-hover:opacity-100"
        }`}
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
      >
        {city.name}
      </div>
    </button>
  );
}

// Highlighted pin at a searched location, plus a sunlight ray that shows the
// real sun direction striking that point (only drawn when the sun is up).
function FocusPin({ place, at }: { place: PlaceSnapshot | null; at: Date }) {
  if (!place) return null;

  const surface = latLonToVec3(place.lat, place.lon, R * 1.01);
  const normal = latLonToVec3(place.lat, place.lon, 1).normalize();
  const sun = sunDirection(at);
  const sunUp = normal.x * sun.x + normal.y * sun.y + normal.z * sun.z;
  const isDay = sunUp > 0;

  // A beam coming in from the sun direction onto the surface point.
  const beamStart = surface.clone().add(sun.clone().multiplyScalar(0.9));
  const color = tempColor(place.temp_c);

  return (
    <group>
      {isDay && (
        <Line
          points={[
            [beamStart.x, beamStart.y, beamStart.z],
            [surface.x, surface.y, surface.z],
          ]}
          color="#ffdf80"
          lineWidth={2}
          transparent
          opacity={0.55 + 0.45 * Math.min(1, sunUp * 2)}
          dashed
          dashScale={20}
        />
      )}

      {/* glowing dot on the surface */}
      <mesh position={[surface.x, surface.y, surface.z]}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <Html
        position={[surface.x, surface.y, surface.z]}
        center
        zIndexRange={[80, 60]}
      >
        <div className="pointer-events-none flex -translate-y-[150%] flex-col items-center">
          <div
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-bold leading-none shadow-xl"
            style={{
              background: "rgba(8,12,22,0.9)",
              border: `2px solid ${color}`,
              color: "#eef4ff",
              boxShadow: `0 0 16px ${color}99`,
            }}
          >
            <span style={{ fontSize: 16 }}>
              {weatherEmoji(place.condition, place.local_hour, isDay)}
            </span>
            <span>{Math.round(place.temp_c)}°</span>
          </div>
          <div
            className="mt-1 max-w-[160px] truncate text-[12px] font-semibold text-white"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.95)" }}
          >
            {place.name}
          </div>
          <div
            className="text-[10px] font-medium text-amber-200/90"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95)" }}
          >
            {isDay ? "☀ in sunlight" : "🌙 in darkness"}
          </div>
        </div>
      </Html>
    </group>
  );
}

// Interpolate a storm's position along its track at an arbitrary instant so a
// playhead can ride the path in sync with the time slider. Returns null when
// the requested time is outside the track's observed/forecast window.
function interpStormPos(
  track: StormTrack,
  at: Date
): { lat: number; lon: number; forecast: boolean } | null {
  const pts = track.points;
  if (pts.length === 0) return null;
  const t = at.getTime();
  const times = pts.map((p) => new Date(p.time).getTime());
  if (t <= times[0]) return null;
  if (t >= times[times.length - 1]) return null;
  for (let i = 1; i < pts.length; i++) {
    if (t <= times[i]) {
      const span = times[i] - times[i - 1] || 1;
      const f = (t - times[i - 1]) / span;
      // Shortest-path longitude interpolation across the antimeridian.
      let dLon = pts[i].lon - pts[i - 1].lon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      let lon = pts[i - 1].lon + dLon * f;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      return {
        lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f,
        lon,
        forecast: pts[i].forecast,
      };
    }
  }
  return null;
}

// Render storm tracks, uncertainty forecast cones & the active cyclone pin.
function StormVisuals({ stormTrack, at }: { stormTrack: StormTrack | null; at: Date }) {
  if (!stormTrack || stormTrack.points.length === 0) return null;

  // Split points into historical/observed track vs forecast track
  const obsPoints = stormTrack.points.filter((p) => !p.forecast);
  const fcPoints = stormTrack.points.filter((p) => p.forecast);

  const obsCoords = obsPoints.map((p) => {
    const v = latLonToVec3(p.lat, p.lon, R * 1.012);
    return [v.x, v.y, v.z] as [number, number, number];
  });

  const fcCoords = fcPoints.map((p) => {
    const v = latLonToVec3(p.lat, p.lon, R * 1.012);
    return [v.x, v.y, v.z] as [number, number, number];
  });

  // Re-join ending of observed into forecast for a seamless line
  const lastObs = obsPoints[obsPoints.length - 1];
  if (lastObs && fcCoords.length > 0) {
    const v = latLonToVec3(lastObs.lat, lastObs.lon, R * 1.012);
    fcCoords.unshift([v.x, v.y, v.z] as [number, number, number]);
  }

  const alertColorMap = {
    Red: "#ef4444",
    Orange: "#f59e0b",
    Green: "#10b981",
  };
  const color = alertColorMap[stormTrack.alert] || "#10b981";

  // Current live position coordinate
  const currentPos = stormTrack.current
    ? latLonToVec3(stormTrack.current.lat, stormTrack.current.lon, R * 1.015)
    : null;

  // Time-slider playhead riding the track.
  const playhead = interpStormPos(stormTrack, at);
  const playheadPos = playhead
    ? latLonToVec3(playhead.lat, playhead.lon, R * 1.016)
    : null;

  return (
    <group>
      {/* 1. Draw Observed path on Earth surface */}
      {obsCoords.length > 1 && (
        <Line points={obsCoords} color="#94a3b8" lineWidth={2} />
      )}

      {/* 2. Draw Forecast path on Earth surface */}
      {fcCoords.length > 1 && (
        <Line points={fcCoords} color={color} lineWidth={2} dashed dashSize={0.03} gapSize={0.015} />
      )}

      {/* 3. Draw dots representing chronological intervals */}
      {stormTrack.points.map((pt, i) => {
        const v = latLonToVec3(pt.lat, pt.lon, R * 1.013);
        const radius = pt.forecast ? 0.005 : 0.004;
        const ptColor = pt.forecast ? color : "#64748b";
        return (
          <mesh key={i} position={[v.x, v.y, v.z]}>
            <sphereGeometry args={[radius, 12, 12]} />
            <meshBasicMaterial color={ptColor} transparent opacity={0.8} />
          </mesh>
        );
      })}

      {/* 4. Active storm center pin with pulsing vortex ring & details panel */}
      {currentPos && (
        <group position={[currentPos.x, currentPos.y, currentPos.z]}>
          {/* Pulsing storm core */}
          <mesh>
            <sphereGeometry args={[0.012, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>

          {/* Core spinning/pulsing effect */}
          <StormRing color={color} />

          <Html center zIndexRange={[85, 65]}>
            <div className="pointer-events-none flex -translate-y-[135%] flex-col items-center">
              <div
                className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold leading-none shadow-xl border"
                style={{
                  background: "rgba(10,15,30,0.92)",
                  borderColor: color,
                  color: "#ffffff",
                  boxShadow: `0 0 18px ${color}bf`,
                }}
              >
                <span className="animate-spin duration-1000 inline-block text-[14px]">🌀</span>
                <span className="uppercase tracking-wider">{stormTrack.name}</span>
                <span className="text-slate-300 font-normal">|</span>
                <span className="text-amber-300">{stormTrack.maxWindKph} km/h</span>
              </div>
            </div>
          </Html>
        </group>
      )}

      {/* 5. Time-slider playhead riding the track in sync with the clock */}
      {playheadPos && (
        <group position={[playheadPos.x, playheadPos.y, playheadPos.z]}>
          <mesh>
            <sphereGeometry args={[0.009, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <StormRing color={playhead?.forecast ? color : "#e2e8f0"} />
          <Html center zIndexRange={[88, 68]}>
            <div className="pointer-events-none -translate-y-[150%]">
              <div
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none shadow-lg border"
                style={{
                  background: "rgba(10,15,30,0.92)",
                  borderColor: playhead?.forecast ? color : "#e2e8f0",
                  color: "#ffffff",
                }}
              >
                {playhead?.forecast ? "forecast" : "observed"}
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

// Inner helper component to add an animated pulse/spin to storm targets.
function StormRing({ color }: { color: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.getElapsedTime();
    const scale = 1.0 + Math.sin(t * 5.0) * 0.25;
    ringRef.current.scale.set(scale, scale, 1);
    ringRef.current.rotation.z = -t * 2.0;
  });
  return (
    <mesh ref={ringRef} rotation={[0, 0, 0]}>
      <ringGeometry args={[0.016, 0.024, 16]} />
      <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.65} />
    </mesh>
  );
}
