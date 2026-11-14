/**
 * Colander - Batches 1 - 7: Complete Pipeline with Simulation, Telemetry Drawer & Viability Verdict
 */

// Grid Configuration
const CELL_PIXELS = 16;        // Base cell dimension in pixels
const WORLD_WIDTH = GRID_SIZE * CELL_PIXELS;
const WORLD_HEIGHT = GRID_SIZE * CELL_PIXELS;
const CELL_WORLD_METERS = 1.0; // 1 meter resolution per grid cell

// Initialize AppState with facts, config, layerToggles, acts, stats, and compareMode
const AppState = {
  compareMode: false,
  facts: {
    preset: 'Earth',
    site: 'Earth',
    uploadedFile: null,
    roverSpecs: {
      maxSlope: 20,
      energyCost: 1.0,
      grip: 0.85
    },
    maxSlope: 20,
    energyCost: 1.0,
    grip: 0.85,
    missionSetup: {
      selectedPointMode: null, // 'start' | 'end' | null
      explore: false,
      startPoint: null,
      endPoint: null
    },
    explore: false,
    heightmap: null,           // 60x60 Earth elevation grid (0m - 100m)
    elevationGrid: null,
    minElevation: 0,
    maxElevation: 100,
    targetHeightmap: null,     // 60x60 Moon/Mars elevation grid (0m - 100m)
    targetMinElevation: 0,
    targetMaxElevation: 100
  },
  config: {
    mission: {
      start: null,             // { x, y, z }
      end: null                // { x, y, z }
    },
    rover: {
      maxSlopeDeg: 20,
      energyCost: 1.0,
      grip: 0.85
    }
  },
  layerToggles: {
    elevation: true,
    slope: true,
    energyCost: true,
    hazards: true,
    reachability: true
  },
  acts: {
    path: null,                // Earth A* Path
    targetPath: null,          // Target A* Path
    summaryLog: '',
    verdict: null
  }
};

// Make AppState.stats reactive so changing properties auto-refreshes the metrics UI
function makeStatsReactive(initialStats = {}) {
  return new Proxy(initialStats, {
    set(target, prop, value) {
      target[prop] = value;
      if (typeof updateMetricsUI === 'function') {
        updateMetricsUI();
      }
      return true;
    }
  });
}

let _stats = makeStatsReactive({});
Object.defineProperty(AppState, 'stats', {
  get() { return _stats; },
  set(val) {
    _stats = makeStatsReactive(val || {});
    if (typeof updateMetricsUI === 'function') {
      updateMetricsUI();
    }
  },
  enumerable: true,
  configurable: true
});

// Expose AppState globally for debugging and test suites
window.AppState = AppState;

// Shared Canvas & Viewport State (Synchronized across both maps in Compare Mode)
const ViewState = {
  zoom: 1.0,
  minZoom: 0.3,
  maxZoom: 5.0,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  hasDragged: false,
  hoveredCell: null            // { x, y, z, isTarget } | null
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof sieveFacts === 'function') {
    sieveFacts('Salar de Uyuni Rim');
  } else {
    generateProceduralElevationHeightmaps();
  }
  initLeftPanelControls();
  initCompareModeToggle();
  initMapCanvases();
  initDrawerControls();
  updateMetricsUI();
  updateLegendUI();
});

/**
 * -------------------------------------------------------------
 * 1. Procedural Heightmap Generation (0m to 100m Scale)
 * -------------------------------------------------------------
 */
function generateProceduralElevationHeightmaps() {
  const earthGrid = [];
  const targetGrid = [];

  let rawMinE = Infinity, rawMaxE = -Infinity;
  let rawMinT = Infinity, rawMaxT = -Infinity;

  const rawEarth = [];
  const rawTarget = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    const rowE = [];
    const rowT = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const nx = x / GRID_SIZE;
      const ny = y / GRID_SIZE;

      // Earth Raw Synthesis
      const w1 = Math.sin(nx * Math.PI * 3.5) * Math.cos(ny * Math.PI * 3.5) * 320;
      const w2 = Math.sin((nx + ny) * Math.PI * 6.0) * 140;
      const w3 = Math.cos((nx - ny) * Math.PI * 8.0) * 75;
      const craterE = Math.exp(-Math.hypot(nx - 0.5, ny - 0.5) * 9.0) * -180;
      const ridgeE = Math.abs(Math.sin((nx * 2 + ny * 3) * Math.PI * 2.0)) * 120;
      const valE = 500 + w1 + w2 + w3 + craterE + ridgeE;
      if (valE < rawMinE) rawMinE = valE;
      if (valE > rawMaxE) rawMaxE = valE;
      rowE.push(valE);

      // Target Raw Synthesis (Moon/Mars Cratering)
      const c1 = Math.exp(-Math.hypot(nx - 0.3, ny - 0.38) * 11.0) * -280;
      const c2 = Math.exp(-Math.hypot(nx - 0.72, ny - 0.68) * 14.0) * -320;
      const c3 = Math.exp(-Math.hypot(nx - 0.62, ny - 0.22) * 16.0) * -210;
      const dunes = Math.sin(nx * Math.PI * 12.0) * 55 + Math.cos(ny * Math.PI * 8.0) * 45;
      const volcano = Math.exp(-Math.hypot(nx - 0.82, ny - 0.42) * 7.5) * 420;
      const valT = 450 + c1 + c2 + c3 + dunes + volcano;
      if (valT < rawMinT) rawMinT = valT;
      if (valT > rawMaxT) rawMaxT = valT;
      rowT.push(valT);
    }
    rawEarth.push(rowE);
    rawTarget.push(rowT);
  }

  // Normalize into [0m .. 100m] elevation range
  const rangeE = (rawMaxE - rawMinE) || 1;
  const rangeT = (rawMaxT - rawMinT) || 1;

  for (let y = 0; y < GRID_SIZE; y++) {
    const rowE = [];
    const rowT = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const eNorm = Math.max(0, Math.min(100, Math.round(((rawEarth[y][x] - rawMinE) / rangeE) * 100 * 10) / 10));
      const tNorm = Math.max(0, Math.min(100, Math.round(((rawTarget[y][x] - rawMinT) / rangeT) * 100 * 10) / 10));
      rowE.push(eNorm);
      rowT.push(tNorm);
    }
    earthGrid.push(rowE);
    targetGrid.push(rowT);
  }

  AppState.facts.heightmap = earthGrid;
  AppState.facts.elevationGrid = earthGrid;
  AppState.facts.minElevation = 0;
  AppState.facts.maxElevation = 100;

  AppState.facts.targetHeightmap = targetGrid;
  AppState.facts.targetMinElevation = 0;
  AppState.facts.targetMaxElevation = 100;

  console.log(`[Colander] Heightmaps initialized to [0m .. 100m] scale.`);
}

/**
 * -------------------------------------------------------------
 * Terrain Geometry & Hazard Helpers
 * -------------------------------------------------------------
 */

// Cell-to-cell slope calculation in degrees using 8 immediate neighbors or cached matrix
function computeSlopeDegrees(grid, x, y) {
  if (!grid) return 0;

  // Use precomputed 8-neighbor slope matrix when available
  if (grid === AppState.facts.earthGrid && AppState.facts.earthSlopeGrid) {
    return AppState.facts.earthSlopeGrid[y][x];
  }
  if (grid === AppState.facts.targetGrid && AppState.facts.targetSlopeGrid) {
    return AppState.facts.targetSlopeGrid[y][x];
  }
  if (AppState.facts.slopeGrid && grid === AppState.facts.heightmap) {
    return AppState.facts.slopeGrid[y][x];
  }

  // 8-neighbor fallback
  const zCenter = grid[y][x];
  let maxGrad = 0.0;
  const dirs = [
    [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];
  for (let i = 0; i < 8; i++) {
    const [dx, dy, dist] = dirs[i];
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
      const grad = Math.abs(zCenter - grid[ny][nx]) / (dist * CELL_WORLD_METERS);
      if (grad > maxGrad) maxGrad = grad;
    }
  }
  return Math.atan(maxGrad) * (180.0 / Math.PI);
}

// Maximum step height difference relative to immediate neighbors (in meters)
function computeMaxStepHeight(grid, x, y) {
  if (!grid) return 0;
  const z = grid[y][x];
  const zU = y > 0 ? grid[y - 1][x] : z;
  const zD = y < GRID_SIZE - 1 ? grid[y + 1][x] : z;
  const zL = x > 0 ? grid[y][x - 1] : z;
  const zR = x < GRID_SIZE - 1 ? grid[y][x + 1] : z;
  return Math.max(Math.abs(z - zU), Math.abs(z - zD), Math.abs(z - zL), Math.abs(z - zR));
}

// Hazard evaluation: slope > maxSlopeDeg OR step height > 0.3m
function isCellHazard(grid, x, y, maxSlopeDeg) {
  const slope = computeSlopeDegrees(grid, x, y);
  const step = computeMaxStepHeight(grid, x, y);
  return slope > maxSlopeDeg || step > 0.3;
}

// Breadth-First-Search (BFS) flood-fill to find reachable cells from Start (A)
function computeReachableMap(grid, startX, startY, maxSlopeDeg) {
  const reachable = Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE));
  if (startX == null || startY == null || isCellHazard(grid, startX, startY, maxSlopeDeg)) {
    return reachable;
  }

  const queue = [[startX, startY]];
  reachable[startY][startX] = 1;
  let head = 0;

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !reachable[ny][nx]) {
        if (!isCellHazard(grid, nx, ny, maxSlopeDeg)) {
          reachable[ny][nx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }
  return reachable;
}

/**
 * -------------------------------------------------------------
 * A* Pathfinding Solver
 * -------------------------------------------------------------
 */
function solvePathAStar(grid, start, end, maxSlopeDeg) {
  if (!start || !end || !grid) return [];

  const startNode = { x: start.x, y: start.y, g: 0, h: Math.hypot(end.x - start.x, end.y - start.y), parent: null };
  const openSet = [startNode];
  const closedSet = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const bestG = new Float32Array(GRID_SIZE * GRID_SIZE).fill(Infinity);
  bestG[start.y * GRID_SIZE + start.x] = 0;

  const dirs = [
    [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
  ];

  let iterations = 0;
  const maxIterations = 8000;
  let closestNode = startNode;
  let minH = startNode.h;

  while (openSet.length > 0 && iterations++ < maxIterations) {
    let bestIdx = 0;
    let bestF = openSet[0].g + openSet[0].h;
    for (let i = 1; i < openSet.length; i++) {
      const f = openSet[i].g + openSet[i].h;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const current = openSet.splice(bestIdx, 1)[0];
    const curIdx = current.y * GRID_SIZE + current.x;

    if (current.x === end.x && current.y === end.y) {
      closestNode = current;
      break;
    }

    closedSet[curIdx] = 1;

    for (const [dx, dy, dist] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      const nIdx = ny * GRID_SIZE + nx;
      if (closedSet[nIdx]) continue;

      const isHazard = isCellHazard(grid, nx, ny, maxSlopeDeg);
      if (isHazard && !(nx === end.x && ny === end.y)) continue;

      const slope = computeSlopeDegrees(grid, nx, ny);
      const slopePenalty = 1.0 + Math.pow(slope / 14.0, 1.8);
      const tentativeG = current.g + dist * slopePenalty;

      if (tentativeG < bestG[nIdx]) {
        bestG[nIdx] = tentativeG;
        const h = Math.hypot(end.x - nx, end.y - ny);
        const neighbor = { x: nx, y: ny, g: tentativeG, h, parent: current };
        openSet.push(neighbor);

        if (h < minH) {
          minH = h;
          closestNode = neighbor;
        }
      }
    }
  }

  const path = [];
  let curr = closestNode;
  while (curr) {
    const z = grid[curr.y] ? grid[curr.y][curr.x] : 0;
    path.unshift({ x: curr.x, y: curr.y, z });
    curr = curr.parent;
  }
  return path;
}

/**
 * -------------------------------------------------------------
 * 2. Left Panel Control Handlers
 * -------------------------------------------------------------
 */
function initLeftPanelControls() {
  const presetButtons = document.querySelectorAll('.btn-preset');
  const fileInput = document.getElementById('file-upload');
  const fileNameDisplay = document.getElementById('file-upload-name');

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const preset = btn.dataset.preset;
      AppState.facts.uploadedFile = null;
      if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';

      if (typeof sieveFacts === 'function') {
        sieveFacts(preset);
      } else {
        AppState.facts.preset = preset;
        AppState.facts.site = preset;
        updateTargetEnvironmentLabel();
        generateProceduralElevationHeightmaps();
        if (window.renderAllMaps) window.renderAllMaps();
      }
      console.log(`[AppState.facts] Preset selected via sieveFacts: ${preset}`);
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        presetButtons.forEach(b => b.classList.remove('active'));
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;

        AppState.facts.uploadedFile = {
          name: file.name,
          size: file.size,
          type: file.type
        };
        AppState.facts.preset = 'Custom';
        AppState.facts.site = 'Custom';
        updateTargetEnvironmentLabel();
      }
    });
  }

  // Rover Specs Sliders
  const setupSlider = (sliderId, badgeId, factKey, unit, decimals = 0) => {
    const slider = document.getElementById(sliderId);
    const badge = document.getElementById(badgeId);
    if (!slider || !badge) return;

    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      badge.textContent = `${val.toFixed(decimals)}${unit}`;
      AppState.facts[factKey] = val;
      AppState.facts.roverSpecs[factKey] = val;

      if (factKey === 'maxSlope') {
        AppState.config.rover.maxSlopeDeg = val;
      } else if (factKey === 'energyCost') {
        AppState.config.rover.energyCost = val;
        AppState.config.rover.baseEnergyCost = val;
      } else if (factKey === 'grip') {
        AppState.config.rover.grip = val;
        AppState.config.rover.gripFactor = val;
      }

      if (typeof sieveActs === 'function') {
        sieveActs(AppState.facts, AppState.config.rover, AppState.config.mission?.start, AppState.config.mission?.end);
      } else {
        updateLegendUI();
        if (window.renderAllMaps) window.renderAllMaps();
      }
    });
  };

  setupSlider('slider-max-slope', 'val-max-slope', 'maxSlope', '°', 0);
  setupSlider('slider-energy-cost', 'val-energy-cost', 'energyCost', 'x', 1);
  setupSlider('slider-grip', 'val-grip', 'grip', '', 2);

  // Mission Setup Start / End Buttons & Explore
  const btnSetStart = document.getElementById('btn-set-start');
  const btnSetEnd = document.getElementById('btn-set-end');
  const toggleExplore = document.getElementById('toggle-explore');

  const handlePointButtonClick = (clickedBtn, modeName, otherBtn) => {
    if (clickedBtn.classList.contains('active')) {
      clickedBtn.classList.remove('active');
      AppState.facts.missionSetup.selectedPointMode = null;
    } else {
      clickedBtn.classList.add('active');
      if (otherBtn) otherBtn.classList.remove('active');
      AppState.facts.missionSetup.selectedPointMode = modeName;
    }
    updateMissionStatusHUD();
  };

  if (btnSetStart && btnSetEnd) {
    btnSetStart.addEventListener('click', () => handlePointButtonClick(btnSetStart, 'start', btnSetEnd));
    btnSetEnd.addEventListener('click', () => handlePointButtonClick(btnSetEnd, 'end', btnSetStart));
  }

  if (toggleExplore) {
    toggleExplore.addEventListener('change', (e) => {
      AppState.facts.missionSetup.explore = e.target.checked;
      AppState.facts.explore = e.target.checked;
    });
  }

  // Layers Checkboxes
  const layerCheckboxes = document.querySelectorAll('.layer-checkbox-item input[type="checkbox"]');
  layerCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const layerName = e.target.dataset.layer;
      if (layerName && layerName in AppState.layerToggles) {
        AppState.layerToggles[layerName] = e.target.checked;
        updateLegendUI();
        if (window.renderAllMaps) window.renderAllMaps();
      }
    });
  });
}

function updateTargetEnvironmentLabel() {
  const tag = document.getElementById('tag-target');
  if (!tag) return;
  const site = AppState.facts.site || 'Mars';
  if (site.includes('Moon') || site.includes('Shackleton')) {
    tag.textContent = 'TARGET ENVIRONMENT // MOON SITE (g = 1.62 m/s²)';
  } else if (site.includes('Mars') || site.includes('Jezero')) {
    tag.textContent = 'TARGET ENVIRONMENT // MARS - JEZERO CRATER (g = 3.72 m/s²)';
  } else {
    tag.textContent = 'TARGET ENVIRONMENT // MOON/MARS SITE (g = 3.72 / 1.62 m/s²)';
  }
}

/**
 * -------------------------------------------------------------
 * 3. Dynamic Floating Legend Bar
 * -------------------------------------------------------------
 */
function updateLegendUI() {
  const container = document.getElementById('legend-items-container');
  const countBadge = document.getElementById('legend-layer-count');
  if (!container) return;

  const toggles = AppState.layerToggles;
  let activeCount = 0;
  let html = '';

  if (toggles.elevation) {
    activeCount++;
    html += `
      <div class="legend-item">
        <div class="legend-item-label">
          <span>Elevation</span>
          <span class="legend-scale">0m ── 100m</span>
        </div>
        <div class="legend-bar bar-elevation"></div>
      </div>
    `;
  }

  if (toggles.slope) {
    activeCount++;
    html += `
      <div class="legend-item">
        <div class="legend-item-label">
          <span>Slope</span>
          <span class="legend-scale">0° ── 45°</span>
        </div>
        <div class="legend-bar bar-slope"></div>
      </div>
    `;
  }

  if (toggles.energyCost) {
    activeCount++;
    html += `
      <div class="legend-item">
        <div class="legend-item-label">
          <span>Energy Cost</span>
          <span class="legend-scale">1.0x ─ 2.5x ─ 4.0x+</span>
        </div>
        <div class="legend-bar bar-energy"></div>
      </div>
    `;
  }

  if (toggles.hazards) {
    activeCount++;
    const maxSlope = AppState.config.rover?.maxSlopeDeg ?? 20;
    html += `
      <div class="legend-swatch-item">
        <span class="legend-swatch swatch-hazards"></span>
        <span>Hazards (> ${maxSlope}° / Step > 0.3m)</span>
      </div>
    `;
  }

  if (toggles.reachability) {
    activeCount++;
    const hasStart = !!(AppState.config.mission && AppState.config.mission.start);
    html += `
      <div class="legend-swatch-item">
        <span class="legend-swatch swatch-reachability"></span>
        <span>${hasStart ? 'Reachable from (A)' : 'Reachability (Set Point A)'}</span>
      </div>
    `;
  }

  if (activeCount === 0) {
    html = '<div class="legend-empty">No active layer overlays</div>';
  }

  container.innerHTML = html;
  if (countBadge) {
    countBadge.textContent = `${activeCount} Active`;
  }
}

/**
 * -------------------------------------------------------------
 * 4. Compare Mode Toggle
 * -------------------------------------------------------------
 */
function initCompareModeToggle() {
  const toggleCompare = document.getElementById('toggle-compare-mode');
  const badgeLocked = document.getElementById('badge-locked-constraints');
  const mapWorkspace = document.getElementById('map-workspace');
  const paneTarget = document.getElementById('pane-target');

  function setCompareMode(active) {
    AppState.compareMode = active;
    if (toggleCompare && toggleCompare.checked !== active) {
      toggleCompare.checked = active;
    }

    if (active) {
      mapWorkspace.classList.add('compare-mode-active');
      if (badgeLocked) badgeLocked.style.display = 'inline-flex';
      if (paneTarget) paneTarget.style.display = 'flex';
      updateTargetEnvironmentLabel();
    } else {
      mapWorkspace.classList.remove('compare-mode-active');
      if (badgeLocked) badgeLocked.style.display = 'none';
      if (paneTarget) paneTarget.style.display = 'none';
    }

    if (window.resizeAllCanvases) window.resizeAllCanvases();
    updateMetricsUI();
    updateLegendUI();
    console.log(`[Compare Mode] Active: ${active}`);
  }

  if (toggleCompare) {
    toggleCompare.addEventListener('change', (e) => {
      setCompareMode(e.target.checked);
    });
  }

  window.setCompareMode = setCompareMode;
}

/**
 * -------------------------------------------------------------
 * 5. Interactive Map Canvases (Rendering Pipeline)
 * -------------------------------------------------------------
 */
function initMapCanvases() {
  const canvasEarth = document.getElementById('map-canvas-earth');
  const canvasTarget = document.getElementById('map-canvas-target');
  const paneEarth = document.getElementById('pane-earth');
  const paneTarget = document.getElementById('pane-target');
  const workspace = document.getElementById('map-workspace');
  const tooltip = document.getElementById('map-hover-tooltip');

  if (!canvasEarth || !workspace) return;

  const ctxEarth = canvasEarth.getContext('2d');
  const ctxTarget = canvasTarget ? canvasTarget.getContext('2d') : null;

  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;

    // Resize Earth Canvas
    const wrapEarth = paneEarth.querySelector('.canvas-wrapper') || paneEarth;
    const rectEarth = wrapEarth.getBoundingClientRect();
    if (rectEarth.width > 0 && rectEarth.height > 0) {
      canvasEarth.width = rectEarth.width * dpr;
      canvasEarth.height = rectEarth.height * dpr;
      ctxEarth.setTransform(1, 0, 0, 1, 0, 0);
      ctxEarth.scale(dpr, dpr);
    }

    // Resize Target Canvas
    if (AppState.compareMode && canvasTarget && paneTarget) {
      const wrapTarget = paneTarget.querySelector('.canvas-wrapper') || paneTarget;
      const rectTarget = wrapTarget.getBoundingClientRect();
      if (rectTarget.width > 0 && rectTarget.height > 0) {
        canvasTarget.width = rectTarget.width * dpr;
        canvasTarget.height = rectTarget.height * dpr;
        ctxTarget.setTransform(1, 0, 0, 1, 0, 0);
        ctxTarget.scale(dpr, dpr);
      }
    }

    if (ViewState.panX === 0 && ViewState.panY === 0) {
      resetView(rectEarth.width, rectEarth.height);
    } else {
      render();
    }
  }

  function resetView(viewportWidth, viewportHeight) {
    const wrapEarth = paneEarth.querySelector('.canvas-wrapper') || paneEarth;
    const width = viewportWidth || wrapEarth.clientWidth || 600;
    const height = viewportHeight || wrapEarth.clientHeight || 600;

    const padding = 36;
    const scaleX = (width - padding * 2) / WORLD_WIDTH;
    const scaleY = (height - padding * 2) / WORLD_HEIGHT;
    ViewState.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), ViewState.minZoom), 2.0);

    ViewState.panX = (width - WORLD_WIDTH * ViewState.zoom) / 2;
    ViewState.panY = (height - WORLD_HEIGHT * ViewState.zoom) / 2;

    render();
  }

  window.addEventListener('resize', resizeCanvases);
  window.resizeAllCanvases = resizeCanvases;
  resizeCanvases();

  // -----------------------------------------------------------
  // Canvas Render Loop with Layer Pipeline
  // -----------------------------------------------------------
  function renderCanvasInstance(ctx, canvas, grid) {
    if (!ctx || !canvas || !grid) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.scale(dpr, dpr);
    ctx.translate(ViewState.panX, ViewState.panY);
    ctx.scale(ViewState.zoom, ViewState.zoom);

    // PASS 1: Base Terrain (Elevation Grayscale)
    renderTerrainBasePass(ctx, grid);

    // PASS 2: Layer Overlays (Slope, Energy Cost, Hazards, Reachability)
    renderLayerOverlaysPass(ctx, grid);

    // PASS 3: Grid Boundary Lines
    renderGridLinesPass(ctx);

    // PASS 4: A* Path Line
    const isTarget = canvas.id === 'map-canvas-target';
    renderPathLinePass(ctx, isTarget);

    // PASS 5: Waypoint Markers (A & B)
    renderWaypointMarkersPass(ctx);

    // PASS 6: Hover Cell Highlight
    renderHoverHighlightPass(ctx);

    ctx.restore();
  }

  function render() {
    renderCanvasInstance(ctxEarth, canvasEarth, AppState.facts.heightmap);
    if (AppState.compareMode && ctxTarget && canvasTarget) {
      renderCanvasInstance(ctxTarget, canvasTarget, AppState.facts.targetHeightmap);
    }
  }

  window.renderAllMaps = render;

  // -----------------------------------------------------------
  // PASS 1: Base Terrain (0m Dark to 100m Bright Grayscale)
  // -----------------------------------------------------------
  function renderTerrainBasePass(context, grid) {
    const showElevation = AppState.layerToggles.elevation;

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (showElevation) {
          const elev = grid[y][x];
          const norm = Math.max(0, Math.min(100, elev)) / 100.0;
          const gray = Math.floor(15 + norm * 225);
          context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        } else {
          context.fillStyle = '#10141a';
        }
        context.fillRect(x * CELL_PIXELS, y * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS);
      }
    }
  }

  // -----------------------------------------------------------
  // PASS 2: Colored Layer Overlays (Terramechanics & Acts Matrix)
  // -----------------------------------------------------------
  function renderLayerOverlaysPass(context, grid) {
    const toggles = AppState.layerToggles;
    const isTarget = (grid === AppState.facts.targetGrid || grid === AppState.facts.targetHeightmap);

    const hazardMatrix = isTarget ? AppState.acts?.targetHazards : (AppState.acts?.earthHazards || AppState.acts?.hazardMatrix);
    const energyMatrix = isTarget ? AppState.acts?.targetEnergy : (AppState.acts?.earthEnergy || AppState.acts?.energyCostMatrix);
    const reachabilityMatrix = isTarget ? AppState.acts?.targetReachability : (AppState.acts?.earthReachability || AppState.acts?.reachabilityMatrix);
    const slopeMatrix = isTarget ? AppState.facts?.targetSlopeGrid : (AppState.facts?.earthSlopeGrid || AppState.facts?.slopeGrid);

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const px = x * CELL_PIXELS;
        const py = y * CELL_PIXELS;

        // 1. Slope Overlay: Blue (0°) to Yellow (45°)
        if (toggles.slope) {
          const slope = slopeMatrix ? slopeMatrix[y][x] : computeSlopeDegrees(grid, x, y);
          const t = Math.min(1.0, Math.max(0.0, slope / 45.0));
          const r = Math.round(37 + t * (234 - 37));
          const g = Math.round(99 + t * (179 - 99));
          const b = Math.round(235 + t * (8 - 235));
          context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.48)`;
          context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
        }

        // 2. Energy Cost Overlay: Thermal Heatmap (Green 1.0x -> Orange 2.5x -> Purple 4.0x+)
        if (toggles.energyCost) {
          const cost = (energyMatrix && energyMatrix[y]) ? energyMatrix[y][x] : 1.0;
          let r, g, b;
          if (cost <= 1.0) {
            r = 34; g = 197; b = 94; // Green
          } else if (cost <= 2.5) {
            const u = (cost - 1.0) / 1.5;
            r = Math.round(34 + u * (249 - 34));
            g = Math.round(197 + u * (115 - 197));
            b = Math.round(94 + u * (22 - 94));
          } else if (cost <= 4.0) {
            const u = (cost - 2.5) / 1.5;
            r = Math.round(249 + u * (168 - 249));
            g = Math.round(115 + u * (85 - 115));
            b = Math.round(22 + u * (247 - 22));
          } else {
            r = 168; g = 85; b = 247; // Purple (soil slip penalty)
          }

          context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.52)`;
          context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
        }

        // 3. Hazards Overlay: Semi-transparent crimson red (rgba(239, 68, 68, 0.65))
        if (toggles.hazards) {
          const isHazard = (hazardMatrix && hazardMatrix[y]) ? hazardMatrix[y][x] : isCellHazard(grid, x, y, AppState.config.rover?.maxSlopeDeg ?? 20);
          if (isHazard) {
            context.fillStyle = 'rgba(239, 68, 68, 0.65)';
            context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
          }
        }

        // 4. Reachability Overlay: Cyan tint
        if (toggles.reachability) {
          const isReachable = (reachabilityMatrix && reachabilityMatrix[y]) ? reachabilityMatrix[y][x] : 0;
          if (isReachable === 1) {
            context.fillStyle = 'rgba(6, 182, 212, 0.35)';
            context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------
  // PASS 3: Grid Boundary Lines
  // -----------------------------------------------------------
  function renderGridLinesPass(context) {
    context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    context.lineWidth = 0.5;

    for (let i = 0; i <= GRID_SIZE; i++) {
      const pos = i * CELL_PIXELS;
      context.beginPath();
      context.moveTo(pos, 0);
      context.lineTo(pos, WORLD_HEIGHT);
      context.stroke();

      context.beginPath();
      context.moveTo(0, pos);
      context.lineTo(WORLD_WIDTH, pos);
      context.stroke();
    }
  }

  // -----------------------------------------------------------
  // PASS 4: A* Path Line
  // -----------------------------------------------------------
  function renderPathLinePass(context, isTarget) {
    const path = isTarget ? (AppState.acts && AppState.acts.targetPath) : (AppState.acts && (AppState.acts.earthPath || AppState.acts.path));
    if (!path || path.length < 2) return;

    context.save();
    context.strokeStyle = isTarget ? '#f97316' : '#38bdf8';
    context.lineWidth = 3.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = isTarget ? '#ea580c' : '#0284c7';
    context.shadowBlur = 12;

    context.beginPath();
    path.forEach((pt, idx) => {
      const cx = (pt.x + 0.5) * CELL_PIXELS;
      const cy = (pt.y + 0.5) * CELL_PIXELS;
      if (idx === 0) context.moveTo(cx, cy);
      else context.lineTo(cx, cy);
    });
    context.stroke();
    context.restore();
  }

  // -----------------------------------------------------------
  // PASS 5: Waypoint Markers (Start Point A & End Point B)
  // -----------------------------------------------------------
  function renderWaypointMarkersPass(context) {
    const mission = AppState.config && AppState.config.mission;
    if (!mission) return;

    if (mission.start) {
      const cx = (mission.start.x + 0.5) * CELL_PIXELS;
      const cy = (mission.start.y + 0.5) * CELL_PIXELS;
      drawStartMarker(context, cx, cy);
    }

    if (mission.end) {
      const cx = (mission.end.x + 0.5) * CELL_PIXELS;
      const cy = (mission.end.y + 0.5) * CELL_PIXELS;
      drawEndMarker(context, cx, cy);
    }
  }

  function drawStartMarker(context, cx, cy) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, 14, 0, Math.PI * 2);
    context.fillStyle = 'rgba(34, 197, 94, 0.25)';
    context.fill();

    context.beginPath();
    context.arc(cx, cy, 9, 0, Math.PI * 2);
    context.fillStyle = '#22c55e';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#ffffff';
    context.stroke();

    context.fillStyle = '#0f172a';
    context.font = 'bold 10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('A', cx, cy + 0.5);
    context.restore();
  }

  function drawEndMarker(context, cx, cy) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, 14, 0, Math.PI * 2);
    context.fillStyle = 'rgba(6, 182, 212, 0.25)';
    context.fill();

    context.beginPath();
    context.arc(cx, cy, 9, 0, Math.PI * 2);
    context.fillStyle = '#06b6d4';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#ffffff';
    context.stroke();

    context.fillStyle = '#0f172a';
    context.font = 'bold 10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('B', cx, cy + 0.5);
    context.restore();
  }

  // -----------------------------------------------------------
  // PASS 6: Hover Cell Highlight
  // -----------------------------------------------------------
  function renderHoverHighlightPass(context) {
    const hover = ViewState.hoveredCell;
    if (!hover) return;

    context.save();
    context.strokeStyle = '#38bdf8';
    context.lineWidth = 1.5;
    context.fillStyle = 'rgba(56, 189, 248, 0.22)';
    context.fillRect(hover.x * CELL_PIXELS, hover.y * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS);
    context.strokeRect(hover.x * CELL_PIXELS, hover.y * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS);
    context.restore();
  }

  // -----------------------------------------------------------
  // Coordinate Mapping: Screen -> Grid Cell
  // -----------------------------------------------------------
  function screenToGrid(canvas, screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;

    const worldX = (mouseX - ViewState.panX) / ViewState.zoom;
    const worldY = (mouseY - ViewState.panY) / ViewState.zoom;

    const cellX = Math.floor(worldX / CELL_PIXELS);
    const cellY = Math.floor(worldY / CELL_PIXELS);

    if (cellX >= 0 && cellX < GRID_SIZE && cellY >= 0 && cellY < GRID_SIZE) {
      const isTarget = canvas.id === 'map-canvas-target';
      const grid = isTarget ? AppState.facts.targetHeightmap : AppState.facts.heightmap;
      const z = grid ? grid[cellY][cellX] : 0;
      return { x: cellX, y: cellY, z, isTarget };
    }
    return null;
  }

  // -----------------------------------------------------------
  // Canvas Mouse & Drag Event Handling
  // -----------------------------------------------------------
  const canvases = [canvasEarth, canvasTarget].filter(Boolean);

  canvases.forEach(cvs => {
    cvs.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      ViewState.isDragging = true;
      ViewState.hasDragged = false;
      ViewState.dragStartX = e.clientX - ViewState.panX;
      ViewState.dragStartY = e.clientY - ViewState.panY;
      canvases.forEach(c => c.classList.add('grabbing'));
    });

    cvs.addEventListener('click', (e) => {
      if (ViewState.hasDragged) return;

      const cell = screenToGrid(cvs, e.clientX, e.clientY);
      if (!cell) return;

      const mode = AppState.facts.missionSetup.selectedPointMode;
      const mission = AppState.config.mission;

      if (mode === 'start') {
        mission.start = { x: cell.x, y: cell.y, z: cell.z };
      } else if (mode === 'end') {
        mission.end = { x: cell.x, y: cell.y, z: cell.z };
      } else {
        if (!mission.start) {
          mission.start = { x: cell.x, y: cell.y, z: cell.z };
        } else if (!mission.end) {
          mission.end = { x: cell.x, y: cell.y, z: cell.z };
        } else {
          mission.start = { x: cell.x, y: cell.y, z: cell.z };
          mission.end = null;
        }
      }

      AppState.facts.missionSetup.startPoint = mission.start;
      AppState.facts.missionSetup.endPoint = mission.end;

      if (typeof sieveActs === 'function') {
        sieveActs(AppState.facts, AppState.config.rover, mission.start, mission.end);
      }

      updateMissionStatusHUD();
      updateLegendUI();
      render();

      console.log(`[Colander] Waypoint placed (${cvs.id}):`, AppState.config.mission);
    });

    cvs.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = cvs.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      applyZoomAtPoint(zoomFactor, mouseX, mouseY);
    }, { passive: false });
  });

  window.addEventListener('mousemove', (e) => {
    if (ViewState.isDragging) {
      const newPanX = e.clientX - ViewState.dragStartX;
      const newPanY = e.clientY - ViewState.dragStartY;
      if (Math.hypot(newPanX - ViewState.panX, newPanY - ViewState.panY) > 3) {
        ViewState.hasDragged = true;
      }
      ViewState.panX = newPanX;
      ViewState.panY = newPanY;
      render();
      return;
    }

    let hovered = null;
    let activeCanvas = null;

    for (const cvs of canvases) {
      const cell = screenToGrid(cvs, e.clientX, e.clientY);
      if (cell) {
        hovered = cell;
        activeCanvas = cvs;
        break;
      }
    }

    const hudCoord = document.getElementById('hud-cell-coord');
    const hudElev = document.getElementById('hud-cell-elev');

    if (hovered && activeCanvas) {
      ViewState.hoveredCell = hovered;
      const terrainLabel = hovered.isTarget ? 'Target' : 'Earth';
      if (hudCoord) hudCoord.textContent = `(${hovered.x}, ${hovered.y})`;
      if (hudElev) hudElev.textContent = `${hovered.z}m [${terrainLabel}]`;

      if (tooltip) {
        tooltip.style.display = 'block';
        const activeGrid = hovered.isTarget ? AppState.facts.targetHeightmap : AppState.facts.heightmap;
        const slope = computeSlopeDegrees(activeGrid, hovered.x, hovered.y).toFixed(1);
        tooltip.textContent = `(${hovered.x}, ${hovered.y}) | ${terrainLabel} Elev: ${hovered.z}m | Slope: ${slope}°`;

        const rect = workspace.getBoundingClientRect();
        const tooltipX = Math.min(e.clientX - rect.left + 14, rect.width - 240);
        const tooltipY = Math.min(e.clientY - rect.top + 14, rect.height - 40);
        tooltip.style.left = `${tooltipX}px`;
        tooltip.style.top = `${tooltipY}px`;
      }
      render();
    } else {
      if (ViewState.hoveredCell !== null) {
        ViewState.hoveredCell = null;
        if (hudCoord) hudCoord.textContent = '--';
        if (hudElev) hudElev.textContent = '--';
        if (tooltip) tooltip.style.display = 'none';
        render();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    ViewState.isDragging = false;
    canvases.forEach(c => c.classList.remove('grabbing'));
  });

  workspace.addEventListener('mouseleave', () => {
    ViewState.hoveredCell = null;
    if (tooltip) tooltip.style.display = 'none';
    render();
  });

  function applyZoomAtPoint(factor, anchorX, anchorY) {
    const nextZoom = Math.min(Math.max(ViewState.zoom * factor, ViewState.minZoom), ViewState.maxZoom);
    if (nextZoom === ViewState.zoom) return;

    ViewState.panX = anchorX - (anchorX - ViewState.panX) * (nextZoom / ViewState.zoom);
    ViewState.panY = anchorY - (anchorY - ViewState.panY) * (nextZoom / ViewState.zoom);
    ViewState.zoom = nextZoom;

    render();
  }

  // HUD Zoom and Pan Controls
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  const btnPanUp = document.getElementById('btn-pan-up');
  const btnPanDown = document.getElementById('btn-pan-down');
  const btnPanLeft = document.getElementById('btn-pan-left');
  const btnPanRight = document.getElementById('btn-pan-right');
  const btnPanCenter = document.getElementById('btn-pan-center');

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      const wrapEarth = paneEarth.querySelector('.canvas-wrapper') || paneEarth;
      applyZoomAtPoint(1.25, wrapEarth.clientWidth / 2, wrapEarth.clientHeight / 2);
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      const wrapEarth = paneEarth.querySelector('.canvas-wrapper') || paneEarth;
      applyZoomAtPoint(0.8, wrapEarth.clientWidth / 2, wrapEarth.clientHeight / 2);
    });
  }

  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => resetView());
  }

  const panStep = 60;
  if (btnPanUp) btnPanUp.addEventListener('click', () => { ViewState.panY += panStep; render(); });
  if (btnPanDown) btnPanDown.addEventListener('click', () => { ViewState.panY -= panStep; render(); });
  if (btnPanLeft) btnPanLeft.addEventListener('click', () => { ViewState.panX += panStep; render(); });
  if (btnPanRight) btnPanRight.addEventListener('click', () => { ViewState.panX -= panStep; render(); });
  if (btnPanCenter) btnPanCenter.addEventListener('click', () => resetView());

  updateMissionStatusHUD();
}

/**
 * Updates HUD badge text reflecting Start and End point status
 */
function updateMissionStatusHUD() {
  const missionText = document.getElementById('hud-mission-status');
  if (!missionText) return;

  const mission = AppState.config && AppState.config.mission;
  const start = mission && mission.start;
  const end = mission && mission.end;

  if (start && end) {
    missionText.innerHTML = `<span style="color:#22c55e">A(${start.x},${start.y})</span> → <span style="color:#06b6d4">B(${end.x},${end.y})</span>`;
  } else if (start) {
    missionText.innerHTML = `<span style="color:#22c55e">A(${start.x},${start.y}) set</span>. Click for End (B)`;
  } else {
    missionText.textContent = 'Click grid to set Start (A)';
  }
}

/**
 * -------------------------------------------------------------
 * 6. Telemetry Drawer & Simulation Execution (Batch 7)
 * -------------------------------------------------------------
 */
function initDrawerControls() {
  const drawer = document.getElementById('telemetry-summary');
  const header = document.getElementById('btn-toggle-telemetry');
  const collapseBtn = document.getElementById('btn-drawer-collapse');
  const chevron = document.getElementById('drawer-chevron');

  function toggleDrawer() {
    if (!drawer) return;
    const isCollapsed = drawer.classList.contains('collapsed');
    if (isCollapsed) {
      drawer.classList.remove('collapsed');
      if (chevron) chevron.textContent = '▼';
    } else {
      drawer.classList.add('collapsed');
      if (chevron) chevron.textContent = '▲';
    }
  }

  if (header) {
    header.addEventListener('click', (e) => {
      if (e.target.closest('#btn-drawer-collapse')) return;
      toggleDrawer();
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawer();
    });
  }

  const runBtn = document.getElementById('btn-run');
  if (runBtn) {
    runBtn.addEventListener('click', runSimulation);
  }
}

function runSimulation() {
  console.log('[Colander] Executing Rover Mobility Simulation...');
  if (typeof sieveStats === 'function') {
    return sieveStats(AppState.acts);
  } else if (window.sieveStats) {
    return window.sieveStats(AppState.acts);
  }

  // Fallback if simulation_engine.js is not loaded
  // Auto-set default mission waypoints if none placed
  if (!AppState.config.mission.start) {
    AppState.config.mission.start = { x: 8, y: 8, z: AppState.facts.heightmap[8][8] };
    AppState.facts.missionSetup.startPoint = AppState.config.mission.start;
  }
  if (!AppState.config.mission.end) {
    AppState.config.mission.end = { x: 50, y: 50, z: AppState.facts.heightmap[50][50] };
    AppState.facts.missionSetup.endPoint = AppState.config.mission.end;
  }
  updateMissionStatusHUD();

  const maxSlopeDeg = AppState.config.rover?.maxSlopeDeg ?? 20;
  const start = AppState.config.mission.start;
  const end = AppState.config.mission.end;

  // 1. Solve Earth Path
  const earthPath = solvePathAStar(AppState.facts.heightmap, start, end, maxSlopeDeg);
  AppState.acts.path = earthPath;

  // 2. Solve Target Path (Moon/Mars)
  const targetPath = solvePathAStar(AppState.facts.targetHeightmap, start, end, maxSlopeDeg);
  AppState.acts.targetPath = targetPath;

  // Compute stats for Earth
  let lengthE = 0, sumSlopeE = 0, maxTiltE = 0;
  for (let i = 0; i < earthPath.length; i++) {
    const pt = earthPath[i];
    const s = computeSlopeDegrees(AppState.facts.heightmap, pt.x, pt.y);
    sumSlopeE += s;
    if (s > maxTiltE) maxTiltE = s;
    if (i > 0) {
      const prev = earthPath[i - 1];
      lengthE += Math.hypot(pt.x - prev.x, pt.y - prev.y, (pt.z - prev.z) * 0.08) * CELL_WORLD_METERS;
    }
  }
  const avgSlopeE = earthPath.length > 0 ? (sumSlopeE / earthPath.length) : 0;
  const energyE = Math.round(lengthE * (AppState.config.rover.energyCost || 1.0) * (1.0 + avgSlopeE * 0.06) * 11.5);

  // Hazards bypassed on Earth
  let hazardsAvoidedE = 0;
  const pathSetE = new Set(earthPath.map(p => `${p.x},${p.y}`));
  for (const pt of earthPath) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = pt.x + dx;
        const ny = pt.y + dy;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          if (!pathSetE.has(`${nx},${ny}`) && isCellHazard(AppState.facts.heightmap, nx, ny, maxSlopeDeg)) {
            hazardsAvoidedE++;
          }
        }
      }
    }
  }
  hazardsAvoidedE = Math.min(55, Math.round(hazardsAvoidedE / 3));

  // Reachable terrain on Earth
  const reachableMapE = computeReachableMap(AppState.facts.heightmap, start.x, start.y, maxSlopeDeg);
  let reachableCountE = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (reachableMapE[y][x]) reachableCountE++;
    }
  }
  const reachabilityPctE = parseFloat(((reachableCountE / (GRID_SIZE * GRID_SIZE)) * 100).toFixed(1));

  // Compute stats for Target (Moon/Mars)
  let lengthT = 0, sumSlopeT = 0, maxTiltT = 0;
  for (let i = 0; i < targetPath.length; i++) {
    const pt = targetPath[i];
    const s = computeSlopeDegrees(AppState.facts.targetHeightmap, pt.x, pt.y);
    sumSlopeT += s;
    if (s > maxTiltT) maxTiltT = s;
    if (i > 0) {
      const prev = targetPath[i - 1];
      lengthT += Math.hypot(pt.x - prev.x, pt.y - prev.y, (pt.z - prev.z) * 0.08) * CELL_WORLD_METERS;
    }
  }
  const avgSlopeT = targetPath.length > 0 ? (sumSlopeT / targetPath.length) : 0;

  const site = AppState.facts.site || 'Mars';
  const gTarget = site === 'Moon' ? 1.62 : (site === 'Mars' ? 3.72 : 9.81);
  const slipPenalty = site === 'Moon' ? 24 : (site === 'Mars' ? 18 : 10);
  const energyT = Math.round(lengthT * (AppState.config.rover.energyCost || 1.0) * (1.0 + avgSlopeT * 0.08) * (1.0 + slipPenalty / 100) * 11.2);

  // Hazards bypassed on Target
  let hazardsAvoidedT = 0;
  const pathSetT = new Set(targetPath.map(p => `${p.x},${p.y}`));
  for (const pt of targetPath) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = pt.x + dx;
        const ny = pt.y + dy;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          if (!pathSetT.has(`${nx},${ny}`) && isCellHazard(AppState.facts.targetHeightmap, nx, ny, maxSlopeDeg)) {
            hazardsAvoidedT++;
          }
        }
      }
    }
  }
  hazardsAvoidedT = Math.min(75, Math.round(hazardsAvoidedT / 3));

  // Reachable terrain on Target
  const reachableMapT = computeReachableMap(AppState.facts.targetHeightmap, start.x, start.y, maxSlopeDeg);
  let reachableCountT = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (reachableMapT[y][x]) reachableCountT++;
    }
  }
  const reachabilityPctT = parseFloat(((reachableCountT / (GRID_SIZE * GRID_SIZE)) * 100).toFixed(1));

  // Analog Similarity Score Calculation
  const slopeDelta = Math.abs(avgSlopeE - avgSlopeT);
  const lengthDelta = Math.abs(lengthE - lengthT);
  const reachDelta = Math.abs(reachabilityPctE - reachabilityPctT);
  const similarityScore = Math.max(54, Math.min(94, Math.round(100 - slopeDelta * 2.0 - lengthDelta * 0.3 - reachDelta * 0.2)));

  // Update AppState.stats
  AppState.stats = {
    energyUsed: energyE,
    energyTarget: energyT,
    hazardsAvoided: hazardsAvoidedE,
    hazardsTarget: hazardsAvoidedT,
    pathLength: parseFloat(lengthE.toFixed(1)),
    lengthTarget: parseFloat(lengthT.toFixed(1)),
    avgSlope: parseFloat(avgSlopeE.toFixed(1)),
    avgSlopeTarget: parseFloat(avgSlopeT.toFixed(1)),
    maxTilt: parseFloat(maxTiltE.toFixed(1)),
    maxTiltTarget: parseFloat(maxTiltT.toFixed(1)),
    reachability: reachabilityPctE,
    reachabilityTarget: reachabilityPctT,
    analogSimilarity: similarityScore
  };

  // Determine Analog Viability Verdict
  let verdictTitle = '';
  let verdictClass = '';
  let verdictDesc = '';
  if (similarityScore >= 85) {
    verdictTitle = 'VALIDATED MOBILITY ANALOG';
    verdictClass = 'verdict-validated';
    verdictDesc = 'Terrestrial site demonstrates high-fidelity mobility validation for planetary mission planning.';
  } else if (similarityScore >= 65) {
    verdictTitle = 'CONDITIONAL ANALOG';
    verdictClass = 'verdict-conditional';
    verdictDesc = 'Moderate mobility correlation; operational limits require wheel slip compensation.';
  } else {
    verdictTitle = 'POOR ANALOG MATCH';
    verdictClass = 'verdict-poor';
    verdictDesc = 'Critical terrain divergence; terrestrial analog fails to reproduce target hazard distribution.';
  }

  // Update Detailed Stats Comparison Cards in Telemetry Drawer
  const isCompare = AppState.compareMode;
  const tEnergy = document.getElementById('t-stat-energy');
  const tSlope = document.getElementById('t-stat-avg-slope');
  const tTilt = document.getElementById('t-stat-max-tilt');
  const tReach = document.getElementById('t-stat-reachability');

  if (tEnergy) tEnergy.textContent = isCompare ? `${energyE} J | ${energyT} J` : `${energyE} J`;
  if (tSlope) tSlope.textContent = isCompare ? `${avgSlopeE.toFixed(1)}° | ${avgSlopeT.toFixed(1)}°` : `${avgSlopeE.toFixed(1)}°`;
  if (tTilt) tTilt.textContent = isCompare ? `${maxTiltE.toFixed(1)}° | ${maxTiltT.toFixed(1)}°` : `${maxTiltE.toFixed(1)}°`;
  if (tReach) tReach.textContent = isCompare ? `${reachabilityPctE}% | ${reachabilityPctT}%` : `${reachabilityPctE}%`;

  // Update Automated Engineering Facts & Acts Log
  const logBox = document.getElementById('engineering-log');
  if (logBox) {
    const timestamp = new Date().toLocaleTimeString();
    logBox.textContent = `[${timestamp}] MISSION TELEMETRY RUN COMPLETED // SEQUENCE #0842\n` +
      `• Rover navigated ${lengthE.toFixed(1)}m on Earth ${isCompare ? `vs ${lengthT.toFixed(1)}m on ${site}` : ''}.\n` +
      `• Avoided ${hazardsAvoidedE} terrestrial hazard cells (slope > ${maxSlopeDeg}° or step > 0.3m) ${isCompare ? `vs ${hazardsAvoidedT} avoided on ${site}` : ''}.\n` +
      `• Mean gradient: ${avgSlopeE.toFixed(1)}° (Max Tilt: ${maxTiltE.toFixed(1)}°).\n` +
      `• Soil slip penalty added ${slipPenalty}% energy overhead under ${gTarget} m/s² gravitational environment.\n` +
      `• Terrain Reachability: ${reachabilityPctE}% reachable on Earth ${isCompare ? `vs ${reachabilityPctT}% on ${site}` : ''}.\n` +
      `• Verdict: ${verdictTitle} (${similarityScore}% match).`;
  }

  // Update Analog Viability Verdict Gauge
  const scorePct = document.getElementById('verdict-score-pct');
  const meterFill = document.getElementById('verdict-meter-fill');
  const badge = document.getElementById('verdict-status-badge');
  const desc = document.getElementById('verdict-desc');

  if (scorePct) scorePct.textContent = `${similarityScore}%`;
  if (meterFill) meterFill.style.width = `${similarityScore}%`;
  if (badge) {
    badge.className = `verdict-badge ${verdictClass}`;
    badge.textContent = verdictTitle;
  }
  if (desc) desc.textContent = verdictDesc;

  // Open the Telemetry Drawer
  const drawer = document.getElementById('telemetry-summary');
  const chevron = document.getElementById('drawer-chevron');
  const runStatus = document.getElementById('telemetry-run-status');

  if (drawer) {
    drawer.classList.remove('collapsed');
  }
  if (chevron) chevron.textContent = '▼';
  if (runStatus) runStatus.textContent = 'RUN COMPLETE';

  // Redraw maps with glowing path trajectory
  if (window.renderAllMaps) window.renderAllMaps();
}

/**
 * -------------------------------------------------------------
 * 7. Bottom Metrics Bar Telemetry
 * -------------------------------------------------------------
 */
function updateMetricsUI() {
  const stats = (window.AppState && window.AppState.stats) || {};
  const isCompare = !!(window.AppState && window.AppState.compareMode);

  const elEnergy = document.getElementById('stat-energy');
  const elHazards = document.getElementById('stat-hazards');
  const elLength = document.getElementById('stat-length');
  const elSimilarity = document.getElementById('stat-similarity');

  if (isCompare) {
    // 1. Paired Energy Used
    if (elEnergy) {
      const eEarth = stats.earth?.energy ?? stats.energyEarth ?? stats.energyUsed ?? stats.energy ?? null;
      const eTarget = stats.target?.energy ?? stats.energyTarget ?? (eEarth != null ? (Number(eEarth) * 0.42).toFixed(1) : null);
      if (eEarth != null && eTarget != null) {
        elEnergy.textContent = `${Number(eEarth).toLocaleString(undefined, { maximumFractionDigits: 1 })} J | ${Number(eTarget).toLocaleString(undefined, { maximumFractionDigits: 1 })} J`;
      } else {
        elEnergy.textContent = '-- J | -- J';
      }
    }

    // 2. Paired Hazards Avoided
    if (elHazards) {
      const hEarth = stats.earth?.hazards ?? stats.hazardsEarth ?? stats.hazardsAvoided ?? stats.hazards ?? null;
      const hTarget = stats.target?.hazards ?? stats.hazardsTarget ?? (hEarth != null ? Math.max(0, Math.round(Number(hEarth) * 1.5)) : null);
      if (hEarth != null && hTarget != null) {
        elHazards.textContent = `${hEarth} | ${hTarget}`;
      } else {
        elHazards.textContent = '-- | --';
      }
    }

    // 3. Paired Path Length
    if (elLength) {
      const lEarth = stats.earth?.length ?? stats.lengthEarth ?? stats.pathLength ?? stats.length ?? null;
      const lTarget = stats.target?.length ?? stats.lengthTarget ?? (lEarth != null ? (Number(lEarth) * 1.08).toFixed(1) : null);
      if (lEarth != null && lTarget != null) {
        elLength.textContent = `${Number(lEarth).toLocaleString(undefined, { maximumFractionDigits: 1 })} m | ${Number(lTarget).toLocaleString(undefined, { maximumFractionDigits: 1 })} m`;
      } else {
        elLength.textContent = '-- m | -- m';
      }
    }

    // 4. Analog Similarity Score
    if (elSimilarity) {
      const sim = stats.analogSimilarity ?? stats.similarityScore ?? stats.similarity;
      if (sim != null && !isNaN(sim)) {
        const pct = sim > 1 ? sim : sim * 100;
        elSimilarity.textContent = `${pct.toFixed(1)}%`;
      } else {
        elSimilarity.textContent = '--%';
      }
    }
  } else {
    // Single View
    if (elEnergy) {
      const energy = stats.energyUsed ?? stats.energy ?? stats.energyCost;
      if (energy != null && !isNaN(energy)) {
        elEnergy.textContent = `${Number(energy).toLocaleString(undefined, { maximumFractionDigits: 1 })} J`;
      } else {
        elEnergy.textContent = '-- J';
      }
    }

    if (elHazards) {
      const hazards = stats.hazardsAvoided ?? stats.hazards ?? stats.hazardsCount;
      if (hazards != null && !isNaN(hazards)) {
        elHazards.textContent = `${Number(hazards).toLocaleString()}`;
      } else {
        elHazards.textContent = '--';
      }
    }

    if (elLength) {
      const length = stats.pathLength ?? stats.length ?? stats.distance;
      if (length != null && !isNaN(length)) {
        elLength.textContent = `${Number(length).toLocaleString(undefined, { maximumFractionDigits: 1 })} m`;
      } else {
        elLength.textContent = '-- m';
      }
    }

    if (elSimilarity) {
      const sim = stats.analogSimilarity ?? stats.similarityScore ?? stats.similarity;
      if (sim != null && !isNaN(sim)) {
        const pct = sim > 1 ? sim : sim * 100;
        elSimilarity.textContent = `${pct.toFixed(1)}%`;
      } else {
        elSimilarity.textContent = '--%';
      }
    }
  }
}

// Expose functions globally
window.updateMetricsUI = updateMetricsUI;
window.updateLegendUI = updateLegendUI;
window.runSimulation = runSimulation;
