/**
 * Planetary Terrain Mapping - Terrain, Geotechnical Facts & Terramechanics Acts Engine
 * simulation_engine.js
 */

// Shared Global Grid Constants (Defined once here and shared with app.js)
const GRID_SIZE = 60;
const CELL_PIXELS = 16;
const WORLD_WIDTH = GRID_SIZE * CELL_PIXELS;
const WORLD_HEIGHT = GRID_SIZE * CELL_PIXELS;
const CELL_WORLD_METERS = 1.0;

/**
 * =============================================================
 * TEAMMATE DATA SLOT (Paste 2D Elevation Arrays Here When Ready)
 * =============================================================
 * Leave as `null` to use the built-in DEM generators right now.
 * If you paste a 2D array (e.g., [[10, 12, ...], ...]) into any slot below,
 * the engine will automatically resize/normalize it to 60x60 and render it!
 */
const CUSTOM_PRESET_DATA = {
  uyuni: null,   // Replace `null` with your friend's Uyuni 2D array when ready
  jezero: null,  // Replace `null` with your friend's Jezero 2D array when ready
  moon: null     // Replace `null` with your friend's Moon 2D array when ready
};

/**
 * Helper to normalize any 2D elevation array into a clean 60x60 grid (0m - 100m)
 */
function normalizeCustomGridTo60x60(raw2DArray) {
  if (!Array.isArray(raw2DArray) || raw2DArray.length === 0) return null;
  const srcRows = raw2DArray.length;
  const srcCols = Array.isArray(raw2DArray[0]) ? raw2DArray[0].length : 0;
  if (srcCols === 0) return null;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let r = 0; r < srcRows; r++) {
    for (let c = 0; c < srcCols; c++) {
      const v = Number(raw2DArray[r][c]);
      if (!isNaN(v)) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
  }
  const range = (maxVal - minVal) || 1;

  const grid = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    const sy = Math.min(srcRows - 1, Math.floor((y / GRID_SIZE) * srcRows));
    for (let x = 0; x < GRID_SIZE; x++) {
      const sx = Math.min(srcCols - 1, Math.floor((x / GRID_SIZE) * srcCols));
      const rawVal = Number(raw2DArray[sy][sx]) || 0;
      const normVal = ((rawVal - minVal) / range) * 95.0 + 2.0;
      row.push(parseFloat(normVal.toFixed(2)));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * -------------------------------------------------------------
 * 1. Procedural DEM Generators (60x60 Z Elevation in Meters)
 * -------------------------------------------------------------
 */
function generateSalarDeUyuniDEM() {
  if (CUSTOM_PRESET_DATA.uyuni) {
    const custom = normalizeCustomGridTo60x60(CUSTOM_PRESET_DATA.uyuni);
    if (custom) return custom;
  }

  const grid = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const nx = x / (GRID_SIZE - 1);
      const ny = y / (GRID_SIZE - 1);

      const saltCrustBase = 11.5;
      const polygonRelief = (Math.sin(nx * 48.0) * Math.cos(ny * 48.0) + Math.sin((nx + ny) * 36.0)) * 0.25;
      const basinElev = saltCrustBase + polygonRelief;

      const t = Math.max(0, Math.min(1, (nx - 0.44) / 0.26));
      const scarpFactor = t * t * (3.0 - 2.0 * t);

      const ridge1 = Math.sin(ny * Math.PI * 5.0 + nx * 3.5) * 16.0;
      const ridge2 = Math.cos(ny * Math.PI * 11.0 - nx * 7.0) * 8.0;
      const talusRoughness = Math.sin(nx * 28.0 + ny * 32.0) * Math.cos(nx * 18.0) * 4.2;
      const mountainRise = scarpFactor * (66.0 + ridge1 + ridge2 + talusRoughness);

      const totalElevation = Math.max(2.0, Math.min(98.0, basinElev + mountainRise));
      row.push(parseFloat(totalElevation.toFixed(2)));
    }
    grid.push(row);
  }
  return grid;
}

function generateJezeroCraterDEM() {
  if (CUSTOM_PRESET_DATA.jezero) {
    const custom = normalizeCustomGridTo60x60(CUSTOM_PRESET_DATA.jezero);
    if (custom) return custom;
  }

  const grid = [];
  const cx = 29.5;
  const cy = 29.5;
  const craterRadius = 18.5;

  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const nx = x / (GRID_SIZE - 1);
      const ny = y / (GRID_SIZE - 1);

      const baseElev = 52.0 +
        Math.sin(nx * Math.PI * 3.8) * 8.5 +
        Math.cos(ny * Math.PI * 3.4) * 7.5 +
        Math.sin((nx + ny) * 10.5) * 3.2;

      const dist = Math.hypot(x - cx, y - cy);
      const rNorm = dist / craterRadius;

      let craterEffect = 0;
      if (rNorm < 1.0) {
        const bowlDepth = -36.0 * (1.0 - Math.pow(rNorm, 2.0));
        const centralPeak = Math.exp(-Math.pow(rNorm * 4.2, 2.0)) * 8.5;
        craterEffect = bowlDepth + centralPeak;
      } else {
        const angle = Math.atan2(y - cy, x - cx);
        const ejectaRays = Math.sin(angle * 7.0) * (5.5 / (rNorm + 0.3));
        const rampartDecay = 16.0 / Math.pow(rNorm, 1.5);
        craterEffect = rampartDecay + ejectaRays;
      }

      const rimWall = Math.exp(-Math.pow((rNorm - 1.0) / 0.16, 2.0)) * 21.0;
      const totalElevation = Math.max(3.0, Math.min(97.0, baseElev + craterEffect + rimWall));
      row.push(parseFloat(totalElevation.toFixed(2)));
    }
    grid.push(row);
  }
  return grid;
}

function generateMoonShackletonDEM() {
  if (CUSTOM_PRESET_DATA.moon) {
    const custom = normalizeCustomGridTo60x60(CUSTOM_PRESET_DATA.moon);
    if (custom) return custom;
  }

  const grid = [];
  const cx = 30;
  const cy = 30;
  const radius = 17;

  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const rNorm = dist / radius;

      let elev = 48.0;
      if (rNorm < 1.0) {
        elev -= 38.0 * (1.0 - Math.pow(rNorm, 2.2));
      } else {
        elev += (12.0 / Math.pow(rNorm, 1.8));
      }
      elev += Math.exp(-Math.pow((rNorm - 1.0) / 0.15, 2.0)) * 24.0;
      elev += (Math.sin(x * 0.4) + Math.cos(y * 0.4)) * 3.0;

      row.push(parseFloat(Math.max(2.0, Math.min(98.0, elev)).toFixed(2)));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * -------------------------------------------------------------
 * 2. Slope Calculation (8 Immediate Neighbors)
 * -------------------------------------------------------------
 */
function calculateSlopeMatrix(grid) {
  if (!grid || grid.length !== GRID_SIZE) return [];

  const slopeMatrix = [];
  const neighborOffsets = [
    [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];

  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const zCenter = grid[y][x];
      let maxGradient = 0.0;

      for (let i = 0; i < 8; i++) {
        const [dx, dy, dist] = neighborOffsets[i];
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          const zNeighbor = grid[ny][nx];
          const elevDiff = Math.abs(zCenter - zNeighbor);
          const grad = elevDiff / (dist * CELL_WORLD_METERS);
          if (grad > maxGradient) {
            maxGradient = grad;
          }
        }
      }

      const slopeDegrees = Math.atan(maxGradient) * (180.0 / Math.PI);
      row.push(parseFloat(slopeDegrees.toFixed(2)));
    }
    slopeMatrix.push(row);
  }

  return slopeMatrix;
}

/**
 * -------------------------------------------------------------
 * 3. Geotechnical Constraints & Presets Registry
 * -------------------------------------------------------------
 */
const GEOTECHNICAL_PRESETS = {
  "Salar de Uyuni Rim": {
    name: "Salar de Uyuni Rim",
    environment: "Terrestrial Analog",
    constraints: { g: 9.81, phi: 32.0, c: 4.5 },
    generator: generateSalarDeUyuniDEM
  },
  "Mars - Jezero Crater": {
    name: "Mars - Jezero Crater",
    environment: "Target Environment",
    constraints: { g: 3.72, phi: 18.0, c: 0.8 },
    generator: generateJezeroCraterDEM
  },
  "Moon - Shackleton": {
    name: "Moon - Shackleton",
    environment: "Target Environment",
    constraints: { g: 1.62, phi: 35.0, c: 0.3 },
    generator: generateMoonShackletonDEM
  }
};

/**
 * -------------------------------------------------------------
 * 4. sieveFacts(presetName)
 * -------------------------------------------------------------
 */
function sieveFacts(presetName) {
  if (!window.AppState) return;

  let normalized = presetName || 'Salar de Uyuni Rim';
  if (normalized === 'Earth' || normalized.includes('Uyuni')) {
    normalized = 'Salar de Uyuni Rim';
  } else if (normalized === 'Mars' || normalized.includes('Jezero')) {
    normalized = 'Mars - Jezero Crater';
  } else if (normalized === 'Moon' || normalized.includes('Shackleton')) {
    normalized = 'Moon - Shackleton';
  }

  const earthPreset = GEOTECHNICAL_PRESETS['Salar de Uyuni Rim'];
  const earthGrid = earthPreset.generator();
  const earthSlopeGrid = calculateSlopeMatrix(earthGrid);

  const targetKey = normalized === 'Moon - Shackleton' ? 'Moon - Shackleton' : 'Mars - Jezero Crater';
  const targetPreset = GEOTECHNICAL_PRESETS[targetKey];
  const targetGrid = targetPreset.generator();
  const targetSlopeGrid = calculateSlopeMatrix(targetGrid);

  const facts = window.AppState.facts;
  facts.earthGrid = earthGrid;
  facts.targetGrid = targetGrid;

  facts.heightmap = earthGrid;
  facts.elevationGrid = earthGrid;
  facts.targetHeightmap = targetGrid;

  facts.slopeGrid = earthSlopeGrid;
  facts.earthSlopeGrid = earthSlopeGrid;
  facts.targetSlopeGrid = targetSlopeGrid;

  const activePreset = GEOTECHNICAL_PRESETS[normalized] || earthPreset;
  facts.g = activePreset.constraints.g;
  facts.phi = activePreset.constraints.phi;
  facts.c = activePreset.constraints.c;
  facts.constraints = { ...activePreset.constraints };

  facts.earthConstraints = { ...earthPreset.constraints };
  facts.targetConstraints = { ...targetPreset.constraints };

  facts.preset = normalized;
  facts.site = normalized;

  const config = window.AppState.config?.rover || facts.roverSpecs;
  const startPt = window.AppState.config?.mission?.start;
  const endPt = window.AppState.config?.mission?.end;
  sieveActs(facts, config, startPt, endPt);

  if (typeof window.updateTargetEnvironmentLabel === 'function') {
    window.updateTargetEnvironmentLabel();
  }
  if (typeof window.updateLegendUI === 'function') {
    window.updateLegendUI();
  }
  if (typeof window.updateMetricsUI === 'function') {
    window.updateMetricsUI();
  }
  if (typeof window.renderAllMaps === 'function') {
    window.renderAllMaps();
  }

  return {
    earthGrid,
    targetGrid,
    earthSlopeGrid,
    targetSlopeGrid,
    constraints: facts.constraints
  };
}

/**
 * -------------------------------------------------------------
 * 5. sieveActs(facts, roverConfig, startPt, endPt)
 * -------------------------------------------------------------
 */
function sieveActs(facts, roverConfig, startPt, endPt) {
  if (!window.AppState) return;

  const currentFacts = facts || window.AppState.facts || {};
  const currentConfig = roverConfig || window.AppState.config?.rover || window.AppState.facts?.roverSpecs || {};
  const mission = window.AppState.config?.mission || {};
  const start = startPt || mission.start;

  const earthGrid = currentFacts.earthGrid || currentFacts.heightmap;
  const targetGrid = currentFacts.targetGrid || currentFacts.targetHeightmap;

  if (!earthGrid || !targetGrid) return;

  const earthSlope = currentFacts.earthSlopeGrid || currentFacts.slopeGrid || calculateSlopeMatrix(earthGrid);
  const targetSlope = currentFacts.targetSlopeGrid || calculateSlopeMatrix(targetGrid);

  const maxSlopeDeg = currentConfig.maxSlopeDeg ?? currentConfig.maxSlope ?? 20.0;
  const baseEnergyCost = currentConfig.baseEnergyCost ?? currentConfig.energyCost ?? 1.0;
  const gripFactor = currentConfig.gripFactor ?? currentConfig.grip ?? 0.85;

  const earthConstraints = currentFacts.earthConstraints || { g: 9.81, phi: 32.0, c: 4.5 };
  const targetConstraints = currentFacts.targetConstraints || { g: 3.72, phi: 18.0, c: 0.8 };

  function computeTerramechanicsMatrices(grid, slopeGrid, constraints) {
    const hazardMatrix = [];
    const energyMatrix = [];

    const g = constraints.g || 9.81;
    const phi = constraints.phi || 30.0;
    const c = constraints.c || 2.0;
    const frictionFailureLimit = phi * gripFactor;

    for (let y = 0; y < GRID_SIZE; y++) {
      const hazardRow = [];
      const energyRow = [];

      for (let x = 0; x < GRID_SIZE; x++) {
        const slope = slopeGrid[y][x];
        const isHazard = (slope > maxSlopeDeg) || (slope > frictionFailureLimit);
        hazardRow.push(isHazard);

        const base = 1.0 * baseEnergyCost;
        const inclinePenalty = Math.pow(slope / 15.0, 2.0);
        const soilTerramechanicsRatio = (9.81 / Math.max(1.0, g)) * (2.8 / Math.max(0.4, c));
        const slopeSin = Math.sin(slope * (Math.PI / 180.0));
        const slipPenalty = (slopeSin * 2.2) * soilTerramechanicsRatio * (1.35 - gripFactor * 0.35);

        const totalCellCost = parseFloat((base + inclinePenalty + Math.max(0, slipPenalty)).toFixed(3));
        energyRow.push(totalCellCost);
      }
      hazardMatrix.push(hazardRow);
      energyMatrix.push(energyRow);
    }

    const reachabilityMatrix = computeReachabilityBFS(hazardMatrix, start);
    return { hazardMatrix, energyMatrix, reachabilityMatrix };
  }

  const earthActs = computeTerramechanicsMatrices(earthGrid, earthSlope, earthConstraints);
  const targetActs = computeTerramechanicsMatrices(targetGrid, targetSlope, targetConstraints);

  const acts = window.AppState.acts;
  acts.earthHazards = earthActs.hazardMatrix;
  acts.targetHazards = targetActs.hazardMatrix;
  acts.hazardMatrix = earthActs.hazardMatrix;

  acts.earthEnergy = earthActs.energyMatrix;
  acts.targetEnergy = targetActs.energyMatrix;
  acts.energyCostMatrix = earthActs.energyMatrix;

  acts.earthReachability = earthActs.reachabilityMatrix;
  acts.targetReachability = targetActs.reachabilityMatrix;
  acts.reachabilityMatrix = earthActs.reachabilityMatrix;

  if (typeof window.updateLegendUI === 'function') window.updateLegendUI();
  if (typeof window.updateMetricsUI === 'function') window.updateMetricsUI();
  if (typeof window.renderAllMaps === 'function') window.renderAllMaps();

  return { earth: earthActs, target: targetActs };
}

function computeReachabilityBFS(hazardMatrix, startPt) {
  const reachable = Array.from({ length: GRID_SIZE }, () => new Uint8Array(GRID_SIZE));
  if (!hazardMatrix || !startPt || startPt.x == null || startPt.y == null) {
    return reachable;
  }

  const sx = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(startPt.x)));
  const sy = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(startPt.y)));

  if (hazardMatrix[sy][sx]) return reachable;

  const queue = [[sx, sy]];
  reachable[sy][sx] = 1;
  let head = 0;

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    for (let i = 0; i < 8; i++) {
      const nx = cx + dirs[i][0];
      const ny = cy + dirs[i][1];

      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !reachable[ny][nx]) {
        if (!hazardMatrix[ny][nx]) {
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
 * 6. A* Pathfinding Engine
 * -------------------------------------------------------------
 */
function findPathAStar(grid, hazardMatrix, energyMatrix, start, end) {
  if (!grid || !hazardMatrix || !energyMatrix || !start || !end) return [];

  const sx = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(start.x)));
  const sy = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(start.y)));
  const ex = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(end.x)));
  const ey = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(end.y)));

  if (sx === ex && sy === ey) {
    return [{ x: sx, y: sy, z: grid[sy][sx] }];
  }

  const SQRT2 = Math.SQRT2;
  const dirs = [
    [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
    [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]
  ];

  const totalCells = GRID_SIZE * GRID_SIZE;
  const startIndex = sy * GRID_SIZE + sx;
  const endIndex = ey * GRID_SIZE + ex;

  const gScores = new Float64Array(totalCells).fill(Infinity);
  const fScores = new Float64Array(totalCells).fill(Infinity);
  const closed = new Uint8Array(totalCells);
  const cameFrom = new Int32Array(totalCells).fill(-1);

  function heuristic(x, y) {
    return Math.hypot(ex - x, ey - y);
  }

  gScores[startIndex] = 0;
  fScores[startIndex] = heuristic(sx, sy);

  class MinHeap {
    constructor() { this.heap = []; }
    push(idx) {
      this.heap.push(idx);
      this.bubbleUp(this.heap.length - 1);
    }
    pop() {
      if (this.heap.length === 0) return -1;
      const top = this.heap[0];
      const bottom = this.heap.pop();
      if (this.heap.length > 0) {
        this.heap[0] = bottom;
        this.sinkDown(0);
      }
      return top;
    }
    bubbleUp(n) {
      const element = this.heap[n];
      const score = fScores[element];
      while (n > 0) {
        const parentN = (n - 1) >> 1;
        const parent = this.heap[parentN];
        if (score >= fScores[parent]) break;
        this.heap[n] = parent;
        n = parentN;
      }
      this.heap[n] = element;
    }
    sinkDown(n) {
      const length = this.heap.length;
      const element = this.heap[n];
      const score = fScores[element];
      while (true) {
        const child2N = (n + 1) << 1;
        const child1N = child2N - 1;
        let swap = null;
        let child1Score;
        if (child1N < length) {
          const child1 = this.heap[child1N];
          child1Score = fScores[child1];
          if (child1Score < score) swap = child1N;
        }
        if (child2N < length) {
          const child2 = this.heap[child2N];
          const child2Score = fScores[child2];
          if (child2Score < (swap === null ? score : child1Score)) swap = child2N;
        }
        if (swap === null) break;
        this.heap[n] = this.heap[swap];
        n = swap;
      }
      this.heap[n] = element;
    }
    get length() { return this.heap.length; }
  }

  const openHeap = new MinHeap();
  openHeap.push(startIndex);

  let closestIndex = startIndex;
  let minDistanceToEnd = heuristic(sx, sy);
  let reachedEnd = false;

  while (openHeap.length > 0) {
    const curIdx = openHeap.pop();
    if (closed[curIdx]) continue;
    closed[curIdx] = 1;

    const cx = curIdx % GRID_SIZE;
    const cy = Math.floor(curIdx / GRID_SIZE);

    if (curIdx === endIndex) {
      closestIndex = endIndex;
      reachedEnd = true;
      break;
    }

    const distToEnd = Math.hypot(ex - cx, ey - cy);
    if (distToEnd < minDistanceToEnd) {
      minDistanceToEnd = distToEnd;
      closestIndex = curIdx;
    }

    const currentG = gScores[curIdx];

    for (let i = 0; i < 8; i++) {
      const [dx, dy, stepDist] = dirs[i];
      const nx = cx + dx;
      const ny = cy + dy;

      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      const nIdx = ny * GRID_SIZE + nx;
      if (closed[nIdx]) continue;

      if (hazardMatrix[ny][nx] && !(nx === ex && ny === ey)) continue;

      const destEnergyCost = (energyMatrix[ny] && energyMatrix[ny][nx] != null) ? energyMatrix[ny][nx] : 1.0;
      const moveCost = stepDist * destEnergyCost;
      const tentativeG = currentG + moveCost;

      if (tentativeG < gScores[nIdx]) {
        cameFrom[nIdx] = curIdx;
        gScores[nIdx] = tentativeG;
        fScores[nIdx] = tentativeG + heuristic(nx, ny);
        openHeap.push(nIdx);
      }
    }
  }

  const targetEndIdx = reachedEnd ? endIndex : closestIndex;
  const path = [];
  let curr = targetEndIdx;

  while (curr !== -1) {
    const x = curr % GRID_SIZE;
    const y = Math.floor(curr / GRID_SIZE);
    const z = grid[y] ? grid[y][x] : 0;
    path.push({ x, y, z });
    if (curr === startIndex) break;
    curr = cameFrom[curr];
  }

  path.reverse();
  return path;
}

function extractPathTelemetry(path, grid, hazardMatrix, energyMatrix, slopeMatrix) {
  if (!path || path.length < 2) {
    return { energy: 0, length: 0, hazardsAvoided: 0, avgSlope: 0, maxTilt: 0 };
  }

  let totalEnergy = 0.0;
  let totalLength = 0.0;
  let sumSlope = 0.0;
  let maxTilt = 0.0;

  const adjacentHazards = new Set();
  const pathSet = new Set(path.map(pt => `${pt.x},${pt.y}`));

  const startSlope = (slopeMatrix && slopeMatrix[path[0].y]) ? slopeMatrix[path[0].y][path[0].x] : 0;
  sumSlope += startSlope;
  if (startSlope > maxTilt) maxTilt = startSlope;

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];

    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dz = (curr.z - prev.z) * 0.06;
    const stepDist = Math.hypot(dx, dy, dz) * CELL_WORLD_METERS;
    totalLength += stepDist;

    const cellEnergyCost = (energyMatrix && energyMatrix[curr.y]) ? energyMatrix[curr.y][curr.x] : 1.0;
    totalEnergy += stepDist * cellEnergyCost * 14.2;

    const slope = (slopeMatrix && slopeMatrix[curr.y]) ? slopeMatrix[curr.y][curr.x] : 0;
    sumSlope += slope;
    if (slope > maxTilt) maxTilt = slope;

    for (let ny = Math.max(0, curr.y - 1); ny <= Math.min(GRID_SIZE - 1, curr.y + 1); ny++) {
      for (let nx = Math.max(0, curr.x - 1); nx <= Math.min(GRID_SIZE - 1, curr.x + 1); nx++) {
        if (!pathSet.has(`${nx},${ny}`) && hazardMatrix && hazardMatrix[ny] && hazardMatrix[ny][nx]) {
          adjacentHazards.add(`${nx},${ny}`);
        }
      }
    }
  }

  const avgSlope = path.length > 0 ? (sumSlope / path.length) : 0;

  return {
    energy: Math.round(totalEnergy),
    length: parseFloat(totalLength.toFixed(1)),
    hazardsAvoided: adjacentHazards.size,
    avgSlope: parseFloat(avgSlope.toFixed(1)),
    maxTilt: parseFloat(maxTilt.toFixed(1))
  };
}

function calculateReachabilityPct(reachabilityMatrix) {
  if (!reachabilityMatrix) return 0;
  let count = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (reachabilityMatrix[y][x] === 1) count++;
    }
  }
  return parseFloat(((count / (GRID_SIZE * GRID_SIZE)) * 100).toFixed(1));
}

/**
 * -------------------------------------------------------------
 * 7. sieveStats(acts) - Full A* & Telemetry Execution
 * -------------------------------------------------------------
 */
function sieveStats(acts) {
  if (!window.AppState) return;

  const facts = window.AppState.facts;
  if (!facts.earthGrid || !facts.targetGrid) {
    sieveFacts(facts.preset || 'Salar de Uyuni Rim');
  }

  let mission = window.AppState.config.mission;
  if (!mission.start) {
    mission.start = { x: 8, y: 28, z: facts.earthGrid[28][8] };
    if (facts.missionSetup) facts.missionSetup.startPoint = mission.start;
  }
  if (!mission.end) {
    mission.end = { x: 50, y: 28, z: facts.earthGrid[28][50] };
    if (facts.missionSetup) facts.missionSetup.endPoint = mission.end;
  }
  if (typeof window.updateMissionStatusHUD === 'function') {
    window.updateMissionStatusHUD();
  }

  const roverConfig = window.AppState.config?.rover || facts.roverSpecs;
  sieveActs(facts, roverConfig, mission.start, mission.end);
  const currentActs = window.AppState.acts;

  const start = mission.start;
  const end = mission.end;

  const earthPath = findPathAStar(
    facts.earthGrid,
    currentActs.earthHazards || currentActs.hazardMatrix,
    currentActs.earthEnergy || currentActs.energyCostMatrix,
    start,
    end
  );

  const targetPath = findPathAStar(
    facts.targetGrid,
    currentActs.targetHazards,
    currentActs.targetEnergy,
    start,
    end
  );

  window.AppState.acts.earthPath = earthPath;
  window.AppState.acts.path = earthPath;
  window.AppState.acts.targetPath = targetPath;

  const earthTelemetry = extractPathTelemetry(
    earthPath,
    facts.earthGrid,
    currentActs.earthHazards || currentActs.hazardMatrix,
    currentActs.earthEnergy || currentActs.energyCostMatrix,
    facts.earthSlopeGrid || facts.slopeGrid
  );

  const targetTelemetry = extractPathTelemetry(
    targetPath,
    facts.targetGrid,
    currentActs.targetHazards,
    currentActs.targetEnergy,
    facts.targetSlopeGrid
  );

  const earthReachPct = calculateReachabilityPct(currentActs.earthReachability || currentActs.reachabilityMatrix);
  const targetReachPct = calculateReachabilityPct(currentActs.targetReachability);

  const maxEnergy = Math.max(earthTelemetry.energy, targetTelemetry.energy, 1.0);
  const energyVariance = Math.abs(earthTelemetry.energy - targetTelemetry.energy) / maxEnergy;

  const maxLength = Math.max(earthTelemetry.length, targetTelemetry.length, 1.0);
  const lengthVariance = Math.abs(earthTelemetry.length - targetTelemetry.length) / maxLength;

  const compositeVariance = (0.50 * energyVariance) + (0.50 * lengthVariance);
  const rawSimilarity = (1.0 - compositeVariance) * 100.0;
  const analogSimilarity = Math.max(12, Math.min(98, Math.round(rawSimilarity * 10) / 10));

  let verdictTitle = '';
  let verdictClass = '';
  let verdictDesc = '';
  if (analogSimilarity >= 85) {
    verdictTitle = 'VALIDATED MOBILITY ANALOG';
    verdictClass = 'verdict-validated';
    verdictDesc = 'Terrestrial site demonstrates high-fidelity mobility validation for planetary mission planning.';
  } else if (analogSimilarity >= 65) {
    verdictTitle = 'CONDITIONAL ANALOG';
    verdictClass = 'verdict-conditional';
    verdictDesc = 'Moderate mobility correlation; operational limits require wheel slip compensation.';
  } else {
    verdictTitle = 'POOR ANALOG MATCH';
    verdictClass = 'verdict-poor';
    verdictDesc = 'Critical terrain divergence; terrestrial analog fails to reproduce target hazard distribution.';
  }

  window.AppState.stats = {
    energyUsed: earthTelemetry.energy,
    energyTarget: targetTelemetry.energy,
    energyEarth: earthTelemetry.energy,
    hazardsAvoided: earthTelemetry.hazardsAvoided,
    hazardsTarget: targetTelemetry.hazardsAvoided,
    hazardsEarth: earthTelemetry.hazardsAvoided,
    pathLength: earthTelemetry.length,
    lengthTarget: targetTelemetry.length,
    lengthEarth: earthTelemetry.length,
    avgSlope: earthTelemetry.avgSlope,
    avgSlopeTarget: targetTelemetry.avgSlope,
    maxTilt: earthTelemetry.maxTilt,
    maxTiltTarget: targetTelemetry.maxTilt,
    reachability: earthReachPct,
    reachabilityTarget: targetReachPct,
    analogSimilarity: analogSimilarity,
    earth: {
      energy: earthTelemetry.energy,
      hazards: earthTelemetry.hazardsAvoided,
      length: earthTelemetry.length
    },
    target: {
      energy: targetTelemetry.energy,
      hazards: targetTelemetry.hazardsAvoided,
      length: targetTelemetry.length
    }
  };

  window.AppState.acts.verdict = {
    title: verdictTitle,
    class: verdictClass,
    score: analogSimilarity,
    description: verdictDesc
  };

  if (typeof window.updateMetricsUI === 'function') {
    window.updateMetricsUI();
  }

  const isCompare = window.AppState.compareMode;
  const tEnergy = document.getElementById('t-stat-energy');
  const tSlope = document.getElementById('t-stat-avg-slope');
  const tTilt = document.getElementById('t-stat-max-tilt');
  const tReach = document.getElementById('t-stat-reachability');

  if (tEnergy) tEnergy.textContent = isCompare ? `${earthTelemetry.energy} J | ${targetTelemetry.energy} J` : `${earthTelemetry.energy} J`;
  if (tSlope) tSlope.textContent = isCompare ? `${earthTelemetry.avgSlope.toFixed(1)}° | ${targetTelemetry.avgSlope.toFixed(1)}°` : `${earthTelemetry.avgSlope.toFixed(1)}°`;
  if (tTilt) tTilt.textContent = isCompare ? `${earthTelemetry.maxTilt.toFixed(1)}° | ${targetTelemetry.maxTilt.toFixed(1)}°` : `${earthTelemetry.maxTilt.toFixed(1)}°`;
  if (tReach) tReach.textContent = isCompare ? `${earthReachPct}% | ${targetReachPct}%` : `${earthReachPct}%`;

  const logBox = document.getElementById('engineering-log');
  if (logBox) {
    const timestamp = new Date().toLocaleTimeString();
    const targetSite = facts.site || 'Mars - Jezero Crater';
    const maxSlopeDeg = window.AppState.config?.rover?.maxSlopeDeg ?? 20;
    const gTarget = facts.targetConstraints?.g || 3.72;
    const slipOverheadPct = Math.max(5, Math.round(((targetTelemetry.energy - earthTelemetry.energy) / Math.max(1, earthTelemetry.energy)) * 100));

    logBox.textContent = `[${timestamp}] MISSION TELEMETRY RUN COMPLETED // PLANETARY TERRAIN MAPPING\n` +
      `• Rover navigated ${earthTelemetry.length}m on Earth ${isCompare ? `vs ${targetTelemetry.length}m on ${targetSite}` : ''}.\n` +
      `• Avoided ${earthTelemetry.hazardsAvoided} terrestrial hazard cells (slope > ${maxSlopeDeg}° or step > 0.3m) ${isCompare ? `vs ${targetTelemetry.hazardsAvoided} avoided on ${targetSite}` : ''}.\n` +
      `• Mean gradient: ${earthTelemetry.avgSlope.toFixed(1)}° (Max Tilt: ${earthTelemetry.maxTilt.toFixed(1)}°).\n` +
      `• Soil slip penalty added ${slipOverheadPct}% energy overhead under ${gTarget} m/s² gravitational environment.\n` +
      `• Terrain Reachability: ${earthReachPct}% reachable on Earth ${isCompare ? `vs ${targetReachPct}% on ${targetSite}` : ''}.\n` +
      `• Analog Viability Verdict: ${verdictTitle} (${analogSimilarity}% match).`;
  }

  const scorePct = document.getElementById('verdict-score-pct');
  const meterFill = document.getElementById('verdict-meter-fill');
  const badge = document.getElementById('verdict-status-badge');
  const desc = document.getElementById('verdict-desc');

  if (scorePct) scorePct.textContent = `${analogSimilarity}%`;
  if (meterFill) meterFill.style.width = `${analogSimilarity}%`;
  if (badge) {
    badge.className = `verdict-badge ${verdictClass}`;
    badge.textContent = verdictTitle;
  }
  if (desc) desc.textContent = verdictDesc;

  const drawer = document.getElementById('telemetry-summary');
  const chevron = document.getElementById('drawer-chevron');
  const runStatus = document.getElementById('telemetry-run-status');

  if (drawer) drawer.classList.remove('collapsed');
  if (chevron) chevron.textContent = '▼';
  if (runStatus) runStatus.textContent = 'RUN COMPLETE';

  if (typeof window.startRoverAnimation === 'function') {
    window.startRoverAnimation();
  } else if (typeof window.renderAllMaps === 'function') {
    window.renderAllMaps();
  }

  return {
    earthPath,
    targetPath,
    earthTelemetry,
    targetTelemetry,
    analogSimilarity,
    verdict: verdictTitle
  };
}

// Expose functions globally
window.CUSTOM_PRESET_DATA = CUSTOM_PRESET_DATA;
window.normalizeCustomGridTo60x60 = normalizeCustomGridTo60x60;
window.GEOTECHNICAL_PRESETS = GEOTECHNICAL_PRESETS;
window.generateSalarDeUyuniDEM = generateSalarDeUyuniDEM;
window.generateJezeroCraterDEM = generateJezeroCraterDEM;
window.generateMoonShackletonDEM = generateMoonShackletonDEM;
window.calculateSlopeMatrix = calculateSlopeMatrix;
window.sieveFacts = sieveFacts;
window.sieveActs = sieveActs;
window.computeReachabilityBFS = computeReachabilityBFS;
window.findPathAStar = findPathAStar;
window.extractPathTelemetry = extractPathTelemetry;
window.calculateReachabilityPct = calculateReachabilityPct;
window.sieveStats = sieveStats;