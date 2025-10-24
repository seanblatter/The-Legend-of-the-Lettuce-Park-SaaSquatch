const canvas = document.getElementById('application-canvas');
const promptEl = document.getElementById('prompt');
const inventoryEl = document.getElementById('inventory');
const craftLogEl = document.getElementById('craft-log');

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window),
  elementInput: new pc.ElementInput(canvas)
});

app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();

window.addEventListener('resize', () => app.resizeCanvas());

app.scene.toneMapping = pc.TONEMAP_ACES;
app.scene.gammaCorrection = pc.GAMMA_SRGB;
app.scene.ambientLight = new pc.Color(0.35, 0.42, 0.38);

function colorFromHex(hex) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6 && normalized.length !== 8) {
    throw new Error(`Unsupported hex color format: ${hex}`);
  }

  const hasAlpha = normalized.length === 8;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const a = hasAlpha ? parseInt(normalized.slice(6, 8), 16) / 255 : 1;

  return new pc.Color(r, g, b, a);
}

function createMaterial(hex) {
  const color = colorFromHex(hex);
  const material = new pc.StandardMaterial();
  material.diffuse = color;
  material.gloss = 0.3;
  material.metalness = 0;
  material.useMetalness = false;
  material.update();
  return material;
}

const groundMaterial = createMaterial('#3b5e35');
const pathMaterial = createMaterial('#8b6f4a');
const treeBarkMaterial = createMaterial('#5b3b1e');
const treeLeafMaterial = createMaterial('#1f5f2d');
const rockMaterial = createMaterial('#7d7f87');
const lettuceMaterial = createMaterial('#65c16f');
const stickMaterial = createMaterial('#c5a063');

const playerHeight = 1.8;
const collectibles = [];

function setPrompt(text) {
  promptEl.textContent = text;
}

function refreshInventoryUI(inventory) {
  const entries = Object.keys(inventory)
    .filter((key) => inventory[key] > 0)
    .map((key) => `${inventoryIcons[key]} ${inventoryLabels[key]}: ${inventory[key]}`);
  inventoryEl.textContent = entries.length
    ? `Inventory: ${entries.join(' • ')}`
    : 'Inventory: (empty)';
}

function addCraftLog(message) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.textContent = `[${timestamp}] ${message}`;
  craftLogEl.prepend(line);
  const maxEntries = 5;
  while (craftLogEl.children.length > maxEntries) {
    craftLogEl.removeChild(craftLogEl.lastChild);
  }
}

const inventoryIcons = {
  lettuce: '🥬',
  stick: '🪵',
  stone: '🪨',
  salad: '🥗'
};

const inventoryLabels = {
  lettuce: 'Lettuce Leaves',
  stick: 'Sturdy Sticks',
  stone: 'River Stones',
  salad: 'SaaSquatch Salad'
};

const PlayerController = pc.createScript('playerController');
PlayerController.attributes.add('cameraPivot', { type: 'entity' });

PlayerController.prototype.initialize = function () {
  this.speed = 6;
  this.lookSpeed = 0.2;
  this.pitch = 0;
  this.yaw = 0;
  this.inventory = {
    lettuce: 0,
    stick: 0,
    stone: 0,
    salad: 0
  };
  this.focusedItem = null;
  this.pointerLocked = false;

  this._mouseMoveHandler = this.onMouseMove.bind(this);
  this._keyDownHandler = this.onKeyDown.bind(this);

  this.app.mouse.on(pc.EVENT_MOUSEMOVE, this._mouseMoveHandler);
  this.app.keyboard.on(pc.EVENT_KEYDOWN, this._keyDownHandler);

  document.addEventListener('pointerlockchange', () => {
    this.pointerLocked = document.pointerLockElement === canvas;
  });

  canvas.addEventListener('click', () => {
    if (!this.pointerLocked) {
      canvas.requestPointerLock();
    }
  });

  refreshInventoryUI(this.inventory);
  addCraftLog('Welcome to Lettuce Park! Gather ingredients to craft a 🥗 SaaSquatch Salad.');
};

PlayerController.prototype.collectItem = function (itemData, entity) {
  this.inventory[itemData.key]++;
  refreshInventoryUI(this.inventory);
  addCraftLog(`Collected ${itemData.emoji} ${itemData.label}!`);
  entity.enabled = false;
};

PlayerController.prototype.tryCraftSalad = function () {
  const required = ['lettuce', 'stick', 'stone'];
  const canCraft = required.every((key) => this.inventory[key] > 0);
  if (canCraft) {
    required.forEach((key) => {
      this.inventory[key]--;
    });
    this.inventory.salad++;
    refreshInventoryUI(this.inventory);
    addCraftLog('Crafted a 🥗 SaaSquatch Salad! Delicious.');
  } else {
    addCraftLog('You need 🥬 Lettuce, 🪵 Sticks, and 🪨 Stones to craft a 🥗 Salad.');
  }
};

PlayerController.prototype.onKeyDown = function (event) {
  if (event.key === pc.KEY_E && this.focusedItem) {
    this.collectItem(this.focusedItem.collectible, this.focusedItem);
    this.focusedItem = null;
    setPrompt('');
    event.event.preventDefault();
  }

  if (event.key === pc.KEY_C) {
    this.tryCraftSalad();
    event.event.preventDefault();
  }
};

PlayerController.prototype.onMouseMove = function (event) {
  if (!this.pointerLocked) {
    return;
  }
  this.yaw -= event.dx * this.lookSpeed;
  this.pitch -= event.dy * this.lookSpeed;
  this.pitch = pc.math.clamp(this.pitch, -85, 85);

  this.entity.setLocalEulerAngles(0, this.yaw, 0);
  this.cameraPivot.setLocalEulerAngles(this.pitch, 0, 0);
};

PlayerController.prototype.update = function (dt) {
  const move = new pc.Vec3();
  const forward = this.entity.forward.clone();
  forward.y = 0;
  forward.normalize();

  const right = this.entity.right.clone();
  right.y = 0;
  right.normalize();

  if (this.app.keyboard.isPressed(pc.KEY_W)) {
    move.add(forward);
  }
  if (this.app.keyboard.isPressed(pc.KEY_S)) {
    move.sub(forward);
  }
  if (this.app.keyboard.isPressed(pc.KEY_A)) {
    move.sub(right);
  }
  if (this.app.keyboard.isPressed(pc.KEY_D)) {
    move.add(right);
  }

  if (move.lengthSq() > 0) {
    move.normalize().scale(this.speed * dt);
    this.entity.translate(move);
  }

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const playerPos = this.entity.getPosition();

  for (const entity of collectibles) {
    if (!entity.enabled) {
      continue;
    }
    const dist = playerPos.distance(entity.getPosition());
    if (dist < 2.2 && dist < nearestDistance) {
      nearest = entity;
      nearestDistance = dist;
    }
  }

  if (nearest) {
    this.focusedItem = nearest;
    setPrompt(`Press E to gather ${nearest.collectible.emoji} ${nearest.collectible.label}`);
  } else {
    this.focusedItem = null;
    setPrompt('');
  }
};

const Spin = pc.createScript('spin');
Spin.prototype.initialize = function () {
  this.speed = 50 + Math.random() * 30;
};
Spin.prototype.update = function (dt) {
  this.entity.rotate(0, this.speed * dt, 0);
};

const Bob = pc.createScript('bob');
Bob.prototype.initialize = function () {
  this.time = Math.random() * Math.PI * 2;
  this.startPosition = this.entity.getLocalPosition().clone();
};
Bob.prototype.update = function (dt) {
  this.time += dt;
  const offset = Math.sin(this.time * 2) * 0.1;
  this.entity.setLocalPosition(this.startPosition.x, this.startPosition.y + offset, this.startPosition.z);
};

function createGround() {
  const ground = new pc.Entity('ground');
  ground.addComponent('render', { type: 'box', material: groundMaterial });
  ground.setLocalScale(80, 0.2, 80);
  ground.setPosition(0, -0.1, 0);
  app.root.addChild(ground);

  const path = new pc.Entity('path');
  path.addComponent('render', { type: 'plane', material: pathMaterial });
  path.setPosition(0, 0.01, 0);
  path.setLocalScale(8, 8, 1);
  path.rotate(-90, 0, 0);
  app.root.addChild(path);
}

function createLighting() {
  const light = new pc.Entity('sun');
  light.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 0.96, 0.88),
    castShadows: true,
    shadowBias: 0.3,
    shadowDistance: 60,
    normalOffsetBias: 0.02
  });
  light.setEulerAngles(50, 35, 0);
  app.root.addChild(light);

  const lightBounce = new pc.Entity('fill');
  lightBounce.addComponent('light', {
    type: 'directional',
    color: new pc.Color(0.1, 0.2, 0.35),
    intensity: 0.2
  });
  lightBounce.setEulerAngles(-30, -120, 0);
  app.root.addChild(lightBounce);
}

function createTree(x, z, scale = 1) {
  const tree = new pc.Entity('tree');
  tree.setPosition(x, 0, z);

  const trunk = new pc.Entity('trunk');
  trunk.addComponent('render', { type: 'cylinder', material: treeBarkMaterial });
  trunk.setLocalScale(0.5 * scale, 4 * scale, 0.5 * scale);
  trunk.setLocalPosition(0, 2 * scale, 0);
  tree.addChild(trunk);

  const canopy = new pc.Entity('canopy');
  canopy.addComponent('render', { type: 'cone', material: treeLeafMaterial });
  canopy.setLocalScale(2.4 * scale, 3 * scale, 2.4 * scale);
  canopy.setLocalPosition(0, 4.5 * scale, 0);
  tree.addChild(canopy);

  app.root.addChild(tree);
}

function populateForest() {
  const radius = 30;
  for (let i = 0; i < 45; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * radius;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const scale = 0.8 + Math.random() * 1.8;
    createTree(x, z, scale);
  }
}

function createCollectible(config) {
  const container = new pc.Entity(config.label);
  container.setPosition(config.position.x, config.position.y, config.position.z);

  const item = new pc.Entity('itemMesh');
  item.addComponent('render', { type: config.meshType, material: config.material });
  item.setLocalScale(config.scale.x, config.scale.y, config.scale.z);
  item.addComponent('script');
  item.script.create('spin');
  item.script.create('bob');
  container.addChild(item);

  container.collectible = config;
  app.root.addChild(container);
  collectibles.push(container);
}

function scatterCollectibles() {
  const spawnPoints = [
    { x: 2, y: 0.4, z: -3 },
    { x: -4, y: 0.4, z: 5 },
    { x: 6, y: 0.4, z: 8 },
    { x: -8, y: 0.4, z: -6 },
    { x: 12, y: 0.4, z: 3 },
    { x: 10, y: 0.4, z: -10 },
    { x: -11, y: 0.4, z: 9 },
    { x: 5, y: 0.4, z: 14 },
    { x: -14, y: 0.4, z: -12 }
  ];

  const types = [
    {
      key: 'lettuce',
      label: 'Wild Lettuce',
      emoji: '🥬',
      meshType: 'sphere',
      material: lettuceMaterial,
      scale: new pc.Vec3(0.6, 0.3, 0.6)
    },
    {
      key: 'stick',
      label: 'Forest Stick',
      emoji: '🪵',
      meshType: 'box',
      material: stickMaterial,
      scale: new pc.Vec3(0.15, 0.6, 0.15)
    },
    {
      key: 'stone',
      label: 'River Stone',
      emoji: '🪨',
      meshType: 'capsule',
      material: rockMaterial,
      scale: new pc.Vec3(0.45, 0.45, 0.45)
    }
  ];

  let typeIndex = 0;
  for (const point of spawnPoints) {
    const data = Object.assign({}, types[typeIndex % types.length]);
    data.position = new pc.Vec3(point.x, point.y, point.z);
    createCollectible(data);
    typeIndex++;
  }
}

function createRocks() {
  for (let i = 0; i < 25; i++) {
    const rock = new pc.Entity('rock');
    rock.addComponent('render', { type: 'sphere', material: rockMaterial });
    const size = 0.4 + Math.random() * 1.2;
    rock.setLocalScale(size, size, size);
    const angle = Math.random() * Math.PI * 2;
    const distance = 4 + Math.random() * 25;
    rock.setPosition(Math.cos(angle) * distance, 0.2, Math.sin(angle) * distance);
    rock.rotate(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    app.root.addChild(rock);
  }
}

function createPlayer() {
  const player = new pc.Entity('player');
  player.setPosition(0, playerHeight, 6);
  player.addComponent('script');

  const cameraPivot = new pc.Entity('cameraPivot');
  cameraPivot.setLocalPosition(0, 0, 0);
  player.addChild(cameraPivot);

  const camera = new pc.Entity('camera');
  camera.addComponent('camera', {
    clearColor: new pc.Color(0.52, 0.75, 0.91),
    farClip: 200,
    fov: 72
  });
  camera.setLocalPosition(0, 0, 0);
  cameraPivot.addChild(camera);

  player.script.create('playerController', {
    attributes: {
      cameraPivot
    }
  });

  app.root.addChild(player);

  return { player, camera };
}

createGround();
createLighting();
populateForest();
createRocks();
scatterCollectibles();
createPlayer();

addCraftLog('Tip: Explore the clearings for glowing resources ✨');
