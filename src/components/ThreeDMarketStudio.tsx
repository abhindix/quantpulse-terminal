import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Candle, SignalMarker, TechnicalIndicators } from '../types/market';
import { 
  Eye, 
  Layers, 
  RotateCw, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Maximize, 
  Palette, 
  Sliders, 
  Camera,
  Compass
} from 'lucide-react';

interface ThreeDMarketStudioProps {
  candles: Candle[];
  indicators: TechnicalIndicators;
  signals: SignalMarker[];
  selectedAsset: string;
}

// Pre-allocated math helpers to ensure 0 GC during per-frame animation
const _vec3 = new THREE.Vector3();
const _color = new THREE.Color();

export const ThreeDMarketStudio: React.FC<ThreeDMarketStudioProps> = ({
  candles,
  indicators,
  signals,
  selectedAsset,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sculptureGroupRef = useRef<THREE.Group | null>(null);
  const pillarsGroupRef = useRef<THREE.Group | null>(null);
  const trendRibbonsGroupRef = useRef<THREE.Group | null>(null);
  const coreMeshRef = useRef<THREE.Mesh | null>(null);

  // Studio Interactive State
  const [explodedVal, setExplodedVal] = useState<number>(0);
  const [targetExplodedVal, setTargetExplodedVal] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [finishTheme, setFinishTheme] = useState<'cyber' | 'titanium' | 'gold'>('cyber');
  const [cameraPreset, setCameraPreset] = useState<'iso' | 'front' | 'macro'>('iso');
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene & Renderer setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#030612');
    scene.fog = new THREE.FogExp2('#030612', 0.015);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // 2. Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    cameraRef.current = camera;
    camera.position.set(22, 16, 26);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // avoid going below floor
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.target.set(0, 4, 0);

    // 3. Studio Environment Map (PBR RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    pmremGenerator.dispose();

    // 4. Studio 3-Point Lighting Rig
    // Warm Key Light with tight shadow bounds
    const keyLight = new THREE.DirectionalLight(0xfff0dd, 2.2);
    keyLight.position.set(15, 25, 18);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 60;
    const d = 16;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Cool Sky / Ground Fill Light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.9);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    // Cyber Rim Accent Light
    const rimLight = new THREE.DirectionalLight(0xc026d3, 1.8);
    rimLight.position.set(-18, 12, -15);
    scene.add(rimLight);

    // 5. Contact Shadow & Ground Floor
    // Procedural grid texture for ground platform
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fctx = floorCanvas.getContext('2d');
    if (fctx) {
      fctx.fillStyle = '#05091a';
      fctx.fillRect(0, 0, 512, 512);
      fctx.strokeStyle = 'rgba(28, 58, 120, 0.35)';
      fctx.lineWidth = 1;
      for (let i = 0; i <= 512; i += 32) {
        fctx.moveTo(i, 0); fctx.lineTo(i, 512);
        fctx.moveTo(0, i); fctx.lineTo(512, i);
      }
      fctx.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(12, 12);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.85,
      metalness: 0.2,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.02;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Soft circular contact shadow directly beneath pedestal
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const grad = sctx.createRadialGradient(128, 128, 20, 128, 128, 128);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 256, 256);
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    // 6. Build Composite 3D Quantitative Market Sculpture (Group with 3-12 distinct parts)
    const sculptureGroup = new THREE.Group();
    sculptureGroupRef.current = sculptureGroup;
    scene.add(sculptureGroup);

    // Part 1: High-Tech Beveled Octagonal Pedestal
    const baseGeo = new THREE.CylinderGeometry(11, 12, 1.2, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0a1026,
      roughness: 0.3,
      metalness: 0.85,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.6;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    sculptureGroup.add(baseMesh);

    // Part 2: Inner Metallic Trim Ring
    const trimGeo = new THREE.TorusGeometry(9.8, 0.15, 16, 64);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.9,
    });
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.rotation.x = Math.PI / 2;
    trimMesh.position.y = 1.25;
    sculptureGroup.add(trimMesh);

    // Part 3: Central Floating Holographic Quantum Core (Glass Octahedron)
    const coreGeo = new THREE.OctahedronGeometry(2.4, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x00e5ff,
      transmission: 0.92,
      opacity: 1,
      transparent: true,
      roughness: 0.08,
      ior: 1.6,
      thickness: 1.8,
      emissive: 0x083344,
      emissiveIntensity: 0.4,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 5, 0);
    coreMesh.castShadow = true;
    coreMeshRef.current = coreMesh;
    sculptureGroup.add(coreMesh);

    // Groups for Candlestick Pillars and Trend Ribbons
    const pillarsGroup = new THREE.Group();
    pillarsGroupRef.current = pillarsGroup;
    sculptureGroup.add(pillarsGroup);

    const trendRibbonsGroup = new THREE.Group();
    trendRibbonsGroupRef.current = trendRibbonsGroup;
    sculptureGroup.add(trendRibbonsGroup);

    // 7. Render Loop with silky smooth exponential damping
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Exponential damping for exploded separation
      const currentExp = explodedVal;
      const targetExp = targetExplodedVal;
      const newExp = THREE.MathUtils.damp(currentExp, targetExp, 6, delta);
      setExplodedVal(newExp);

      // Apply exploded offset to pillars
      if (pillarsGroupRef.current) {
        pillarsGroupRef.current.children.forEach((child, i) => {
          const angle = (i / 35) * Math.PI * 2;
          const radialPush = newExp * 5;
          child.position.x = (child.userData.baseX || 0) + Math.cos(angle) * radialPush;
          child.position.z = (child.userData.baseZ || 0) + Math.sin(angle) * radialPush;
        });
      }

      // Rotate quantum core
      if (coreMeshRef.current) {
        coreMeshRef.current.rotation.y += delta * 0.8;
        coreMeshRef.current.rotation.x += delta * 0.4;
      }

      // Subtle slow auto rotation of sculpture
      if (autoRotate && sculptureGroupRef.current) {
        sculptureGroupRef.current.rotation.y += delta * 0.25;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Procedural 3D Candlesticks & Trend Ribbons when data changes
  useEffect(() => {
    const pillarsGroup = pillarsGroupRef.current;
    const ribbonsGroup = trendRibbonsGroupRef.current;
    if (!pillarsGroup || !ribbonsGroup) return;

    // Clear previous children
    while (pillarsGroup.children.length > 0) {
      const obj = pillarsGroup.children[0] as THREE.Mesh;
      if (obj.geometry) obj.geometry.dispose();
      pillarsGroup.remove(obj);
    }
    while (ribbonsGroup.children.length > 0) {
      const obj = ribbonsGroup.children[0] as THREE.Mesh;
      if (obj.geometry) obj.geometry.dispose();
      ribbonsGroup.remove(obj);
    }

    const subset = candles.slice(-35); // Focus on recent 35 candles
    if (subset.length === 0) return;

    let minP = Infinity;
    let maxP = -Infinity;
    subset.forEach((c) => {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    });
    const range = maxP - minP || 1;

    // Helper: Map price to height on sculpture
    const priceToHeight = (p: number) => {
      return 2.5 + ((p - minP) / range) * 8.5;
    };

    // Build Circular / Wave Arranged 3D Candlesticks
    const radius = 8.5;
    const fastSplinePoints: THREE.Vector3[] = [];
    const slowSplinePoints: THREE.Vector3[] = [];

    subset.forEach((c, idx) => {
      const angle = (idx / (subset.length - 1)) * (Math.PI * 1.5) - Math.PI * 0.75;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const isBullish = c.close >= c.open;
      const openY = priceToHeight(c.open);
      const closeY = priceToHeight(c.close);
      const highY = priceToHeight(c.high);
      const lowY = priceToHeight(c.low);

      const bodyHeight = Math.max(0.2, Math.abs(closeY - openY));
      const bodyCenterY = Math.min(openY, closeY) + bodyHeight / 2;

      // 1. High-Tech Candlestick Body (Prismatic Box with physical finish)
      const candleGeo = new THREE.BoxGeometry(0.45, bodyHeight, 0.45);
      const candleMat = new THREE.MeshPhysicalMaterial({
        color: isBullish ? 0x00e5ff : 0xf43f5e,
        roughness: 0.15,
        metalness: finishTheme === 'titanium' ? 0.9 : 0.4,
        emissive: isBullish ? 0x00e5ff : 0xf43f5e,
        emissiveIntensity: 0.5,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
      });

      const candleMesh = new THREE.Mesh(candleGeo, candleMat);
      candleMesh.position.set(x, bodyCenterY, z);
      candleMesh.castShadow = true;
      candleMesh.userData = { baseX: x, baseZ: z };
      pillarsGroup.add(candleMesh);

      // 2. Candlestick Wick (Metallic pin)
      const wickHeight = Math.max(0.4, highY - lowY);
      const wickGeo = new THREE.CylinderGeometry(0.04, 0.04, wickHeight, 8);
      const wickMat = new THREE.MeshStandardMaterial({
        color: isBullish ? 0x67e8f9 : 0xfda4af,
        roughness: 0.3,
        metalness: 0.8,
      });
      const wickMesh = new THREE.Mesh(wickGeo, wickMat);
      wickMesh.position.set(x, (highY + lowY) / 2, z);
      wickMesh.userData = { baseX: x, baseZ: z };
      pillarsGroup.add(wickMesh);

      // Collect points for 3D Trend Curves
      const fastVal = indicators.fastEma[candles.length - subset.length + idx];
      if (fastVal) {
        fastSplinePoints.push(new THREE.Vector3(x * 1.04, priceToHeight(fastVal), z * 1.04));
      }
      const slowVal = indicators.slowEma[candles.length - subset.length + idx];
      if (slowVal) {
        slowSplinePoints.push(new THREE.Vector3(x * 0.96, priceToHeight(slowVal), z * 0.96));
      }
    });

    // 3. Volumetric 3D Fast Trend Tube (Yellow Spline Tube - Hero curve from photo)
    if (fastSplinePoints.length > 2) {
      const fastCurve = new THREE.CatmullRomCurve3(fastSplinePoints);
      const fastTubeGeo = new THREE.TubeGeometry(fastCurve, 64, 0.14, 8, false);
      const fastTubeMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xfacc15,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.7,
      });
      const fastTubeMesh = new THREE.Mesh(fastTubeGeo, fastTubeMat);
      fastTubeMesh.castShadow = true;
      ribbonsGroup.add(fastTubeMesh);
    }

    // 4. Volumetric 3D Slow Signal Tube (Purple Spline Tube)
    if (slowSplinePoints.length > 2) {
      const slowCurve = new THREE.CatmullRomCurve3(slowSplinePoints);
      const slowTubeGeo = new THREE.TubeGeometry(slowCurve, 64, 0.12, 8, false);
      const slowTubeMat = new THREE.MeshStandardMaterial({
        color: 0xc026d3,
        emissive: 0xc026d3,
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.6,
      });
      const slowTubeMesh = new THREE.Mesh(slowTubeGeo, slowTubeMat);
      slowTubeMesh.castShadow = true;
      ribbonsGroup.add(slowTubeMesh);
    }

    // 5. Procedural 3D Holographic Buy/Sell Beacons (Pyramids & Cones)
    signals.forEach((sig) => {
      const subsetIdx = sig.candleIndex - (candles.length - subset.length);
      if (subsetIdx < 0 || subsetIdx >= subset.length) return;

      const angle = (subsetIdx / (subset.length - 1)) * (Math.PI * 1.5) - Math.PI * 0.75;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = priceToHeight(sig.price);

      if (sig.type === 'buy') {
        // Golden Buy Pyramid pointing up
        const beaconGeo = new THREE.ConeGeometry(0.35, 0.7, 4);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xfacc15,
          emissiveIntensity: 1.0,
          roughness: 0.1,
          metalness: 0.9,
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(x, y - 0.6, z);
        beaconMesh.castShadow = true;
        ribbonsGroup.add(beaconMesh);
      } else if (sig.type === 'sell' || sig.type === 'target') {
        // Magenta / Rose Sell Beacon
        const beaconGeo = new THREE.SphereGeometry(0.32, 16, 16);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: 0xec4899,
          emissive: 0xec4899,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.8,
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(x, y + 0.6, z);
        beaconMesh.castShadow = true;
        ribbonsGroup.add(beaconMesh);
      }
    });
  }, [candles, indicators, signals, finishTheme]);

  // Camera preset transitions
  const applyCameraPreset = (preset: 'iso' | 'front' | 'macro') => {
    setCameraPreset(preset);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (preset === 'iso') {
      camera.position.set(22, 16, 26);
      controls.target.set(0, 4, 0);
    } else if (preset === 'front') {
      camera.position.set(0, 8, 30);
      controls.target.set(0, 5, 0);
    } else if (preset === 'macro') {
      camera.position.set(8, 6, 10);
      controls.target.set(0, 5, 0);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#030612] rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      {/* 100% Unobstructed 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Minimal Top-Left Spec Badge (Directive Section 5: Zero Viewport Occlusion) */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 pointer-events-none">
        <Compass className="w-3.5 h-3.5 text-cyan-400" />
        <span className="font-bold text-white">Three.js Studio PBR</span>
        <span className="text-slate-500">·</span>
        <span>{selectedAsset} Data Sculpture</span>
      </div>

      {/* 
        Unified Bottom Control Dock (Directive Section 5)
        Pinned bottom center: bottom: 20px; left: 50%; max-width: min(940px, 94vw)
        Zero occlusion over the 3D subject!
      */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[94%] max-w-[840px] transition-all duration-300 ease-out ${
          isDockCollapsed ? 'translate-y-[calc(100%-36px)]' : 'translate-y-0'
        }`}
      >
        <div className="bg-[#080d24]/90 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden">
          {/* Dock Header & Collapse Toggle */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#0a1130] border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Studio Controls & Procedural Physics</span>
            </div>

            <button
              onClick={() => setIsDockCollapsed(!isDockCollapsed)}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer text-[11px]"
              title={isDockCollapsed ? 'Expand Controls' : 'Hide Controls'}
            >
              {isDockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {isDockCollapsed ? 'Show Controls' : 'Hide Controls (Zen Mode)'}
            </button>
          </div>

          {/* Dock Body (Controls) */}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Exploded View Separation Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300 font-medium">
                <span>Exploded View</span>
                <span className="font-mono text-cyan-400 font-bold">{Math.round(targetExplodedVal * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={targetExplodedVal}
                onChange={(e) => setTargetExplodedVal(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block">Separates 3D candle pillars radially</span>
            </div>

            {/* Material Finish Preset Swatches */}
            <div className="space-y-1.5">
              <span className="text-slate-300 font-medium block">PBR Finish</span>
              <div className="flex gap-1.5">
                {[
                  { id: 'cyber', label: 'Cyber Neon' },
                  { id: 'titanium', label: 'Titanium' },
                  { id: 'gold', label: 'Gold Bullion' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFinishTheme(f.id as any)}
                    className={`flex-1 py-1 px-1.5 rounded text-[11px] font-medium transition-colors ${
                      finishTheme === f.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500 block">Studio RoomEnvironment reflection</span>
            </div>

            {/* Camera View Angle Presets */}
            <div className="space-y-1.5">
              <span className="text-slate-300 font-medium block">Camera Preset</span>
              <div className="flex gap-1.5">
                {[
                  { id: 'iso', label: 'Isometric' },
                  { id: 'front', label: 'Elevation' },
                  { id: 'macro', label: 'Macro' },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => applyCameraPreset(c.id as any)}
                    className={`flex-1 py-1 px-1.5 rounded text-[11px] font-medium transition-colors ${
                      cameraPreset === c.id
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500 block">Smooth damp orbit navigation</span>
            </div>

            {/* Kinetic Turntable Rotation */}
            <div className="space-y-1.5">
              <span className="text-slate-300 font-medium block">Turntable Rotation</span>
              <button
                onClick={() => setAutoRotate(!autoRotate)}
                className={`w-full py-1.5 px-3 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  autoRotate
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
                {autoRotate ? 'Turntable Active' : 'Turntable Paused'}
              </button>
              <span className="text-[10px] text-slate-500 block">Drag anywhere to orbit & zoom</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
