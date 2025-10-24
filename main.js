const canvas = document.getElementById('application-canvas');
const promptEl = document.getElementById('prompt');
const inventoryEl = document.getElementById('inventory');
const craftLogEl = document.getElementById('craft-log');
const storageEl = document.getElementById('storage');

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

function createMaterial(hex, options = {}) {
  const color = colorFromHex(hex);
  const material = new pc.StandardMaterial();
  material.diffuse = color;
  if (options.opacity !== undefined) {
    material.opacity = options.opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = options.opacity === 1;
  }
  material.gloss = options.gloss !== undefined ? options.gloss : 0.35;
  if (options.metalness !== undefined) {
    material.metalness = options.metalness;
    material.useMetalness = true;
  } else {
    material.metalness = 0;
    material.useMetalness = false;
  }
  material.update();
  return material;
}

const groundMaterial = createMaterial('#3b5e35');
const pathMaterial = createMaterial('#8b6f4a');
const treeBarkMaterial = createMaterial('#5b3b1e');
const treeLeafMaterial = createMaterial('#2f7f3f');
const rockMaterial = createMaterial('#7d7f87');
const lettuceMaterial = createMaterial('#65c16f');
const stickMaterial = createMaterial('#c08f4a');
const woodMaterial = createMaterial('#8b5a2b');
const waterMaterial = createMaterial('#3d7fa6', { gloss: 0.85 });
const cloudMaterial = createMaterial('#ffffff', { opacity: 0.85, gloss: 0.5 });
const fabricMaterial = createMaterial('#d65f5f', { gloss: 0.3 });
const cabinMaterial = createMaterial('#7b5330');
const roofMaterial = createMaterial('#44332b');

const playerHeight = 1.8;
const interactables = [];
const storageInventory = {
  lettuce: 0,
  stick: 0,
  stone: 0,
  wood: 0
};

function registerInteractable(entity) {
  interactables.push(entity);
}

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

function refreshStorageUI() {
  const entries = Object.keys(storageInventory)
    .filter((key) => storageInventory[key] > 0)
    .map((key) => `${inventoryIcons[key]} ${inventoryLabels[key]}: ${storageInventory[key]}`);
  storageEl.textContent = entries.length
    ? `Storage: ${entries.join(' • ')}`
    : 'Storage: (empty)';
}

function addCraftLog(message) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const line = document.createElement('div');
  line.textContent = `[${timestamp}] ${message}`;
  craftLogEl.prepend(line);
  const maxEntries = 6;
  while (craftLogEl.children.length > maxEntries) {
    craftLogEl.removeChild(craftLogEl.lastChild);
  }
}

const inventoryIcons = {
  lettuce: '🥬',
  stick: '🥢',
  stone: '🪨',
  wood: '🪵',
  salad: '🥗',
  axe: '🪓'
};

const inventoryLabels = {
  lettuce: 'Wild Lettuce',
  stick: 'Forest Sticks',
  stone: 'River Stones',
  wood: 'Timber Logs',
  salad: 'SaaSquatch Salad',
  axe: 'Lumber Axe'
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
    wood: 0,
    salad: 0,
    axe: 0
  };
  this.focusedInteraction = null;
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
  refreshStorageUI();
  addCraftLog('Welcome to Lettuce Park! Gather resources, gear up 🪓, and build your dream shelter.');
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
    addCraftLog('Crafted a 🥗 SaaSquatch Salad! Delicious fuel for adventure.');
  } else {
    addCraftLog('You need 🥬 Lettuce, 🥢 Sticks, and 🪨 Stones to craft a 🥗 Salad.');
  }
};

PlayerController.prototype.tryCraftShelter = function (spawnPoint) {
  const needs = {
    wood: 5,
    stone: 2,
    stick: 3
  };
  const canCraft = Object.entries(needs).every(([key, amount]) => this.inventory[key] >= amount);
  if (!canCraft) {
    addCraftLog('Shelter crafting requires 5 🪵 Logs, 2 🪨 Stones, and 3 🥢 Sticks.');
    return;
  }

  Object.entries(needs).forEach(([key, amount]) => {
    this.inventory[key] -= amount;
  });
  refreshInventoryUI(this.inventory);

  const shelterTypes = ['tent', 'cabin', 'treehouse'];
  const type = shelterTypes[Math.floor(Math.random() * shelterTypes.length)];
  const position = spawnPoint.clone();
  position.add(new pc.Vec3(4, 0, 0));
  buildShelter(type, position, this.app.root);
  addCraftLog(`Shelter complete! You assembled a ${type === 'treehouse' ? '🌲 Tree House' : type === 'cabin' ? '🏠 Cabin' : '⛺ Tent'}.`);
};

PlayerController.prototype.onKeyDown = function (event) {
  if (event.key === pc.KEY_E && this.focusedInteraction) {
    const interaction = this.focusedInteraction.interaction;
    if (interaction && interaction.onInteract) {
      interaction.onInteract(this, this.focusedInteraction);
    }
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

  for (const entity of interactables) {
    if (!entity.enabled || !entity.interaction) {
      continue;
    }
    const dist = playerPos.distance(entity.getPosition());
    if (dist < 3 && dist < nearestDistance) {
      nearest = entity;
      nearestDistance = dist;
    }
  }

  if (nearest) {
    this.focusedInteraction = nearest;
    const prompt = nearest.interaction.getPrompt
      ? nearest.interaction.getPrompt(this)
      : nearest.interaction.prompt || 'Press E to interact';
    setPrompt(prompt);
  } else {
    this.focusedInteraction = null;
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
  this.entity.setLocalPosition(
    this.startPosition.x,
    this.startPosition.y + offset,
    this.startPosition.z
  );
};

function createGround() {
  const ground = new pc.Entity('ground');
  ground.addComponent('render', { type: 'box', material: groundMaterial });
  ground.setLocalScale(120, 0.2, 120);
  ground.setPosition(0, -0.1, 0);
  app.root.addChild(ground);

  const path = new pc.Entity('path');
  path.addComponent('render', { type: 'plane', material: pathMaterial });
  path.setPosition(0, 0.01, 0);
  path.setLocalScale(10, 10, 1);
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
    shadowDistance: 100,
    normalOffsetBias: 0.02
  });
  light.setEulerAngles(50, 35, 0);
  app.root.addChild(light);

  const lightBounce = new pc.Entity('fill');
  lightBounce.addComponent('light', {
    type: 'directional',
    color: new pc.Color(0.2, 0.28, 0.4),
    intensity: 0.25
  });
  lightBounce.setEulerAngles(-30, -120, 0);
  app.root.addChild(lightBounce);
}

function createLeafCluster(scale) {
  const cluster = new pc.Entity('leafCluster');
  cluster.addComponent('render', { type: 'sphere', material: treeLeafMaterial });
  cluster.setLocalScale(scale.x, scale.y, scale.z);
  return cluster;
}

function createRealisticTree(x, z, scale = 1) {
  const tree = new pc.Entity('tree');
  tree.setPosition(x, 0, z);

  const trunk = new pc.Entity('trunk');
  trunk.addComponent('render', { type: 'cylinder', material: treeBarkMaterial });
  trunk.setLocalScale(0.5 * scale, 3.8 * scale, 0.5 * scale);
  trunk.setLocalPosition(0, 1.9 * scale, 0);
  tree.addChild(trunk);

  for (let i = 0; i < 3; i++) {
    const branch = new pc.Entity(`branch_${i}`);
    branch.addComponent('render', { type: 'cylinder', material: treeBarkMaterial });
    const branchScale = 0.1 + Math.random() * 0.2;
    branch.setLocalScale(branchScale * scale, 1.2 * scale, branchScale * scale);
    const angle = (i / 3) * 360 + Math.random() * 25;
    branch.setLocalPosition(
      Math.cos(pc.math.DEG_TO_RAD * angle) * 0.6 * scale,
      2.2 * scale + Math.random() * 1.2 * scale,
      Math.sin(pc.math.DEG_TO_RAD * angle) * 0.6 * scale
    );
    branch.setLocalEulerAngles(30 + Math.random() * 25, angle, Math.random() * 20);
    tree.addChild(branch);

    const leaves = createLeafCluster(
      new pc.Vec3(1.5 + Math.random(), 1.2 + Math.random() * 0.6, 1.5 + Math.random())
    );
    leaves.setLocalPosition(branch.getLocalPosition().x, branch.getLocalPosition().y + 0.8 * scale, branch.getLocalPosition().z);
    tree.addChild(leaves);
  }

  const crown = createLeafCluster(new pc.Vec3(2.5 * scale, 2.2 * scale, 2.5 * scale));
  crown.setLocalPosition(0, 4.2 * scale, 0);
  tree.addChild(crown);

  tree.interaction = {
    prompt: 'Press E to chop this 🌳 sturdy tree for 🪵 logs',
    chopped: false,
    onInteract(player, entity) {
      if (this.chopped) {
        addCraftLog('This tree has already been harvested.');
        return;
      }
      if (player.inventory.axe < 1) {
        addCraftLog('You need a 🪓 Lumber Axe to chop trees.');
        return;
      }

      this.chopped = true;
      entity.enabled = false;
      spawnWoodDrops(entity.getPosition());
      addCraftLog('Timber! You gathered fresh 🪵 logs.');
    }
  };

  registerInteractable(tree);
  app.root.addChild(tree);
}

function spawnWoodDrops(position) {
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const offset = new pc.Vec3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    const data = {
      key: 'wood',
      label: 'Timber Logs',
      emoji: '🪵',
      meshType: 'box',
      material: woodMaterial,
      scale: new pc.Vec3(0.3, 0.6, 1),
      position: position.clone().add(offset)
    };
    createCollectible(data);
  }
}

function populateForest() {
  const radius = 38;
  for (let i = 0; i < 55; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * radius;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const scale = 0.8 + Math.random() * 1.8;
    createRealisticTree(x, z, scale);
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

  container.interaction = {
    prompt: `Press E to gather ${config.emoji} ${config.label}`,
    onInteract(player, entity) {
      player.collectItem(config, entity);
    }
  };

  registerInteractable(container);
  app.root.addChild(container);
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
      emoji: '🥢',
      meshType: 'cylinder',
      material: stickMaterial,
      scale: new pc.Vec3(0.1, 0.8, 0.1)
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
    const distance = 6 + Math.random() * 35;
    rock.setPosition(Math.cos(angle) * distance, 0.2, Math.sin(angle) * distance);
    rock.rotate(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    app.root.addChild(rock);
  }
}

function createWaterFeatures() {
  const river = new pc.Entity('river');
  river.addComponent('render', { type: 'plane', material: waterMaterial });
  river.setLocalScale(6, 80, 1);
  river.rotate(-90, 15, 0);
  river.setPosition(-15, 0.05, 0);
  app.root.addChild(river);

  const lake = new pc.Entity('lake');
  lake.addComponent('render', { type: 'plane', material: waterMaterial });
  lake.setLocalScale(18, 18, 1);
  lake.rotate(-90, 0, 0);
  lake.setPosition(20, 0.04, 18);
  app.root.addChild(lake);
}

function createClouds() {
  for (let i = 0; i < 8; i++) {
    const cloud = new pc.Entity('cloud');
    cloud.addComponent('render', { type: 'box', material: cloudMaterial });
    cloud.setLocalScale(6 + Math.random() * 8, 2 + Math.random(), 3 + Math.random() * 4);
    cloud.setPosition(-20 + Math.random() * 40, 20 + Math.random() * 8, -30 + Math.random() * 60);
    cloud.addComponent('script');
    cloud.script.create('bob');
    app.root.addChild(cloud);
  }
}

function createToolRack() {
  const rack = new pc.Entity('toolRack');
  rack.setPosition(-2, 0, 3);

  const frame = new pc.Entity('rackFrame');
  frame.addComponent('render', { type: 'box', material: woodMaterial });
  frame.setLocalScale(1.2, 0.8, 0.4);
  frame.setLocalPosition(0, 0.4, 0);
  rack.addChild(frame);

  const axeDisplay = new pc.Entity('axeDisplay');
  axeDisplay.addComponent('render', { type: 'box', material: woodMaterial });
  axeDisplay.setLocalScale(0.1, 0.8, 0.3);
  axeDisplay.setLocalPosition(0, 0.8, 0);
  rack.addChild(axeDisplay);

  rack.interaction = {
    getPrompt(player) {
      return player.inventory.axe > 0
        ? 'Press E to admire your trusty 🪓 Lumber Axe'
        : 'Press E to pick up the 🪓 Lumber Axe';
    },
    onInteract(player) {
      if (player.inventory.axe > 0) {
        addCraftLog('Your 🪓 Lumber Axe is ready for more chopping.');
        return;
      }
      player.inventory.axe = 1;
      refreshInventoryUI(player.inventory);
      addCraftLog('You picked up the 🪓 Lumber Axe! Trees beware.');
    }
  };

  registerInteractable(rack);
  app.root.addChild(rack);
}

function createStorageCrate() {
  const crate = new pc.Entity('storageCrate');
  crate.setPosition(2, 0, 3);

  const base = new pc.Entity('crateBase');
  base.addComponent('render', { type: 'box', material: woodMaterial });
  base.setLocalScale(1.2, 0.8, 1.2);
  base.setLocalPosition(0, 0.4, 0);
  crate.addChild(base);

  crate.interaction = {
    getPrompt() {
      return 'Press E to manage 📦 storage';
    },
    onInteract(player) {
      const inventory = player.inventory;
      let moved = false;
      const transferable = ['wood', 'stone', 'stick', 'lettuce'];
      for (const key of transferable) {
        if (inventory[key] > 0) {
          storageInventory[key] += inventory[key];
          inventory[key] = 0;
          moved = true;
        }
      }
      if (moved) {
        refreshInventoryUI(inventory);
        refreshStorageUI();
        addCraftLog('You stored supplies safely inside the 📦 crate.');
        return;
      }

      let withdrawn = false;
      for (const key of transferable) {
        if (storageInventory[key] > 0) {
          inventory[key]++;
          storageInventory[key]--;
          withdrawn = true;
          break;
        }
      }
      if (withdrawn) {
        refreshInventoryUI(inventory);
        refreshStorageUI();
        addCraftLog('You retrieved an item from the 📦 storage.');
      } else {
        addCraftLog('Storage is empty. Time to gather more goodies!');
      }
    }
  };

  registerInteractable(crate);
  app.root.addChild(crate);
}

function createCraftingCrate() {
  const crate = new pc.Entity('craftingCrate');
  crate.setPosition(0, 0, 3);

  const base = new pc.Entity('craftingBase');
  base.addComponent('render', { type: 'box', material: woodMaterial });
  base.setLocalScale(1.4, 0.8, 1.4);
  base.setLocalPosition(0, 0.4, 0);
  crate.addChild(base);

  const top = new pc.Entity('craftingTop');
  top.addComponent('render', { type: 'box', material: fabricMaterial });
  top.setLocalScale(1.5, 0.2, 1.5);
  top.setLocalPosition(0, 0.9, 0);
  crate.addChild(top);

  crate.interaction = {
    getPrompt() {
      return 'Press E to craft shelter 🏕️';
    },
    onInteract(player, entity) {
      player.tryCraftShelter(entity.getPosition());
    }
  };

  registerInteractable(crate);
  app.root.addChild(crate);
}

function buildShelter(type, position, root) {
  switch (type) {
    case 'tent':
      return buildTent(position, root);
    case 'cabin':
      return buildCabin(position, root);
    case 'treehouse':
    default:
      return buildTreeHouse(position, root);
  }
}

function buildTent(position, root) {
  const tent = new pc.Entity('tent');
  tent.setPosition(position.x, 0, position.z);

  const floor = new pc.Entity('tentFloor');
  floor.addComponent('render', { type: 'plane', material: fabricMaterial });
  floor.setLocalScale(3, 3, 1);
  floor.rotate(-90, 0, 0);
  floor.setLocalPosition(0, 0.05, 0);
  tent.addChild(floor);

  for (let i = -1; i <= 1; i += 2) {
    const side = new pc.Entity(`tentSide_${i}`);
    side.addComponent('render', { type: 'plane', material: fabricMaterial });
    side.setLocalScale(3, 2.4, 1);
    side.setLocalEulerAngles(0, 0, -i * 60);
    side.setLocalPosition(0, 1.3, i * 1.2);
    tent.addChild(side);
  }

  const front = new pc.Entity('tentFront');
  front.addComponent('render', { type: 'plane', material: fabricMaterial });
  front.setLocalScale(3, 2.4, 1);
  front.setLocalPosition(0, 1.3, -1.2);
  tent.addChild(front);

  const back = new pc.Entity('tentBack');
  back.addComponent('render', { type: 'plane', material: fabricMaterial });
  back.setLocalScale(3, 2.4, 1);
  back.rotate(0, 180, 0);
  back.setLocalPosition(0, 1.3, 1.2);
  tent.addChild(back);

  const ridge = new pc.Entity('tentRidge');
  ridge.addComponent('render', { type: 'cylinder', material: woodMaterial });
  ridge.setLocalScale(0.1, 3.4, 0.1);
  ridge.rotate(90, 0, 0);
  ridge.setLocalPosition(0, 2.2, 0);
  tent.addChild(ridge);

  root.addChild(tent);
  return tent;
}

function buildCabin(position, root) {
  const cabin = new pc.Entity('cabin');
  cabin.setPosition(position.x, 0, position.z);

  const base = new pc.Entity('cabinBase');
  base.addComponent('render', { type: 'box', material: cabinMaterial });
  base.setLocalScale(4.5, 2.5, 4.5);
  base.setLocalPosition(0, 1.2, 0);
  cabin.addChild(base);

  const roof = new pc.Entity('cabinRoof');
  roof.addComponent('render', { type: 'cone', material: roofMaterial });
  roof.setLocalScale(5, 2.5, 5);
  roof.setLocalPosition(0, 3, 0);
  cabin.addChild(roof);

  const door = new pc.Entity('cabinDoor');
  door.addComponent('render', { type: 'plane', material: woodMaterial });
  door.setLocalScale(1.4, 2, 1);
  door.rotate(0, 0, 0);
  door.setLocalPosition(0, 1, 2.3);
  cabin.addChild(door);

  root.addChild(cabin);
  return cabin;
}

function buildTreeHouse(position, root) {
  const treehouse = new pc.Entity('treehouse');
  treehouse.setPosition(position.x, 0, position.z);

  const support = new pc.Entity('treehouseSupport');
  support.addComponent('render', { type: 'cylinder', material: treeBarkMaterial });
  support.setLocalScale(1.2, 8, 1.2);
  support.setLocalPosition(0, 4, 0);
  treehouse.addChild(support);

  const platform = new pc.Entity('treehousePlatform');
  platform.addComponent('render', { type: 'box', material: woodMaterial });
  platform.setLocalScale(6, 0.5, 6);
  platform.setLocalPosition(0, 7.5, 0);
  treehouse.addChild(platform);

  const house = new pc.Entity('treehouseCabin');
  house.addComponent('render', { type: 'box', material: cabinMaterial });
  house.setLocalScale(4.2, 2.2, 4.2);
  house.setLocalPosition(0, 8.8, 0);
  treehouse.addChild(house);

  const roof = new pc.Entity('treehouseRoof');
  roof.addComponent('render', { type: 'cone', material: roofMaterial });
  roof.setLocalScale(4.8, 2.2, 4.8);
  roof.setLocalPosition(0, 10, 0);
  treehouse.addChild(roof);

  const ladder = new pc.Entity('treehouseLadder');
  ladder.addComponent('render', { type: 'box', material: woodMaterial });
  ladder.setLocalScale(0.6, 6.5, 0.2);
  ladder.setLocalPosition(-2.2, 3.5, 2.5);
  treehouse.addChild(ladder);

  const climbNode = new pc.Entity('treehouseClimbNode');
  climbNode.setPosition(position.x - 2.2, 0, position.z + 2.5);
  const climbMarker = new pc.Entity('climbMarker');
  climbMarker.addComponent('render', { type: 'sphere', material: fabricMaterial });
  climbMarker.setLocalScale(0.4, 0.4, 0.4);
  climbMarker.setLocalPosition(0, 0.4, 0);
  climbNode.addChild(climbMarker);
  climbNode.interaction = {
    prompt: 'Press E to climb the ladder 🪜',
    onInteract(player) {
      const climbPosition = new pc.Vec3(position.x, 8.6, position.z);
      player.entity.setPosition(climbPosition);
      addCraftLog('You climbed into the 🌲 tree house canopy! Enjoy the view ☁️.');
    }
  };
  registerInteractable(climbNode);
  root.addChild(climbNode);

  root.addChild(treehouse);
  return treehouse;
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
    farClip: 220,
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
createWaterFeatures();
createClouds();
scatterCollectibles();
createToolRack();
createStorageCrate();
createCraftingCrate();
createPlayer();

addCraftLog('Tip: Store extra supplies 📦 then craft a cozy shelter 🏡.');
