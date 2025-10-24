const canvas = document.getElementById('application-canvas');
const promptEl = document.getElementById('prompt');
const inventoryGrid = document.getElementById('inventory-grid');
const storageGrid = document.getElementById('storage-grid');
const craftLogEl = document.getElementById('craft-log');
const storageWithdrawBtn = document.getElementById('storage-withdraw');
const storageSortBtn = document.getElementById('storage-sort');
const inventoryDepositBtn = document.getElementById('inventory-deposit');
const fishingStatusEl = document.getElementById('fishing-status');
const craftingPanel = document.querySelector('.crafting-panel');
const craftingToggleBtn = document.getElementById('crafting-toggle');

let craftingPanelOpen = false;

function setCraftingPanelOpen(open) {
  craftingPanelOpen = open;
  if (craftingPanel) {
    craftingPanel.classList.toggle('is-hidden', !open);
  }
  if (craftingToggleBtn) {
    craftingToggleBtn.setAttribute('aria-expanded', String(open));
    craftingToggleBtn.textContent = open ? 'Close Crafting 🧰' : 'Open Crafting 🧰';
  }
  if (open && document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function toggleCraftingPanel() {
  setCraftingPanelOpen(!craftingPanelOpen);
}

setCraftingPanelOpen(false);

if (craftingToggleBtn) {
  craftingToggleBtn.addEventListener('click', () => {
    toggleCraftingPanel();
  });
}

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
app.scene.skyboxIntensity = 1.1;
app.scene.ambientLight = new pc.Color(0.28, 0.38, 0.35);

function colorFromHex(hex) {
  const normalized = hex.replace('#', '');
  const hasAlpha = normalized.length === 8;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const a = hasAlpha ? parseInt(normalized.slice(6, 8), 16) / 255 : 1;
  return new pc.Color(r, g, b, a);
}

function createMaterial(hex, options = {}) {
  const material = new pc.StandardMaterial();
  material.diffuse = colorFromHex(hex);
  material.gloss = options.gloss ?? 0.35;
  material.metalness = options.metalness ?? 0;
  material.useMetalness = material.metalness > 0;
  material.opacity = options.opacity ?? 1;
  if (material.opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

function createGradientTexture(colors, size = 256) {
  const canvasTex = document.createElement('canvas');
  canvasTex.width = 1;
  canvasTex.height = size;
  const ctx = canvasTex.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  for (const stop of colors) {
    gradient.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, size);
  const texture = new pc.Texture(app.graphicsDevice, {
    width: 1,
    height: size,
    format: pc.PIXELFORMAT_R8_G8_B8_A8,
    mipmaps: false
  });
  texture.minFilter = pc.FILTER_LINEAR;
  texture.magFilter = pc.FILTER_LINEAR;
  texture.addressU = pc.ADDRESS_REPEAT;
  texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
  texture.setSource(canvasTex);
  return texture;
}

const groundMaterial = createMaterial('#3f6241');
const pathMaterial = createMaterial('#8b6f4a', { gloss: 0.28 });
const treeBarkMaterial = createMaterial('#5b3b1e', { gloss: 0.2 });
const treeLeafMaterial = createMaterial('#2f7f3f', { gloss: 0.15 });
const rockMaterial = createMaterial('#7d7f87', { gloss: 0.12, metalness: 0.05 });
const lettuceMaterial = createMaterial('#65c16f', { gloss: 0.18 });
const stickMaterial = createMaterial('#c08f4a', { gloss: 0.18 });
const woodMaterial = createMaterial('#8b5a2b', { gloss: 0.28 });
const fabricMaterial = createMaterial('#d65f5f', { gloss: 0.3 });
const cabinMaterial = createMaterial('#7b5330', { gloss: 0.25 });
const roofMaterial = createMaterial('#44332b', { gloss: 0.28 });

const waterGradient = createGradientTexture([
  { offset: 0, color: '#274f63' },
  { offset: 0.35, color: '#2d7d92' },
  { offset: 0.7, color: '#3ba7b6' },
  { offset: 1, color: '#7ed4d7' }
]);

function createWaterMaterial() {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(0.24, 0.52, 0.58);
  material.emissive = new pc.Color(0.12, 0.24, 0.27);
  material.emissiveIntensity = 1.25;
  material.useMetalness = true;
  material.metalness = 0.4;
  material.gloss = 0.86;
  material.cull = pc.CULLFACE_NONE;
  material.opacity = 0.94;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.diffuseMap = waterGradient;
  material.diffuseMapTiling = new pc.Vec2(4, 1);
  material.update();
  return material;
}

const interactables = [];

const storageInventory = {
  lettuce: 0,
  stick: 0,
  stone: 0,
  wood: 0,
  fish: 0,
  lure: 0,
  salad: 0
};

let storageSortMode = false;

const itemDefinitions = {
  lettuce: { icon: '🥬', label: 'Wild Lettuce', capacity: 12 },
  stick: { icon: '🥢', label: 'Forest Sticks', capacity: 20 },
  stone: { icon: '🪨', label: 'River Stones', capacity: 18 },
  wood: { icon: '🪵', label: 'Timber Logs', capacity: 25 },
  salad: { icon: '🥗', label: 'SaaSquatch Salad', capacity: 5 },
  axe: { icon: '🪓', label: 'Lumber Axe', capacity: 1 },
  fish: { icon: '🐟', label: 'River Fish', capacity: 6 },
  lure: { icon: '🎣', label: 'River Lure', capacity: 4 }
};

const recipes = {
  salad: {
    label: 'SaaSquatch Salad',
    requirements: { lettuce: 1, stick: 1, stone: 1 },
    onCraft(player) {
      player.inventory.salad++;
      addCraftLog('Crafted a 🥗 SaaSquatch Salad! Crisp, crunchy, and energizing.');
    }
  },
  shelter: {
    label: 'Shelter',
    requirements: { wood: 5, stone: 2, stick: 3 },
    onCraft(player) {
      const shelterTypes = ['tent', 'cabin', 'treehouse'];
      const type = shelterTypes[Math.floor(Math.random() * shelterTypes.length)];
      const spawnPoint = player.entity.getPosition().clone();
      spawnPoint.add(new pc.Vec3(4, 0, 0));
      buildShelter(type, spawnPoint, app.root);
      addCraftLog(`Shelter complete! You assembled a ${
        type === 'treehouse' ? '🌲 Tree House' : type === 'cabin' ? '🏠 Cabin' : '⛺ Tent'
      }.`);
    }
  },
  lure: {
    label: 'River Lure',
    requirements: { stone: 1, stick: 1 },
    onCraft(player) {
      player.inventory.lure++;
      addCraftLog('You tied a sparkling 🎣 River Lure. Fish will adore this!');
    }
  }
};

let activePlayerController = null;

function registerInteractable(entity) {
  interactables.push(entity);
}

function setPrompt(text) {
  promptEl.textContent = text;
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
  const maxEntries = 10;
  while (craftLogEl.children.length > maxEntries) {
    craftLogEl.removeChild(craftLogEl.lastChild);
  }
}

function renderItemCard(key, count, container) {
  const definition = itemDefinitions[key];
  const card = document.createElement('div');
  card.className = 'item-card';

  const label = document.createElement('div');
  label.className = 'label';
  const icon = document.createElement('span');
  icon.textContent = definition.icon;
  const text = document.createElement('strong');
  text.textContent = definition.label;
  label.appendChild(icon);
  label.appendChild(text);
  card.appendChild(label);

  const countEl = document.createElement('div');
  countEl.className = 'count';
  countEl.textContent = `Quantity: ${count}`;
  card.appendChild(countEl);

  const progress = document.createElement('progress');
  progress.max = definition.capacity;
  progress.value = count;
  card.appendChild(progress);

  container.appendChild(card);
}

function renderItemGrid(container, source, options = {}) {
  container.innerHTML = '';
  const entries = Object.keys(itemDefinitions).map((key) => ({
    key,
    amount: source[key] ?? 0
  }));
  if (options.sortByValue) {
    entries.sort((a, b) => b.amount - a.amount);
  }
  let displayed = 0;
  for (const entry of entries) {
    if (entry.amount > 0 || options.showZero) {
      renderItemCard(entry.key, entry.amount, container);
      displayed++;
    }
  }
  if (displayed === 0) {
    const empty = document.createElement('div');
    empty.className = 'item-card';
    empty.innerHTML = '<div class="label"><span>🧺</span><strong>Nothing Stored</strong></div><div class="count">Collect resources to fill this panel.</div>';
    container.appendChild(empty);
  }
}

function refreshInventoryUI(inventory) {
  renderItemGrid(inventoryGrid, inventory);
  refreshCraftingButtons(inventory);
}

function refreshStorageUI() {
  renderItemGrid(storageGrid, storageInventory, { sortByValue: storageSortMode });
}

function refreshCraftingButtons(inventory) {
  document.querySelectorAll('.craft-button').forEach((button) => {
    const action = button.dataset.action;
    const recipe = recipes[action];
    if (!recipe) {
      button.disabled = true;
      return;
    }
    const canCraft = Object.entries(recipe.requirements).every(([key, amount]) => (inventory[key] || 0) >= amount);
    button.disabled = !canCraft;
  });
}

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
    axe: 0,
    fish: 0,
    lure: 0
  };
  this.focusedInteraction = null;
  this.pointerLocked = false;
  this.nearStorage = false;
  this.nearCrafting = false;
  this.nearWater = false;
  this.fishingState = null;

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

  setCraftingPanelOpen(false);
  refreshInventoryUI(this.inventory);
  refreshStorageUI();
  addCraftLog('Welcome to Lettuce Park! Gather resources, craft tools, and explore the shimmering waters.');
};

PlayerController.prototype.onDestroy = function () {
  this.app.mouse.off(pc.EVENT_MOUSEMOVE, this._mouseMoveHandler);
  this.app.keyboard.off(pc.EVENT_KEYDOWN, this._keyDownHandler);
};

PlayerController.prototype.collectItem = function (itemData, entity) {
  this.inventory[itemData.key]++;
  refreshInventoryUI(this.inventory);
  addCraftLog(`Collected ${itemDefinitions[itemData.key].icon} ${itemData.label}!`);
  entity.enabled = false;
};

PlayerController.prototype.depositAllToStorage = function () {
  if (!this.nearStorage) {
    addCraftLog('Move closer to the 📦 storage crate before depositing items.');
    return;
  }
  let moved = false;
  Object.keys(storageInventory).forEach((key) => {
    if (this.inventory[key] > 0) {
      storageInventory[key] += this.inventory[key];
      this.inventory[key] = 0;
      moved = true;
    }
  });
  if (moved) {
    refreshInventoryUI(this.inventory);
    refreshStorageUI();
    addCraftLog('You neatly stored your supplies inside the 📦 crate.');
  } else {
    addCraftLog('Nothing to deposit right now. Time to gather more goods!');
  }
};

PlayerController.prototype.withdrawFromStorage = function () {
  if (!this.nearStorage) {
    addCraftLog('Stand by the 📦 storage crate to withdraw items.');
    return;
  }
  const availableKeys = Object.keys(storageInventory).filter((key) => storageInventory[key] > 0);
  if (availableKeys.length === 0) {
    addCraftLog('Storage is empty. Explore the park for more resources!');
    return;
  }
  const key = availableKeys.sort((a, b) => storageInventory[b] - storageInventory[a])[0];
  storageInventory[key]--;
  this.inventory[key] = (this.inventory[key] || 0) + 1;
  refreshInventoryUI(this.inventory);
  refreshStorageUI();
  addCraftLog(`You retrieved 1 ${itemDefinitions[key].icon} from the storage crate.`);
};

PlayerController.prototype.sortStorage = function () {
  if (!this.nearStorage) {
    addCraftLog('Sorting only works when you are beside the storage crate.');
    return;
  }
  const hasItems = Object.values(storageInventory).some((value) => value > 0);
  if (!hasItems) {
    addCraftLog('Nothing to sort just yet. Gather more to tidy later.');
    return;
  }
  storageSortMode = !storageSortMode;
  refreshStorageUI();
  addCraftLog(
    storageSortMode
      ? 'Storage sorted by abundance. Everything feels organized!'
      : 'Storage reverted to its natural order.'
  );
};

PlayerController.prototype.tryCraftRecipe = function (key) {
  const recipe = recipes[key];
  if (!recipe) {
    return;
  }
  if (key !== 'salad' && key !== 'lure' && !this.nearCrafting) {
    addCraftLog('Approach the crafting crate 🧰 to assemble complex creations.');
    return;
  }
  const canCraft = Object.entries(recipe.requirements).every(([itemKey, amount]) => this.inventory[itemKey] >= amount);
  if (!canCraft) {
    addCraftLog(`You need more ingredients to craft ${recipe.label}.`);
    return;
  }
  Object.entries(recipe.requirements).forEach(([itemKey, amount]) => {
    this.inventory[itemKey] -= amount;
  });
  recipe.onCraft(this);
  refreshInventoryUI(this.inventory);
};

PlayerController.prototype.startFishing = function (spotData) {
  if (this.fishingState) {
    addCraftLog('You are already fishing. Stay patient!');
    return;
  }
  if (spotData.requiresLure && this.inventory.lure <= 0) {
    addCraftLog('You need a 🎣 River Lure equipped before casting here.');
    return;
  }
  if (spotData.requiresLure) {
    this.inventory.lure--;
    refreshInventoryUI(this.inventory);
    addCraftLog('You tie a lure to your line and cast it into the shimmering water.');
  } else {
    addCraftLog('You cast your line into the gentle ripples.');
  }
  this.fishingState = {
    duration: 2.5 + Math.random() * 2.5,
    timer: 0,
    difficulty: spotData.difficulty || 1,
    reward: spotData.reward || 'fish'
  };
  fishingStatusEl.textContent = '🎣 Waiting for a bite...';
};

PlayerController.prototype.updateFishing = function (dt) {
  if (!this.fishingState) {
    return;
  }
  this.fishingState.timer += dt;
  const progress = Math.min(1, this.fishingState.timer / this.fishingState.duration);
  const dots = '.'.repeat(1 + Math.floor(progress * 3));
  fishingStatusEl.textContent = `🎣 Reeling${dots}`;
  if (this.fishingState.timer >= this.fishingState.duration) {
    const successChance = 0.6 - this.fishingState.difficulty * 0.05 + Math.random() * 0.5;
    if (successChance > 0.4) {
      this.inventory[this.fishingState.reward] = (this.inventory[this.fishingState.reward] || 0) + 1;
      refreshInventoryUI(this.inventory);
      addCraftLog(`Success! You caught a ${itemDefinitions[this.fishingState.reward].icon} from the water.`);
    } else {
      addCraftLog('The fish slipped away. Maybe try again with a better lure.');
    }
    fishingStatusEl.textContent = '';
    this.fishingState = null;
  }
};

PlayerController.prototype.cancelFishing = function () {
  if (!this.fishingState) {
    return;
  }
  fishingStatusEl.textContent = '';
  addCraftLog('You reel in early, deciding to try again later.');
  this.fishingState = null;
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
    toggleCraftingPanel();
    event.event.preventDefault();
  }
  if (event.key === pc.KEY_ESCAPE) {
    this.cancelFishing();
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
    if (dist < 4 && dist < nearestDistance) {
      nearest = entity;
      nearestDistance = dist;
    }
  }

  this.nearStorage = false;
  this.nearCrafting = false;
  this.nearWater = false;

  if (nearest) {
    this.focusedInteraction = nearest;
    if (nearest.tags && nearest.tags.has('storage')) {
      this.nearStorage = true;
    }
    if (nearest.tags && nearest.tags.has('crafting')) {
      this.nearCrafting = true;
    }
    if (nearest.tags && nearest.tags.has('water')) {
      this.nearWater = true;
    }
    const prompt = nearest.interaction.getPrompt
      ? nearest.interaction.getPrompt(this)
      : nearest.interaction.prompt || 'Press E to interact';
    setPrompt(prompt);
  } else {
    this.focusedInteraction = null;
    setPrompt('');
  }

  this.updateFishing(dt);
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

const WaterSurface = pc.createScript('waterSurface');
WaterSurface.attributes.add('amplitude', { type: 'number', default: 0.05 });
WaterSurface.attributes.add('speed', { type: 'number', default: 0.35 });
WaterSurface.prototype.initialize = function () {
  this.time = Math.random() * 10;
  const renderComponent = this.entity.render;
  this.material = renderComponent.material || renderComponent.meshInstances[0].material;
  this.baseEmissive = this.material.emissive.clone();
  this.offset = this.material.diffuseMapOffset ? this.material.diffuseMapOffset.clone() : new pc.Vec2();
};
WaterSurface.prototype.update = function (dt) {
  this.time += dt * this.speed;
  const wave = (Math.sin(this.time) + Math.cos(this.time * 0.5)) * 0.5 * this.amplitude;
  const intensity = pc.math.clamp(1.1 + wave * 3, 0.8, 1.6);
  this.material.emissive = this.baseEmissive.clone().scale(intensity);
  this.offset.set(wave * 2, this.time * 0.03);
  this.material.diffuseMapOffset = this.offset;
  this.material.update();
};

function createGround() {
  const ground = new pc.Entity('ground');
  ground.addComponent('render', { type: 'box', material: groundMaterial });
  ground.setLocalScale(140, 0.2, 140);
  ground.setPosition(0, -0.12, 0);
  app.root.addChild(ground);

  const path = new pc.Entity('path');
  path.addComponent('render', { type: 'plane', material: pathMaterial });
  path.setPosition(0, 0.01, 0);
  path.setLocalScale(11, 11, 1);
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
    shadowDistance: 120,
    normalOffsetBias: 0.02
  });
  light.setEulerAngles(52, 36, 0);
  app.root.addChild(light);

  const fillLight = new pc.Entity('fill');
  fillLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(0.2, 0.28, 0.4),
    intensity: 0.3
  });
  fillLight.setEulerAngles(-28, -120, 0);
  app.root.addChild(fillLight);
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

    const leaves = createLeafCluster(new pc.Vec3(1.5 + Math.random(), 1.2 + Math.random() * 0.6, 1.5 + Math.random()));
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
    const woodPiece = new pc.Entity('woodDrop');
    woodPiece.addComponent('render', { type: 'capsule', material: woodMaterial });
    woodPiece.setLocalScale(0.2, 0.5, 0.2);
    const offset = new pc.Vec3((Math.random() - 0.5) * 1.5, 0.25, (Math.random() - 0.5) * 1.5);
    woodPiece.setPosition(position.x + offset.x, 0.3 + offset.y, position.z + offset.z);
    woodPiece.addComponent('script');
    woodPiece.script.create('spin');
    woodPiece.interaction = {
      prompt: 'Press E to collect 🪵 Timber Logs',
      onInteract(player, entity) {
        player.inventory.wood++;
        refreshInventoryUI(player.inventory);
        addCraftLog('You scooped up a bundle of 🪵 logs.');
        entity.enabled = false;
      }
    };
    registerInteractable(woodPiece);
    app.root.addChild(woodPiece);
  }
}

function populateForest() {
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * 45;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const scale = 0.8 + Math.random() * 1.5;
    createRealisticTree(x, z, scale);
  }
}

function createCollectible(data) {
  const entity = new pc.Entity(data.key);
  entity.addComponent('render', { type: data.meshType, material: data.material });
  entity.setLocalScale(data.scale.x, data.scale.y, data.scale.z);
  entity.setPosition(data.position.x, data.position.y, data.position.z);
  entity.addComponent('script');
  entity.script.create('spin');
  entity.addComponent('collision', {
    type: 'sphere',
    radius: 0.5
  });
  entity.interaction = {
    prompt: `Press E to collect ${data.emoji} ${data.label}`,
    onInteract(player, entityInstance) {
      player.collectItem(data, entityInstance);
    }
  };
  registerInteractable(entity);
  app.root.addChild(entity);
}

function scatterCollectibles() {
  const spawnPoints = [
    new pc.Vec3(3, 0.5, -2),
    new pc.Vec3(-4, 0.5, -6),
    new pc.Vec3(8, 0.5, 4),
    new pc.Vec3(-10, 0.5, 9),
    new pc.Vec3(5, 0.5, 12),
    new pc.Vec3(14, 0.5, -3),
    new pc.Vec3(-16, 0.5, 2),
    new pc.Vec3(18, 0.5, 8)
  ];
  const types = [
    {
      key: 'lettuce',
      label: 'Wild Lettuce',
      emoji: '🥬',
      meshType: 'cone',
      material: lettuceMaterial,
      scale: new pc.Vec3(0.6, 0.8, 0.6)
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
  for (let i = 0; i < 35; i++) {
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

function buildRibbonMesh(points, halfWidth) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let length = 0;
  const up = new pc.Vec3(0, 1, 0);
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    const prev = points[Math.max(0, i - 1)];
    const dir = next.clone().sub(prev).normalize();
    const left = up.clone().cross(dir).normalize();
    const offset = left.scale(halfWidth);
    const leftPoint = current.clone().add(offset);
    const rightPoint = current.clone().sub(offset);
    positions.push(leftPoint.x, leftPoint.y, leftPoint.z);
    positions.push(rightPoint.x, rightPoint.y, rightPoint.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, length);
    uvs.push(1, length);
    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
      const segmentLength = current.distance(points[i + 1]) / (halfWidth * 2);
      length += segmentLength;
    }
  }
  return pc.createMesh(app.graphicsDevice, positions, {
    normals,
    uvs,
    indices
  });
}

function buildLakeMesh(radiusX, radiusZ, segments, rippleHeight = 0.05) {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const noise = 0.8 + Math.random() * 0.35;
    const x = Math.cos(angle) * radiusX * noise;
    const z = Math.sin(angle) * radiusZ * noise;
    const y = Math.sin(angle * 3) * rippleHeight;
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    uvs.push((x / (radiusX * 2)) + 0.5, (z / (radiusZ * 2)) + 0.5);
  }
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }
  indices.push(0, segments + 1, 1);
  return pc.createMesh(app.graphicsDevice, positions, {
    normals,
    uvs,
    indices
  });
}

function createWaterFeatures() {
  const riverPoints = [
    new pc.Vec3(-35, 0.03, -30),
    new pc.Vec3(-28, 0.03, -15),
    new pc.Vec3(-20, 0.03, -5),
    new pc.Vec3(-18, 0.03, 8),
    new pc.Vec3(-22, 0.03, 22),
    new pc.Vec3(-30, 0.03, 34)
  ];
  const riverEntity = new pc.Entity('river');
  const riverMesh = buildRibbonMesh(riverPoints, 3);
  const riverMaterial = createWaterMaterial();
  const riverNode = new pc.GraphNode();
  const riverInstance = new pc.MeshInstance(riverNode, riverMesh, riverMaterial);
  riverInstance.castShadow = false;
  riverEntity.addComponent('render', {
    meshInstances: [riverInstance]
  });
  riverEntity.addComponent('script');
  riverEntity.script.create('waterSurface', { attributes: { amplitude: 0.08, speed: 0.45 } });
  app.root.addChild(riverEntity);

  const lakeEntity = new pc.Entity('lake');
  const lakeMesh = buildLakeMesh(12, 9, 46, 0.04);
  const lakeMaterial = createWaterMaterial();
  const lakeNode = new pc.GraphNode();
  const lakeInstance = new pc.MeshInstance(lakeNode, lakeMesh, lakeMaterial);
  lakeInstance.castShadow = false;
  lakeEntity.addComponent('render', {
    meshInstances: [lakeInstance]
  });
  lakeEntity.setPosition(22, 0.025, 18);
  lakeEntity.addComponent('script');
  lakeEntity.script.create('waterSurface', { attributes: { amplitude: 0.06, speed: 0.32 } });
  app.root.addChild(lakeEntity);

  return { riverPoints, lakePosition: lakeEntity.getPosition().clone() };
}

function createFishingSpot(position, difficulty, requiresLure = false) {
  const spot = new pc.Entity('fishingSpot');
  spot.setPosition(position.x, position.y, position.z);
  const marker = new pc.Entity('fishingMarker');
  marker.addComponent('render', { type: 'cylinder', material: fabricMaterial });
  marker.setLocalScale(0.25, 0.1, 0.25);
  marker.setLocalPosition(0, 0.3, 0);
  marker.addComponent('script');
  marker.script.create('bob');
  spot.addChild(marker);
  spot.interaction = {
    getPrompt(player) {
      const requirement = requiresLure ? ' with a 🎣 lure equipped' : '';
      return `Press E to fish${requirement}`;
    },
    onInteract(player) {
      player.startFishing({ difficulty, reward: 'fish', requiresLure });
    }
  };
  spot.tags.add('water');
  registerInteractable(spot);
  app.root.addChild(spot);
}

function createFishingSpots({ riverPoints, lakePosition }) {
  for (let i = 1; i < riverPoints.length - 1; i++) {
    const point = riverPoints[i];
    createFishingSpot(new pc.Vec3(point.x, point.y + 0.05, point.z), 1 + Math.random() * 1.2, i % 2 === 0);
  }
  createFishingSpot(new pc.Vec3(lakePosition.x + 2.5, lakePosition.y + 0.05, lakePosition.z + 1.5), 0.8, false);
  createFishingSpot(new pc.Vec3(lakePosition.x - 3, lakePosition.y + 0.05, lakePosition.z - 2.2), 1.2, true);
}

function createClouds() {
  for (let i = 0; i < 10; i++) {
    const cloud = new pc.Entity('cloud');
    cloud.addComponent('render', { type: 'box', material: createMaterial('#ffffff', { opacity: 0.85, gloss: 0.5 }) });
    cloud.setLocalScale(6 + Math.random() * 8, 2 + Math.random(), 3 + Math.random() * 4);
    cloud.setPosition(-20 + Math.random() * 40, 22 + Math.random() * 6, -30 + Math.random() * 60);
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
      player.nearStorage = true;
      player.depositAllToStorage();
    }
  };
  crate.tags.add('storage');

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
      return craftingPanelOpen
        ? 'Press E to close the 🧰 crafting bench'
        : 'Press E to open the 🧰 crafting bench';
    },
    onInteract() {
      const willOpen = !craftingPanelOpen;
      setCraftingPanelOpen(willOpen);
      addCraftLog(
        willOpen
          ? 'You open the crafting bench, ready to plan your next build.'
          : 'You close the crafting bench and get back to exploring.'
      );
    }
  };
  crate.tags.add('crafting');

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
  player.setPosition(0, 1.8, 6);
  player.addComponent('script');

  const cameraPivot = new pc.Entity('cameraPivot');
  cameraPivot.setLocalPosition(0, 0, 0);
  player.addChild(cameraPivot);

  const camera = new pc.Entity('camera');
  camera.addComponent('camera', {
    clearColor: new pc.Color(0.52, 0.75, 0.91),
    farClip: 240,
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
  activePlayerController = player.script.playerController;
  return { player, camera };
}

createGround();
createLighting();
populateForest();
createRocks();
const waterData = createWaterFeatures();
createClouds();
scatterCollectibles();
createToolRack();
createStorageCrate();
createCraftingCrate();
createFishingSpots(waterData);
createPlayer();

addCraftLog('Tip: Store extra supplies 📦, tie a 🎣 lure, and fish by the shimmering waters.');
refreshCraftingButtons(activePlayerController ? activePlayerController.inventory : {});

function connectUIEvents() {
  if (!activePlayerController) {
    return;
  }
  inventoryDepositBtn.addEventListener('click', () => {
    activePlayerController.depositAllToStorage();
  });
  storageWithdrawBtn.addEventListener('click', () => {
    activePlayerController.withdrawFromStorage();
  });
  storageSortBtn.addEventListener('click', () => {
    activePlayerController.sortStorage();
  });
  document.querySelectorAll('.craft-button').forEach((button) => {
    button.addEventListener('click', () => {
      activePlayerController.tryCraftRecipe(button.dataset.action);
    });
  });
}

connectUIEvents();
