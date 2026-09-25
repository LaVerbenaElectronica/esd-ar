import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let model;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;
camera.position.y = 2;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
scene.add(ambientLight);

const loader = new GLTFLoader();
loader.load('public/taza.glb', function (gltf) {

    model = gltf.scene;
    model.position.set(1, 1, 0);
    model.scale.set(1, 1, 1);
    scene.add(model);

}, undefined, function (error) {
    console.error(error);
});



function animate(time) {
    requestAnimationFrame(animate);

    if (model) {
        // Rotate ONLY the model, not the whole scene
        model.rotation.y += 0.0001;
        //model.rotation.x += 0.005;
    }

    renderer.render(scene, camera);
}

animate();