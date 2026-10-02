import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

let model;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 10;
camera.position.y = 2;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
scene.add(ambientLight);

//Cargamos los dos plugins para obj y mtl
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
//incorporamos los materiales
const materials = await mtlLoader.loadAsync( 'public/rubik.mtl' );
//Los materiales se incorporan al loader del obj
objLoader.setMaterials( materials );
//DESPUES se carga el obj en la variable del proyecto, ahora con materiales
model = await objLoader.loadAsync( 'public/rubik.obj' );
//El objeto se añade a la escena
scene.add( model );

function animate(time) {
    requestAnimationFrame(animate);

    if (model) {
        // Rotate ONLY the model, not the whole scene
        model.rotation.y += 0.00005;
        model.rotation.x += 0.00005;
    }

    renderer.render(scene, camera);
}

animate();