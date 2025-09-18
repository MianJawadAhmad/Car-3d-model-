import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function App() {
  const mountRef = useRef(null);
  const carRef = useRef(null); // store loaded car
  const [modelLight, setModelLight] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      3000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const carLight = new THREE.DirectionalLight(0xffffff, 2);
    carLight.position.set(0, 20, 10);
    carLight.castShadow = true;
    carLight.visible = false; // start OFF
    scene.add(carLight);
    setModelLight(carLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x999999 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 5;
    controls.maxDistance = 1500;
    controls.minPolarAngle = Math.PI / 20;
    controls.maxPolarAngle = Math.PI / 1.05;

    const loader = new GLTFLoader();
    loader.load(
      "/car.glb",
      (gltf) => {
        const car = gltf.scene;
        carRef.current = car; // store reference to the loaded car

        const box = new THREE.Box3().setFromObject(car);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        car.position.x -= center.x;
        car.position.z -= center.z;
        car.position.y -= box.min.y;

        car.scale.set(2, 2, 2);

        car.traverse((child) => {
          if (child.isMesh) {
            if (
              child.material.name.toLowerCase().includes("body") ||
              child.material.name.toLowerCase().includes("paint")
            ) {
              child.userData.originalColor = child.material.color.clone(); // save original color
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(car);

        // Camera
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(0, maxDim * 15, maxDim * 15);
        controls.target.set(0, size.y / 2, 0);
        controls.update();
        camera.lookAt(0, size.y / 2, 0);
      },
      (xhr) => console.log(`Loading: ${(xhr.loaded / xhr.total) * 100}%`),
      (err) => console.error("Error loading car:", err)
    );

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const changeColor = (hex) => {
    if (!carRef.current) return;
    carRef.current.traverse((child) => {
      if (child.isMesh && child.userData.originalColor) {
        child.material.color.set(hex);
      }
    });
  };

  const resetOriginalColor = () => {
    if (!carRef.current) return;
    carRef.current.traverse((child) => {
      if (child.isMesh && child.userData.originalColor) {
        child.material.color.copy(child.userData.originalColor);
      }
    });
  };

  const toggleLight = () => {
    if (modelLight) modelLight.visible = !modelLight.visible;
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Left color buttons */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <button onClick={resetOriginalColor}>Original</button>
        <button onClick={() => changeColor(0x7F0000)}>Red</button>
        <button onClick={() => changeColor(0x005300)}>Green</button>
        <button onClick={() => changeColor(0x000082)}>Blue</button>
        <button onClick={() => changeColor(0x666666)}>Gray</button>
      </div>

      {/* Right light button */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
        }}
      >
        <button onClick={toggleLight}>
          {modelLight && modelLight.visible ? "Turn Light Off" : "Turn Light On"}
        </button>
      </div>
    </div>
  );
}

export default App;
