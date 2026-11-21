import * as THREE from 'three';

export interface ObstacleCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  isCover: boolean;
}

export const ISLAND_RADIUS = 165;
export const OCEAN_LIMIT = 210;

/**
 * Deterministic heightfield function for the Battle Royale island.
 * Returns Y elevation in meters for any (x, z) coordinate.
 */
export function groundHeightAt(x: number, z: number): number {
  const dist = Math.sqrt(x * x + z * z);

  // Smooth island falloff into surrounding ocean
  const islandMask = THREE.MathUtils.smoothstep(ISLAND_RADIUS - dist, -12, 34);
  if (islandMask <= 0.001) {
    return -2.4;
  }

  // Rolling hills & ridges via layered trigonometric waves
  const n1 = Math.sin(x * 0.028) * Math.cos(z * 0.025) * 4.5;
  const n2 = Math.sin(x * 0.065 + 1.4) * Math.sin(z * 0.058 + 0.7) * 1.8;
  const n3 = Math.cos((x + z) * 0.035) * 1.4;

  // Flatten central airbase plateau around (0, 0)
  const airbaseDist = Math.sqrt(x * x + z * z);
  const airbaseFlatten = THREE.MathUtils.smoothstep(airbaseDist, 18, 42);

  // Slight elevation ridge on northwest and northeast sectors
  const nwHill = Math.exp(-((x + 85) ** 2 + (z + 65) ** 2) / 1800) * 8.5;
  const neHill = Math.exp(-((x - 92) ** 2 + (z + 78) ** 2) / 1500) * 7.2;

  const rawHeight = 1.6 + (n1 + n2 + n3) * airbaseFlatten + nwHill + neHill;
  return THREE.MathUtils.lerp(-2.4, rawHeight, islandMask);
}

/**
 * Builds procedural canvas textures for terrain and concrete structures.
 */
export function createTerrainTextures(maxAnisotropy: number) {
  // Island terrain albedo texture
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3f5a36';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 3.5;
    const shade = Math.random();
    if (shade < 0.35) ctx.fillStyle = 'rgba(42, 66, 36, 0.35)';
    else if (shade < 0.7) ctx.fillStyle = 'rgba(84, 110, 58, 0.3)';
    else ctx.fillStyle = 'rgba(116, 108, 72, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const grassTex = new THREE.CanvasTexture(canvas);
  grassTex.wrapS = THREE.RepeatWrapping;
  grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(24, 24);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.anisotropy = maxAnisotropy;

  // Concrete / tarmac texture
  const concCanvas = document.createElement('canvas');
  concCanvas.width = 256;
  concCanvas.height = 256;
  const cctx = concCanvas.getContext('2d')!;
  cctx.fillStyle = '#474e59';
  cctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    cctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
    cctx.fillRect(x, y, 2, 2);
  }
  cctx.strokeStyle = 'rgba(25, 30, 38, 0.35)';
  cctx.lineWidth = 2;
  cctx.strokeRect(1, 1, 254, 254);

  const concreteTex = new THREE.CanvasTexture(concCanvas);
  concreteTex.wrapS = THREE.RepeatWrapping;
  concreteTex.wrapT = THREE.RepeatWrapping;
  concreteTex.repeat.set(4, 4);
  concreteTex.colorSpace = THREE.SRGBColorSpace;
  concreteTex.anisotropy = maxAnisotropy;

  return { grassTex, concreteTex };
}

/**
 * Generates the island terrain mesh with vertex colors (sand beaches, lush grass, rocky peaks),
 * surrounding ocean, and compound buildings + instanced trees/rocks.
 */
export function buildIslandEnvironment(
  scene: THREE.Scene,
  maxAnisotropy: number,
  enableShadows: boolean,
): {
  colliders: ObstacleCollider[];
  disposables: Array<{ dispose: () => void }>;
  oceanMesh: THREE.Mesh;
} {
  const colliders: ObstacleCollider[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const { grassTex, concreteTex } = createTerrainTextures(maxAnisotropy);
  disposables.push(grassTex, concreteTex);

  // 1. Undulating Island Terrain Mesh
  const terrainSize = 440;
  const segments = 128;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cSand = new THREE.Color('#c8b082');
  const cGrass = new THREE.Color('#4a6939');
  const cHighGrass = new THREE.Color('#5a7842');
  const cRock = new THREE.Color('#66676b');
  const cTarmac = new THREE.Color('#4e545e');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const dist = Math.sqrt(x * x + z * z);
    if (dist < 24) {
      tmpColor.copy(cTarmac);
    } else if (y < 0.75) {
      tmpColor.copy(cSand);
    } else if (y < 4.5) {
      tmpColor.copy(cGrass).lerp(cHighGrass, (y - 0.75) / 3.75);
    } else {
      tmpColor.copy(cHighGrass).lerp(cRock, Math.min(1, (y - 4.5) / 5.5));
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = enableShadows;
  scene.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 2. Surrounding Tropical Ocean Plane
  const oceanGeo = new THREE.PlaneGeometry(1100, 1100, 32, 32);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: '#0e6685',
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.92,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = -0.35;
  oceanMesh.receiveShadow = false;
  scene.add(oceanMesh);
  disposables.push(oceanGeo, oceanMat);

  // 3. Compound Structures & Tactical Cover
  const concreteMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    color: '#8f96a3',
    roughness: 0.85,
    metalness: 0.05,
  });
  const metalOrangeMat = new THREE.MeshStandardMaterial({
    color: '#c2571a',
    roughness: 0.45,
    metalness: 0.55,
  });
  const metalTealMat = new THREE.MeshStandardMaterial({
    color: '#1b6478',
    roughness: 0.42,
    metalness: 0.58,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: '#7c5836',
    roughness: 0.88,
    metalness: 0.02,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: '#343b46',
    roughness: 0.6,
    metalness: 0.35,
  });
  disposables.push(concreteMat, metalOrangeMat, metalTealMat, woodMat, roofMat);

  const addBoxStructure = (
    id: string,
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    isCover = true,
  ) => {
    const gy = groundHeightAt(x, z);
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, gy + h / 2 - 0.15, z);
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = enableShadows;
    scene.add(mesh);
    disposables.push(geo);

    colliders.push({
      id,
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      maxY: gy + h,
      isCover,
    });
    return mesh;
  };

  // Central Airbase Hangars & Helipad
  const helipadGeo = new THREE.CylinderGeometry(9.5, 10, 0.25, 24);
  const helipad = new THREE.Mesh(helipadGeo, concreteMat);
  helipad.position.set(0, groundHeightAt(0, 0) + 0.06, 0);
  helipad.receiveShadow = enableShadows;
  scene.add(helipad);
  disposables.push(helipadGeo);

  // Helipad H marking (offset +0.02 on Y to prevent Z-fighting)
  const hBarGeo = new THREE.BoxGeometry(4.5, 0.04, 1.1);
  const hMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.65 });
  const hLeft = new THREE.Mesh(hBarGeo, hMat);
  hLeft.position.set(-2.1, groundHeightAt(0, 0) + 0.21, 0);
  hLeft.rotation.y = Math.PI / 2;
  const hRight = new THREE.Mesh(hBarGeo, hMat);
  hRight.position.set(2.1, groundHeightAt(0, 0) + 0.21, 0);
  hRight.rotation.y = Math.PI / 2;
  const hMid = new THREE.Mesh(hBarGeo, hMat);
  hMid.position.set(0, groundHeightAt(0, 0) + 0.21, 0);
  scene.add(hLeft, hRight, hMid);
  disposables.push(hBarGeo, hMat);

  // Airbase Hangars & Watchtowers
  const compounds = [
    // Central Airbase buildings
    { id: 'hangar_n', x: -16, z: -20, w: 12, h: 6.2, d: 8, mat: concreteMat },
    { id: 'hangar_e', x: 20, z: -14, w: 9, h: 5.5, d: 13, mat: concreteMat },
    { id: 'crate_c1', x: -9, z: 10, w: 3.4, h: 2.6, d: 7.2, mat: metalOrangeMat },
    { id: 'crate_c2', x: 11, z: 14, w: 7.2, h: 2.6, d: 3.4, mat: metalTealMat },
    { id: 'tower_c', x: -24, z: 18, w: 4.5, h: 9.5, d: 4.5, mat: roofMat },

    // Harbor Dock (South-East)
    { id: 'harbor_wh1', x: 74, z: 92, w: 11, h: 5.2, d: 8, mat: concreteMat },
    { id: 'harbor_c1', x: 85, z: 102, w: 3.2, h: 2.6, d: 6.8, mat: metalOrangeMat },
    { id: 'harbor_c2', x: 64, z: 103, w: 6.8, h: 2.6, d: 3.2, mat: metalTealMat },

    // Radar Outpost (North-East)
    { id: 'radar_bunker', x: 92, z: -78, w: 10, h: 4.8, d: 10, mat: concreteMat },
    { id: 'radar_cover', x: 79, z: -72, w: 4, h: 2.2, d: 2, mat: metalOrangeMat },

    // Timber Ridge (North-West)
    { id: 'timber_cabin1', x: -84, z: -66, w: 8.5, h: 4.2, d: 6.5, mat: woodMat },
    { id: 'timber_cabin2', x: -72, z: -54, w: 7.5, h: 4.0, d: 6.0, mat: woodMat },
    { id: 'timber_wall', x: -93, z: -56, w: 2.4, h: 2.2, d: 6.0, mat: concreteMat },

    // West Bunker (South-West)
    { id: 'west_bunker', x: -92, z: 68, w: 11, h: 4.6, d: 9, mat: concreteMat },
    { id: 'west_crate', x: -78, z: 64, w: 3.2, h: 2.5, d: 6.4, mat: metalTealMat },

    // Scattered field cover bunkers
    { id: 'field_1', x: 42, z: 34, w: 5.5, h: 2.4, d: 2.2, mat: concreteMat },
    { id: 'field_2', x: -45, z: 26, w: 2.2, h: 2.4, d: 6.0, mat: concreteMat },
    { id: 'field_3', x: 35, z: -55, w: 6.0, h: 2.6, d: 3.0, mat: metalOrangeMat },
    { id: 'field_4', x: -32, z: -74, w: 4.8, h: 2.4, d: 4.8, mat: woodMat },
    { id: 'field_5', x: 8, z: 64, w: 6.5, h: 2.5, d: 2.8, mat: metalTealMat },
    { id: 'field_6', x: 104, z: 12, w: 7.5, h: 4.4, d: 7.5, mat: concreteMat },
    { id: 'field_7', x: -102, z: -4, w: 7.5, h: 4.4, d: 7.5, mat: concreteMat },
  ];

  for (const b of compounds) {
    addBoxStructure(b.id, b.x, b.z, b.w, b.h, b.d, b.mat, true);
    // Add roof trim on taller buildings for composite 3D silhouette
    if (b.h >= 4.0) {
      const gy = groundHeightAt(b.x, b.z);
      const trimGeo = new THREE.BoxGeometry(b.w + 0.7, 0.45, b.d + 0.7);
      const trim = new THREE.Mesh(trimGeo, roofMat);
      trim.position.set(b.x, gy + b.h - 0.05, b.z);
      trim.castShadow = enableShadows;
      trim.receiveShadow = enableShadows;
      scene.add(trim);
      disposables.push(trimGeo);
    }
  }

  // Radar Dish Accent at Radar Outpost
  const radarGy = groundHeightAt(92, -78);
  const dishBaseGeo = new THREE.CylinderGeometry(1.1, 1.4, 3.2, 12);
  const dishBase = new THREE.Mesh(dishBaseGeo, roofMat);
  dishBase.position.set(92, radarGy + 6.2, -78);
  const dishBowlGeo = new THREE.SphereGeometry(2.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const dishBowl = new THREE.Mesh(dishBowlGeo, concreteMat);
  dishBowl.position.set(92, radarGy + 8.0, -78);
  dishBowl.rotation.x = Math.PI * 0.72;
  scene.add(dishBase, dishBowl);
  disposables.push(dishBaseGeo, dishBowlGeo);

  // 4. Instanced Trees (Trunks + Canopy Tiers) & Rocks (>20 identical items -> InstancedMesh)
  const treeCount = 150;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 3.4, 7);
  trunkGeo.translate(0, 1.7, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4028', roughness: 0.95 });

  const canopyGeo = new THREE.ConeGeometry(2.3, 4.8, 7);
  canopyGeo.translate(0, 4.9, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#2f5e2e', roughness: 0.85 });

  const trunksInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const canopyInstanced = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
  trunksInstanced.castShadow = enableShadows;
  canopyInstanced.castShadow = enableShadows;
  canopyInstanced.receiveShadow = enableShadows;

  const dummy = new THREE.Object3D();
  const leafTint = new THREE.Color();
  let placedTrees = 0;
  let attempts = 0;

  // Deterministic pseudo-random helper so island layout is consistent
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  while (placedTrees < treeCount && attempts < 1000) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = 28 + rand() * (ISLAND_RADIUS - 38);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const ty = groundHeightAt(tx, tz);
    if (ty < 1.1) continue;

    // Skip overlapping compounds
    let blocked = false;
    for (const c of colliders) {
      if (tx > c.minX - 3.5 && tx < c.maxX + 3.5 && tz > c.minZ - 3.5 && tz < c.maxZ + 3.5) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const scale = 0.85 + rand() * 0.45;
    dummy.position.set(tx, ty - 0.15, tz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.9 + rand() * 0.25), scale);
    dummy.updateMatrix();

    trunksInstanced.setMatrixAt(placedTrees, dummy.matrix);
    canopyInstanced.setMatrixAt(placedTrees, dummy.matrix);

    leafTint.setHSL(0.28 + (rand() - 0.5) * 0.05, 0.42 + rand() * 0.15, 0.24 + rand() * 0.08);
    canopyInstanced.setColorAt(placedTrees, leafTint);

    // Trunk collision cylinder approx
    colliders.push({
      id: `tree_${placedTrees}`,
      minX: tx - 0.55 * scale,
      maxX: tx + 0.55 * scale,
      minZ: tz - 0.55 * scale,
      maxZ: tz + 0.55 * scale,
      maxY: ty + 4.0,
      isCover: true,
    });
    placedTrees++;
  }
  trunksInstanced.count = placedTrees;
  canopyInstanced.count = placedTrees;
  trunksInstanced.instanceMatrix.needsUpdate = true;
  canopyInstanced.instanceMatrix.needsUpdate = true;
  if (canopyInstanced.instanceColor) canopyInstanced.instanceColor.needsUpdate = true;
  trunksInstanced.computeBoundingSphere();
  canopyInstanced.computeBoundingSphere();
  scene.add(trunksInstanced, canopyInstanced);
  disposables.push(trunkGeo, trunkMat, canopyGeo, canopyMat);

  // 5. Instanced Coastal & Hill Rocks
  const rockCount = 80;
  const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: '#6b7078',
    roughness: 0.9,
    metalness: 0.06,
  });
  const rockInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInstanced.castShadow = enableShadows;
  rockInstanced.receiveShadow = enableShadows;

  let placedRocks = 0;
  for (let i = 0; i < rockCount * 3 && placedRocks < rockCount; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 24 + rand() * (ISLAND_RADIUS - 20);
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const ry = groundHeightAt(rx, rz);
    if (ry < -0.4) continue;

    let blocked = false;
    for (const c of colliders) {
      if (rx > c.minX - 2.2 && rx < c.maxX + 2.2 && rz > c.minZ - 2.2 && rz < c.maxZ + 2.2) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const sx = 0.8 + rand() * 1.3;
    const sy = 0.6 + rand() * 0.9;
    const sz = 0.8 + rand() * 1.3;
    dummy.position.set(rx, ry + sy * 0.35, rz);
    dummy.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockInstanced.setMatrixAt(placedRocks, dummy.matrix);

    const shade = 0.38 + rand() * 0.16;
    leafTint.setRGB(shade, shade * 1.01, shade * 1.04);
    rockInstanced.setColorAt(placedRocks, leafTint);

    colliders.push({
      id: `rock_${placedRocks}`,
      minX: rx - sx * 1.1,
      maxX: rx + sx * 1.1,
      minZ: rz - sz * 1.1,
      maxZ: rz + sz * 1.1,
      maxY: ry + sy * 1.3,
      isCover: true,
    });
    placedRocks++;
  }
  rockInstanced.count = placedRocks;
  rockInstanced.instanceMatrix.needsUpdate = true;
  if (rockInstanced.instanceColor) rockInstanced.instanceColor.needsUpdate = true;
  rockInstanced.computeBoundingSphere();
  scene.add(rockInstanced);
  disposables.push(rockGeo, rockMat);

  return { colliders, disposables, oceanMesh };
}
