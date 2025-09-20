// src/components/CarViewer2.jsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function CarViewer2() {
  const mountRef = useRef(null);
  const carRef = useRef(null);
  const controlsRef = useRef(null);
  const rendererRef = useRef(null);
  const [modelLight, setModelLight] = useState(null);

  const colorPrices = {
    original: 25000,
    red: 27000,
    green: 26000,
    blue: 28000,
    gray: 25500,
  };
  const [price, setPrice] = useState(colorPrices.original);

  // If you want to force a flat paint (remove textures) set to true.
  // Default false to keep texture detail if possible.
  const FORCE_FLAT_PAINT = false;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene / renderer / camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.domElement.style.touchAction = "none"; // prevent browser gesture conflicts
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(
      50,
      (mount.clientWidth || window.innerWidth) / (mount.clientHeight || window.innerHeight),
      0.01,
      10000
    );

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const carLight = new THREE.DirectionalLight(0xffffff, 2);
    carLight.position.set(0, 20, 10);
    carLight.castShadow = true;
    carLight.visible = false;
    scene.add(carLight);
    setModelLight(carLight);

    // Controls (enable zoom)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.0;
    controls.enablePan = true; // optional; set false if you don't want panning
    controlsRef.current = controls;

    // Prevent page scroll while wheel is over the canvas so OrbitControls receives wheel
    const onWheel = (e) => {
      // only prevent default if the pointer is over the canvas
      e.preventDefault();
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // GLTF loader
    const loader = new GLTFLoader();
    loader.load(
      "/nissan.glb",
      (gltf) => {
        const car = gltf.scene;
        carRef.current = car;

        // compute bounding box / center
        const box = new THREE.Box3().setFromObject(car);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // normalize position so model is centered on (0,0,0)
        car.position.x -= center.x;
        car.position.z -= center.z;
        car.position.y -= box.min.y; // put on ground = 0
        // do not arbitrarily scale; keep model's own scale unless needed

        // Robust paint-material detection:
        // - check material.name and mesh.name for paint/body keywords
        // - store paintable material indices per mesh and original colors
        const paintKeywords = ["body", "paint", "car", "panel", "painted", "outer", "base", "coat"];
        let totalPaintMaterialsFound = 0;
        const materialNameLog = [];

        car.traverse((child) => {
          if (!child.isMesh || !child.material) return;

          const meshName = (child.name || "").toLowerCase();
          const mats = Array.isArray(child.material) ? child.material : [child.material];

          child.userData.paintIndices = [];
          child.userData.originalColors = mats.map((m) => (m && m.color ? m.color.clone() : null));
          child.userData.originalMaps = mats.map((m) => (m && m.map ? m.map : null));

          mats.forEach((m, idx) => {
            const matName = (m && m.name) ? m.name.toLowerCase() : "";
            materialNameLog.push({ mesh: meshName || "<noname-mesh>", material: matName || "<noname-mat>", hasColor: !!(m && m.color), hasMap: !!(m && m.map) });

            const hasColorProp = !!(m && "color" in m);
            const likelyPaint = hasColorProp && (
              paintKeywords.some((kw) => matName.includes(kw)) ||
              paintKeywords.some((kw) => meshName.includes(kw))
            );

            // fallback heuristic: if material has a color prop and material name is absent,
            // and mesh name looks like 'body' or 'outer' or the mesh has multiple vertices, mark it.
            if (likelyPaint) {
              child.userData.paintIndices.push(idx);
              totalPaintMaterialsFound++;
            }
          });

          // Also set reasonable shadow flags
          child.castShadow = true;
          child.receiveShadow = true;
        });

        // Fallback: if nothing matched, try a weaker heuristic (materials with color and not glass/tyre in mesh name)
        if (totalPaintMaterialsFound === 0) {
          console.warn("[CarViewer2] No paint materials found using keyword heuristics. Falling back to weaker heuristic. Material names list (for debugging):", materialNameLog);
          car.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const meshName = (child.name || "").toLowerCase();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m, idx) => {
              const matName = (m && m.name) ? m.name.toLowerCase() : "";
              const hasColorProp = !!(m && "color" in m);
              // exclude obvious non-paint names
              if (hasColorProp && !/glass|window|windshield|tyre|tire|wheel|rim|lamp|head|light|mirror|chrome|metal/i.test(meshName + matName)) {
                const existing = child.userData.paintIndices || [];
                if (!existing.includes(idx)) {
                  existing.push(idx);
                  child.userData.paintIndices = existing;
                  totalPaintMaterialsFound++;
                }
              }
            });
          });
        }

        if (totalPaintMaterialsFound === 0) {
          console.warn("[CarViewer2] Still no paintable materials detected. See console material list above — I can add a logger UI or force flat paint if you want that.");
        } else {
          console.log(`[CarViewer2] Paintable material indices found: ${totalPaintMaterialsFound}`);
        }

        scene.add(car);

        // Camera placement: use bounding box to compute a good camera z distance
        const maxDim = Math.max(size.x, size.y, size.z);
        // compute a camera Z that fits object into view using fov
        const fov = (camera.fov * Math.PI) / 180;
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.4; // a little back so the model isn't tight to edges

        // place camera above center with good angle
        camera.position.set(0, Math.max(size.y * 0.6, maxDim * 0.4), cameraZ);
        controls.target.set(0, size.y / 2, 0);

        // allow zooming much closer / far based on model size
        controls.minDistance = Math.max(maxDim * 0.08, 0.2);
        controls.maxDistance = Math.max(maxDim * 12, cameraZ * 4);
        controls.update();

        // ensure price corresponds to default/original
        setPrice(colorPrices.original ?? colorPrices.original);

        // debug: expose some objects if needed
        // window.__loadedCar = car;
      },
      (xhr) => {
        // optional progress
        // console.log(`Loading: ${(xhr.loaded / xhr.total) * 100}%`);
      },
      (err) => {
        console.error("Error loading car:", err);
      }
    );

    // animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // handle resize
    const onWindowResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onWindowResize);

    // cleanup
    return () => {
      try {
        renderer.domElement.removeEventListener("wheel", onWheel);
      } catch {}
      window.removeEventListener("resize", onWindowResize);
      controls.dispose();
      renderer.dispose();
      // remove dom element
      try {
        mount.removeChild(renderer.domElement);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to set paint color only on detected material indices
  const setPaintColorOnMesh = (child, hex) => {
    if (!child || !child.material || !child.userData) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];

    const indices = child.userData.paintIndices || [];
    if (indices.length === 0) return;

    indices.forEach((idx) => {
      const m = mats[idx];
      if (!m) return;
      if (m && "color" in m) {
        m.color.set(hex);
      }
      if (FORCE_FLAT_PAINT && m) {
        // remove texture map to force flat color (optional)
        if (m.map) {
          m.map = null;
        }
      }
      if (m) m.needsUpdate = true;
    });
  };

  const changeColor = (hex, colorKey) => {
    if (!carRef.current) return;
    carRef.current.traverse((child) => {
      if (child.isMesh && child.userData && child.userData.paintIndices && child.userData.paintIndices.length > 0) {
        setPaintColorOnMesh(child, hex);
      }
    });
    setPrice(colorPrices[colorKey] ?? colorPrices.original);
  };

  const resetOriginalColor = () => {
    if (!carRef.current) return;
    carRef.current.traverse((child) => {
      if (child.isMesh && child.userData && child.userData.originalColors) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        child.userData.originalColors.forEach((origColor, idx) => {
          if (!origColor) return;
          const m = mats[idx];
          if (m && "color" in m) {
            m.color.copy(origColor);
            m.needsUpdate = true;
          }
        });
        // restore original maps if we removed them earlier
        if (FORCE_FLAT_PAINT && child.userData.originalMaps) {
          child.userData.originalMaps.forEach((origMap, idx) => {
            const m = mats[idx];
            if (m) {
              m.map = origMap || null;
              m.needsUpdate = true;
            }
          });
        }
      }
    });
    setPrice(colorPrices.original);
  };

  const toggleLight = () => {
    if (modelLight) modelLight.visible = !modelLight.visible;
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Controls */}
      <div style={{ position: "absolute", top: 68, left: 18, display: "flex", flexDirection: "column", gap: 10, zIndex: 2000 }}>
        <button onClick={resetOriginalColor}>Original</button>
        <button onClick={() => changeColor(0x7f0000, "red")}>Red</button>
        <button onClick={() => changeColor(0x005300, "green")}>Green</button>
        <button onClick={() => changeColor(0x000082, "blue")}>Blue</button>
        <button onClick={() => changeColor(0x666666, "gray")}>Gray</button>
      </div>

      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 2000 }}>
        <button onClick={toggleLight}>{modelLight && modelLight.visible ? "Turn Light Off" : "Turn Light On"}</button>
      </div>

      {/* Price at top center */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 14px",
          background: "rgba(255,255,255,0.95)",
          color: "#000",
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 700,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          zIndex: 3000,
          pointerEvents: "none",
        }}
      >
        Price: ${price.toLocaleString()}
      </div>
    </div>
  );
}

export default CarViewer2;
