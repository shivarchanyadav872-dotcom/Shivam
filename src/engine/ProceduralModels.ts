import * as THREE from 'three';
import { CharacterDef, WeaponDef } from '../types/game';

export interface ArticulatedCharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  weaponMount: THREE.Group;
  parachuteGroup: THREE.Group;
  muzzleFlash: THREE.Mesh;
  contactShadow: THREE.Mesh;
  hitTargetHead: THREE.Mesh;
  hitTargetBody: THREE.Mesh;
}

/**
 * Builds a composite 5-8 part procedural 3D weapon model for the given WeaponDef.
 */
export function buildProceduralWeaponMesh(weapon: WeaponDef): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: weapon.bodyColor,
    roughness: 0.45,
    metalness: 0.65,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: '#181c22',
    roughness: 0.25,
    metalness: 0.9,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: weapon.accentColor,
    roughness: 0.55,
    metalness: 0.3,
  });

  if (weapon.weaponClass === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.24), metalMat);
    slide.position.set(0, 0.04, 0.06);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.04, 0.2), accentMat);
    frame.position.set(0, 0.0, 0.05);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.065), bodyMat);
    grip.position.set(0, -0.065, -0.02);
    grip.rotation.x = 0.22;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, 0.19);
    group.add(slide, frame, grip, barrel);
  } else {
    const isSniper = weapon.weaponClass === 'sniper';
    const isSmg = weapon.weaponClass === 'smg';
    const isShotgun = weapon.weaponClass === 'shotgun';

    const recLen = isSniper ? 0.54 : isSmg ? 0.34 : 0.44;
    const barrelLen = isSniper ? 0.65 : isSmg ? 0.22 : isShotgun ? 0.52 : 0.42;

    // 1. Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, recLen), bodyMat);
    receiver.position.set(0, 0.03, 0.06);

    // 2. Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.018, barrelLen, 10),
      metalMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.055, 0.06 + recLen / 2 + barrelLen / 2 - 0.03);

    // 3. Handguard / Shroud
    const shroud = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.075, barrelLen * 0.62),
      accentMat,
    );
    shroud.position.set(0, 0.035, 0.06 + recLen / 2 + barrelLen * 0.28);

    // 4. Stock
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.09, isSmg ? 0.18 : 0.26),
      bodyMat,
    );
    stock.position.set(0, 0.015, -recLen / 2 - 0.06);

    // 5. Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.12, 0.06), metalMat);
    grip.position.set(0, -0.06, -0.05);
    grip.rotation.x = 0.25;

    // 6. Magazine (curved/extended look)
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, isShotgun ? 0.06 : isSmg ? 0.19 : 0.15, 0.07),
      accentMat,
    );
    mag.position.set(0, -0.08, 0.11);
    mag.rotation.x = isSmg ? -0.15 : -0.22;

    // 7. Optic / Scope
    const optic = new THREE.Mesh(
      isSniper
        ? new THREE.CylinderGeometry(0.026, 0.024, 0.26, 12)
        : new THREE.BoxGeometry(0.045, 0.045, 0.09),
      metalMat,
    );
    if (isSniper) optic.rotation.x = Math.PI / 2;
    optic.position.set(0, 0.115, 0.06);

    group.add(receiver, barrel, shroud, stock, grip, mag, optic);
  }

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
    }
  });

  return group;
}

/**
 * Builds an articulated 10-part procedural 3D character rig with bottom-center pivot,
 * tactical armor plating, visor, backpack, parachute canopy, contact shadow, and hitboxes.
 */
export function buildCharacterRig(
  charDef: CharacterDef,
  weaponDef: WeaponDef,
  enableShadows: boolean,
): ArticulatedCharacterRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: charDef.primaryColor,
    roughness: 0.72,
    metalness: 0.15,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: charDef.secondaryColor,
    roughness: 0.38,
    metalness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: charDef.accentColor,
    roughness: 0.3,
    metalness: 0.45,
    emissive: new THREE.Color(charDef.accentColor),
    emissiveIntensity: 0.25,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: charDef.helmetColor,
    roughness: 0.42,
    metalness: 0.5,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: '#c99776',
    roughness: 0.65,
    metalness: 0.05,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: '#16191f',
    roughness: 0.85,
    metalness: 0.1,
  });

  // Contact shadow disc grounded at Y=0.02
  const shadowGeo = new THREE.CircleGeometry(0.55, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#000000',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.03;
  root.add(contactShadow);

  // Torso + Armored Chest Rig
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), primaryMat);
  torso.position.y = 1.18;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.33), armorMat);
  vest.position.y = 1.22;
  const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.35), accentMat);
  chestCore.position.y = 1.28;

  // Backpack
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.18), armorMat);
  backpack.position.set(0, 1.22, -0.22);
  const packStrip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), accentMat);
  packStrip.position.set(0, 1.32, -0.22);

  bodyPivot.add(torso, vest, chestCore, backpack, packStrip);

  // Head + Helmet + Tactical Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.56, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skinMat);
  headMesh.position.y = 0.15;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.22, 0.34), helmetMat);
  helmet.position.set(0, 0.24, -0.01);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.12), accentMat);
  visor.position.set(0, 0.19, 0.12);
  headGroup.add(headMesh, helmet, visor);
  bodyPivot.add(headGroup);

  // Invisible hitboxes for crisp raycast hit detection (head vs body)
  const hitGeoHead = new THREE.SphereGeometry(0.24, 8, 8);
  const hitMatInvisible = new THREE.MeshBasicMaterial({ visible: false });
  const hitTargetHead = new THREE.Mesh(hitGeoHead, hitMatInvisible);
  hitTargetHead.position.y = 0.16;
  headGroup.add(hitTargetHead);

  const hitGeoBody = new THREE.BoxGeometry(0.68, 1.35, 0.5);
  const hitTargetBody = new THREE.Mesh(hitGeoBody, hitMatInvisible);
  hitTargetBody.position.y = 0.85;
  bodyPivot.add(hitTargetBody);

  // Articulated Arms
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.36, 1.42, 0);
  const lShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.22), armorMat);
  lShoulder.position.y = -0.04;
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.15), primaryMat);
  lArm.position.y = -0.3;
  leftArmPivot.add(lShoulder, lArm);
  bodyPivot.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.36, 1.42, 0);
  const rShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.22), armorMat);
  rShoulder.position.y = -0.04;
  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.15), primaryMat);
  rArm.position.y = -0.3;

  const weaponMount = new THREE.Group();
  weaponMount.position.set(-0.04, -0.45, 0.18);
  const weaponMesh = buildProceduralWeaponMesh(weaponDef);
  weaponMount.add(weaponMesh);

  const flashGeo = new THREE.SphereGeometry(0.11, 8, 8);
  const flashMat = new THREE.MeshBasicMaterial({
    color: weaponDef.muzzleColor,
    transparent: true,
    opacity: 0.9,
  });
  const muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
  muzzleFlash.position.set(0, 0.05, 0.72);
  muzzleFlash.visible = false;
  weaponMount.add(muzzleFlash);

  rightArmPivot.add(rShoulder, rArm, weaponMount);
  bodyPivot.add(rightArmPivot);

  // Articulated Legs + Boots
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.15, 0.86, 0);
  const lThigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), primaryMat);
  lThigh.position.y = -0.28;
  const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.34, 0.28), bootMat);
  lBoot.position.set(0, -0.68, 0.03);
  leftLegPivot.add(lThigh, lBoot);
  bodyPivot.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.15, 0.86, 0);
  const rThigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), primaryMat);
  rThigh.position.y = -0.28;
  const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.34, 0.28), bootMat);
  rBoot.position.set(0, -0.68, 0.03);
  rightLegPivot.add(rThigh, rBoot);
  bodyPivot.add(rightLegPivot);

  // Parachute Canopy + Risers
  const parachuteGroup = new THREE.Group();
  parachuteGroup.position.set(0, 1.5, -0.1);
  parachuteGroup.visible = false;

  const canopyGeo = new THREE.SphereGeometry(2.3, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
  canopyGeo.scale(1.3, 0.75, 0.9);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: charDef.accentColor,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 2.6;
  parachuteGroup.add(canopy);

  const cordMat = new THREE.MeshBasicMaterial({ color: '#e2e8f0' });
  const cordOffsets = [
    [-1.4, 2.5, 0.4],
    [1.4, 2.5, 0.4],
    [-1.4, 2.5, -0.4],
    [1.4, 2.5, -0.4],
  ];
  for (const [cx, cy, cz] of cordOffsets) {
    const cordGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.7, 4);
    const cord = new THREE.Mesh(cordGeo, cordMat);
    cord.position.set(cx * 0.5, cy * 0.5 + 0.1, cz * 0.5);
    cord.lookAt(cx, cy + 0.2, cz);
    cord.rotateX(Math.PI / 2);
    parachuteGroup.add(cord);
  }
  bodyPivot.add(parachuteGroup);

  if (enableShadows) {
    bodyPivot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj !== hitTargetHead && obj !== hitTargetBody) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  return {
    root,
    bodyPivot,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    weaponMount,
    parachuteGroup,
    muzzleFlash,
    contactShadow,
    hitTargetHead,
    hitTargetBody,
  };
}

/**
 * Animates an articulated character rig smoothly based on movement/combat state.
 */
export function updateCharacterAnimation(
  rig: ArticulatedCharacterRig,
  dt: number,
  params: {
    speed: number;
    isSprinting: boolean;
    isCrouching: boolean;
    isJumping: boolean;
    isParachuting: boolean;
    isAiming: boolean;
    isDead: boolean;
    walkPhase: number;
    recoilAlpha: number;
    pitch: number;
  },
) {
  if (params.isDead) {
    rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, -Math.PI / 2, 10, dt);
    rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, 0.25, 10, dt);
    rig.parachuteGroup.visible = false;
    return;
  }

  const targetBodyY = params.isCrouching ? -0.32 : 0;
  rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, targetBodyY, 14, dt);
  rig.bodyPivot.rotation.x = THREE.MathUtils.damp(
    rig.bodyPivot.rotation.x,
    params.isParachuting ? 0.15 : params.isSprinting ? 0.12 : 0,
    10,
    dt,
  );

  // Leg swing
  if (params.isParachuting || params.isJumping) {
    rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.35, 10, dt);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -0.25, 10, dt);
  } else if (params.speed > 0.3) {
    const amp = params.isSprinting ? 0.85 : params.isCrouching ? 0.42 : 0.62;
    rig.leftLegPivot.rotation.x = Math.sin(params.walkPhase) * amp;
    rig.rightLegPivot.rotation.x = -Math.sin(params.walkPhase) * amp;
  } else {
    rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0, 12, dt);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0, 12, dt);
  }

  // Arms & weapon aim stance
  const aimAngle = -Math.PI / 2 + params.pitch * 0.65 - params.recoilAlpha * 0.28;
  if (params.isParachuting) {
    rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -2.5, 10, dt);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, -2.5, 10, dt);
  } else {
    const targetRightX = params.isAiming || params.recoilAlpha > 0.05 ? aimAngle : -0.95;
    rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, targetRightX, 16, dt);
    const leftSwing =
      params.isAiming ? -1.1 : params.speed > 0.3 ? -Math.sin(params.walkPhase) * 0.45 - 0.3 : -0.25;
    rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, leftSwing, 12, dt);
  }

  rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, params.pitch * 0.45, 14, dt);
}

/**
 * Builds a composite 3D loot crate with glowing beacon ring so loot is easy to spot across the island.
 */
export function buildLootBoxMesh(
  category: 'weapon' | 'armor' | 'medkit' | 'ammo',
): THREE.Group {
  const group = new THREE.Group();

  const accentHex =
    category === 'weapon'
      ? '#f59e0b'
      : category === 'armor'
        ? '#06b6d4'
        : category === 'medkit'
          ? '#10b981'
          : '#a855f7';

  const baseMat = new THREE.MeshStandardMaterial({
    color: '#1e2430',
    roughness: 0.5,
    metalness: 0.55,
  });
  const lidMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.35,
    metalness: 0.4,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.35,
  });

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.52, 0.65), baseMat);
  crate.position.y = 0.26;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.69), lidMat);
  trim.position.y = 0.52;

  const beaconMat = new THREE.MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.38, 2.4, 12, 1, true), beaconMat);
  beacon.position.y = 1.45;

  group.add(crate, trim, beacon);
  return group;
}
