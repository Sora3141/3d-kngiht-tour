import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let N = 4, M = 4, L = 4;
let tiles = {}; 
let boxGroup, knightMesh;            
let visitedPath = [];      
let isGameOver = false;
let interactionTargets = []; 

const COLORS = { cyan: 0x00f0ff, magenta: 0xff00cc, bg: 0x020205, white: 0xffffff };

const MATERIALS = {
    invisible: new THREE.MeshBasicMaterial({ visible: false }),
    trail: new THREE.MeshPhysicalMaterial({ 
        color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 3.5, 
        transparent: true, opacity: 0.6, metalness: 0.5, roughness: 0.1
    }),
    hint: new THREE.MeshPhysicalMaterial({ 
        color: COLORS.magenta, emissive: COLORS.magenta, emissiveIntensity: 2.5, 
        transparent: true, opacity: 0.5, metalness: 0.5, roughness: 0.1
    }),
    lineDefault: new THREE.LineBasicMaterial({ 
        color: 0xdddddd, transparent: true, opacity: 0.5 
    }),
    lineActive: new THREE.LineBasicMaterial({ 
        color: COLORS.white, transparent: true, opacity: 1.0 
    }),
    collider: new THREE.MeshBasicMaterial({ visible: false })
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.bg);

// カメラの初期化（アスペクト比は init で設定）
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function createLevel() {
    if (boxGroup) scene.remove(boxGroup);
    boxGroup = new THREE.Group(); scene.add(boxGroup);
    tiles = {}; interactionTargets = []; visitedPath = []; isGameOver = false;

    const spacing = 1.0; 
    const tileGeom = new THREE.BoxGeometry(spacing, spacing, spacing);
    const edgeGeom = new THREE.EdgesGeometry(tileGeom);

    for (let x = 0; x < N; x++) {
        for (let y = 0; y < M; y++) {
            for (let z = 0; z < L; z++) {
                const mesh = new THREE.Mesh(tileGeom, MATERIALS.invisible);
                mesh.position.set(
                    (x-(N-1)/2)*spacing, 
                    (z-(L-1)/2)*spacing, 
                    -(y-(M-1)/2)*spacing
                ); 
                const frame = new THREE.LineSegments(edgeGeom, MATERIALS.lineDefault.clone());
                mesh.add(frame);
                const key = `${x}_${y}_${z}`;
                tiles[key] = { mesh, frame }; boxGroup.add(mesh);
                const collider = new THREE.Mesh(tileGeom, MATERIALS.collider);
                collider.position.copy(mesh.position); collider.userData = { x, y, z };
                boxGroup.add(collider); interactionTargets.push(collider);
            }
        }
    }
    createKnight(); render2DMap(); updateVisuals();
    const maxDim = Math.max(N, M, L);
    camera.position.set(maxDim*2, maxDim*1.5, maxDim*2);
    controls.update();
}

function render2DMap() {
    const container = document.getElementById('layer-maps');
    if (!container) return;
    container.innerHTML = '';
    
    let flexBasis = "45%";
    if (L > 4) flexBasis = "30%";
    if (L > 9) flexBasis = "23%";

    for (let z = L-1; z >= 0; z--) {
        const wrapper = document.createElement('div');
        wrapper.className = 'layer-grid-wrapper';
        wrapper.style.flexBasis = flexBasis;
        wrapper.innerHTML = `<div class="layer-label">Z-${z}</div>`;
        const grid = document.createElement('div');
        grid.className = 'grid-2d';
        grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
        for (let y = M-1; y >= 0; y--) {
            for (let x = 0; x < N; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell-2d'; cell.id = `map-${x}_${y}_${z}`;
                cell.onclick = () => handleMove(x, y, z);
                grid.appendChild(cell);
            }
        }
        wrapper.appendChild(grid); container.appendChild(wrapper);
    }
}

function handleMove(x, y, z) {
    if (isGameOver) return;
    const last = visitedPath[visitedPath.length - 1];
    if (!last || getPossibleMoves(last).some(m => m.x===x && m.y===y && m.z===z)) {
        if (!visitedPath.some(v => v.x===x && v.y===y && v.z===z)) {
            visitedPath.push({x,y,z}); updateVisuals();
        }
    }
}

function updateVisuals() {
    Object.keys(tiles).forEach(key => {
        tiles[key].mesh.material = MATERIALS.invisible;
        tiles[key].frame.material.color.set(MATERIALS.lineDefault.color);
        tiles[key].frame.material.opacity = MATERIALS.lineDefault.opacity;
        const cell = document.getElementById(`map-${key}`);
        if(cell) cell.className = 'cell-2d';
    });
    visitedPath.forEach((p, i) => {
        const key = `${p.x}_${p.y}_${p.z}`;
        const isLast = i === visitedPath.length - 1;
        tiles[key].mesh.material = MATERIALS.trail;
        tiles[key].frame.material.color.set(COLORS.white);
        tiles[key].frame.material.opacity = 1.0;
        const cell = document.getElementById(`map-${key}`);
        if(cell) cell.classList.add('visited');
        if (isLast) {
            knightMesh.position.copy(tiles[key].mesh.position);
            knightMesh.visible = true;
            if(cell) cell.classList.add('current');
            getPossibleMoves(p).filter(m => !visitedPath.some(v => v.x===m.x && v.y===m.y && v.z===m.z)).forEach(m => {
                const mKey = `${m.x}_${m.y}_${m.z}`;
                if(tiles[mKey]) {
                    tiles[mKey].mesh.material = MATERIALS.hint;
                    tiles[mKey].frame.material.opacity = 0.8;
                }
                const hCell = document.getElementById(`map-${mKey}`);
                if(hCell) hCell.classList.add('hint');
            });
            const total = N*M*L;
            document.getElementById('pos-info').innerText = `SYNC: ${Math.round((visitedPath.length/total)*100)}%`;
        }
    });
}

function getPossibleMoves(c) {
    const p = [[2,1,0],[2,-1,0],[-2,1,0],[-2,-1,0],[2,0,1],[2,0,-1],[-2,0,1],[-2,0,-1],[0,2,1],[0,2,-1],[0,-2,1],[0,-2,-1],[1,2,0],[1,-2,0],[-1,2,0],[-1,-2,0],[1,0,2],[1,0,-2],[-1,0,2],[-1,0,-2],[0,1,2],[0,1,-2],[0,-1,2],[0,-1,-2]];
    return p.map(m => ({x:c.x+m[0], y:c.y+m[1], z:c.z+m[2]}))
            .filter(m => m.x>=0 && m.x<N && m.y>=0 && m.y<M && m.z>=0 && m.z<L);
}

function createKnight() {
    if (knightMesh) scene.remove(knightMesh);
    knightMesh = new THREE.Group();
    knightMesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({color: 0xffffff})));
    scene.add(knightMesh); knightMesh.visible = false;
}

function init() {
    const canvasContainer = document.getElementById('canvas-container');
    
    // アスペクト比を計算してカメラとレンダラーに適用
    const updateSize = () => {
        const width = canvasContainer.clientWidth;
        const height = canvasContainer.clientHeight || window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasContainer.appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    
    updateSize(); // 初回のサイズ確定
    createLevel();

    ['inN','inM','inL'].forEach(id => {
        document.getElementById(id).oninput = (e) => {
            const val = parseInt(e.target.value);
            if(id==='inN') N = val; if(id==='inM') M = val; if(id==='inL') L = val;
            document.getElementById('val'+id.slice(2)).innerText = val;
            createLevel();
        };
    });

    document.getElementById('btnUndo').onclick = () => { visitedPath.pop(); isGameOver = false; updateVisuals(); };
    document.getElementById('btnApply').onclick = () => createLevel();
    
    window.addEventListener('resize', updateSize);

    function animate() { 
        requestAnimationFrame(animate); 
        controls.update(); 
        if (knightMesh && knightMesh.visible) {
            knightMesh.rotation.y += 0.05;
        }
        renderer.render(scene, camera); 
    }
    animate();
}
init();