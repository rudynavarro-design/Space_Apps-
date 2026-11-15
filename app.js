/**
 * Planetary Terrain Mapping - Complete UI, Simultaneous Rover Renderer & Telemetry Pipeline
 * app.js
 */

const AppState = {
  compareMode: false,
  facts: {
    preset: 'Salar de Uyuni Rim',
    site: 'Salar de Uyuni Rim',
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
      selectedPointMode: null,
      explore: false,
      startPoint: null,
      endPoint: null
    },
    explore: false,
    heightmap: null,
    elevationGrid: null,
    minElevation: 0,
    maxElevation: 100,
    targetHeightmap: null,
    targetMinElevation: 0,
    targetMaxElevation: 100
  },
  config: {
    mission: {
      start: null,
      end: null
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
    path: null,
    earthPath: null,
    targetPath: null,
    summaryLog: '',
    verdict: null
  }
};

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

window.AppState = AppState;

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
  hoveredCell: null
};

// Rover simultaneous traversal animation state
const RoverAnimState = {
  progress: 1.0,
  isAnimating: false,
  rafId: null
};

function startRoverAnimation() {
  if (RoverAnimState.rafId) {
    cancelAnimationFrame(RoverAnimState.rafId);
  }
  RoverAnimState.progress = 0.0;
  RoverAnimState.isAnimating = true;
  const durationMs = 2200;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    RoverAnimState.progress = Math.min(1.0, elapsed / durationMs);
    if (typeof window.renderAllMaps === 'function') {
      window.renderAllMaps();
    }
    if (RoverAnimState.progress < 1.0) {
      RoverAnimState.rafId = requestAnimationFrame(step);
    } else {
      RoverAnimState.isAnimating = false;
      RoverAnimState.rafId = null;
    }
  }

  RoverAnimState.rafId = requestAnimationFrame(step);
}
window.startRoverAnimation = startRoverAnimation;

document.addEventListener('DOMContentLoaded', () => {
  initLeftPanelControls();
  initCompareModeToggle();
  initMapCanvases();
  initDrawerControls();

  if (typeof sieveFacts === 'function') {
    sieveFacts('Salar de Uyuni Rim');
  }
  if (typeof window.resizeAllCanvases === 'function') {
    window.resizeAllCanvases();
  }
  updateMetricsUI();
  updateLegendUI();
});

function computeSlopeDegrees(grid, x, y) {
  if (!grid) return 0;
  if (grid === AppState.facts.earthGrid && AppState.facts.earthSlopeGrid) {
    return AppState.facts.earthSlopeGrid[y][x];
  }
  if (grid === AppState.facts.targetGrid && AppState.facts.targetSlopeGrid) {
    return AppState.facts.targetSlopeGrid[y][x];
  }
  if (AppState.facts.slopeGrid && grid === AppState.facts.heightmap) {
    return AppState.facts.slopeGrid[y][x];
  }

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

function computeMaxStepHeight(grid, x, y) {
  if (!grid) return 0;
  const z = grid[y][x];
  const zU = y > 0 ? grid[y - 1][x] : z;
  const zD = y < GRID_SIZE - 1 ? grid[y + 1][x] : z;
  const zL = x > 0 ? grid[y][x - 1] : z;
  const zR = x < GRID_SIZE - 1 ? grid[y][x + 1] : z;
  return Math.max(Math.abs(z - zU), Math.abs(z - zD), Math.abs(z - zL), Math.abs(z - zR));
}

function isCellHazard(grid, x, y, maxSlopeDeg) {
  const slope = computeSlopeDegrees(grid, x, y);
  const step = computeMaxStepHeight(grid, x, y);
  return slope > maxSlopeDeg || step > 0.3;
}

/**
 * Parse uploaded .json or .csv custom terrain files into a 60x60 elevation grid
 */
function parseUploadedTerrainFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const text = event.target.result.trim();
      let raw2D = null;

      if (file.name.endsWith('.json') || text.startsWith('[') || text.startsWith('{')) {
        const parsed = JSON.parse(text);
        raw2D = Array.isArray(parsed) ? parsed : (parsed.grid || parsed.elevation || parsed.data);
      } else {
        // Parse CSV rows
        raw2D = text.split(/\r?\n/).filter(line => line.trim().length > 0).map(line =>
          line.split(/[,\s;]+/).map(Number).filter(n => !isNaN(n))
        ).filter(row => row.length > 0);
      }

      const normalizedGrid = window.normalizeCustomGridTo60x60 ? window.normalizeCustomGridTo60x60(raw2D) : null;
      if (normalizedGrid) {
        const slopeGrid = window.calculateSlopeMatrix(normalizedGrid);
        // Apply uploaded grid to active target or Earth grid
        if (AppState.compareMode) {
          AppState.facts.targetGrid = normalizedGrid;
          AppState.facts.targetHeightmap = normalizedGrid;
          AppState.facts.targetSlopeGrid = slopeGrid;
        } else {
          AppState.facts.earthGrid = normalizedGrid;
          AppState.facts.heightmap = normalizedGrid;
          AppState.facts.elevationGrid = normalizedGrid;
          AppState.facts.slopeGrid = slopeGrid;
          AppState.facts.earthSlopeGrid = slopeGrid;
        }
        window.sieveActs(AppState.facts, AppState.config.rover, AppState.config.mission.start, AppState.config.mission.end);
        if (window.renderAllMaps) window.renderAllMaps();
      }
    } catch (err) {
      console.error('[Planetary Terrain Mapping] Failed to parse custom data file:', err);
    }
  };
  reader.readAsText(file);
}

function initLeftPanelControls() {
  const presetButtons = document.querySelectorAll('.btn-preset');
  const fileInput = document.getElementById('file-upload');
  const fileNameDisplay = document.getElementById('file-upload-name');
  const btnLoadSite = document.getElementById('btn-load-site');

  if (btnLoadSite && fileInput) {
    btnLoadSite.addEventListener('click', () => fileInput.click());
  }

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const preset = btn.dataset.preset;
      AppState.facts.uploadedFile = null;
      if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';

      if (typeof sieveFacts === 'function') {
        sieveFacts(preset);
      }
      updateTargetEnvironmentLabel();
      if (window.renderAllMaps) window.renderAllMaps();
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
        AppState.facts.site = file.name;
        updateTargetEnvironmentLabel();
        parseUploadedTerrainFile(file);
      }
    });
  }

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
  const tagTarget = document.getElementById('tag-target');
  const tagEarth = document.getElementById('tag-earth');
  const site = AppState.facts.site || 'Mars - Jezero Crater';

  if (tagEarth) {
    tagEarth.textContent = 'TERRESTRIAL ANALOG // SALAR DE UYUNI (g = 9.81 m/s²)';
  }
  if (!tagTarget) return;

  if (site.includes('Moon') || site.includes('Shackleton')) {
    tagTarget.textContent = 'TARGET ENVIRONMENT // MOON - SHACKLETON CRATER (g = 1.62 m/s²)';
  } else {
    tagTarget.textContent = 'TARGET ENVIRONMENT // MARS - JEZERO CRATER (g = 3.72 m/s²)';
  }
}
window.updateTargetEnvironmentLabel = updateTargetEnvironmentLabel;

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
        <span>Hazards (> ${maxSlope}° / Slip)</span>
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

    ViewState.panX = 0;
    ViewState.panY = 0;
    if (window.resizeAllCanvases) window.resizeAllCanvases();
    updateMetricsUI();
    updateLegendUI();
  }

  if (toggleCompare) {
    toggleCompare.addEventListener('change', (e) => {
      setCompareMode(e.target.checked);
    });
  }

  window.setCompareMode = setCompareMode;
}

function isSingleViewTargetSelected() {
  return !AppState.compareMode && (
    AppState.facts.preset === 'Mars - Jezero Crater' ||
    AppState.facts.preset === 'Moon - Shackleton'
  );
}

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

    const wrapEarth = paneEarth.querySelector('.canvas-wrapper') || paneEarth;
    const rectEarth = wrapEarth.getBoundingClientRect();
    if (rectEarth.width > 0 && rectEarth.height > 0) {
      canvasEarth.width = rectEarth.width * dpr;
      canvasEarth.height = rectEarth.height * dpr;
      ctxEarth.setTransform(1, 0, 0, 1, 0, 0);
      ctxEarth.scale(dpr, dpr);
    }

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

  function renderCanvasInstance(ctx, canvas, grid, isTargetMap) {
    if (!ctx || !canvas || !grid) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.scale(dpr, dpr);
    ctx.translate(ViewState.panX, ViewState.panY);
    ctx.scale(ViewState.zoom, ViewState.zoom);

    renderTerrainBasePass(ctx, grid);
    renderLayerOverlaysPass(ctx, grid, isTargetMap);
    renderGridLinesPass(ctx);
    renderPathLinePass(ctx, isTargetMap);
    renderWaypointMarkersPass(ctx);
    renderRoverPass(ctx, isTargetMap);
    renderHoverHighlightPass(ctx);

    ctx.restore();
  }

  function render() {
    const useTargetOnPrimary = isSingleViewTargetSelected();
    const primaryGrid = useTargetOnPrimary ? AppState.facts.targetHeightmap : AppState.facts.heightmap;
    renderCanvasInstance(ctxEarth, canvasEarth, primaryGrid, useTargetOnPrimary);

    if (AppState.compareMode && ctxTarget && canvasTarget) {
      renderCanvasInstance(ctxTarget, canvasTarget, AppState.facts.targetHeightmap, true);
    }
  }

  window.renderAllMaps = render;

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

  function renderLayerOverlaysPass(context, grid, isTarget) {
    const toggles = AppState.layerToggles;

    const hazardMatrix = isTarget ? AppState.acts?.targetHazards : (AppState.acts?.earthHazards || AppState.acts?.hazardMatrix);
    const energyMatrix = isTarget ? AppState.acts?.targetEnergy : (AppState.acts?.earthEnergy || AppState.acts?.energyCostMatrix);
    const reachabilityMatrix = isTarget ? AppState.acts?.targetReachability : (AppState.acts?.earthReachability || AppState.acts?.reachabilityMatrix);
    const slopeMatrix = isTarget ? AppState.facts?.targetSlopeGrid : (AppState.facts?.earthSlopeGrid || AppState.facts?.slopeGrid);

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const px = x * CELL_PIXELS;
        const py = y * CELL_PIXELS;

        if (toggles.slope) {
          const slope = slopeMatrix ? slopeMatrix[y][x] : computeSlopeDegrees(grid, x, y);
          const t = Math.min(1.0, Math.max(0.0, slope / 45.0));
          const r = Math.round(37 + t * (234 - 37));
          const g = Math.round(99 + t * (179 - 99));
          const b = Math.round(235 + t * (8 - 235));
          context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.48)`;
          context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
        }

        if (toggles.energyCost) {
          const cost = (energyMatrix && energyMatrix[y]) ? energyMatrix[y][x] : 1.0;
          let r, g, b;
          if (cost <= 1.0) {
            r = 34; g = 197; b = 94;
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
            r = 168; g = 85; b = 247;
          }

          context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.52)`;
          context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
        }

        if (toggles.hazards) {
          const isHazard = (hazardMatrix && hazardMatrix[y]) ? hazardMatrix[y][x] : isCellHazard(grid, x, y, AppState.config.rover?.maxSlopeDeg ?? 20);
          if (isHazard) {
            context.fillStyle = 'rgba(239, 68, 68, 0.65)';
            context.fillRect(px, py, CELL_PIXELS, CELL_PIXELS);
          }
        }

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

  function renderPathLinePass(context, isTarget) {
    const path = isTarget ? (AppState.acts && AppState.acts.targetPath) : (AppState.acts && (AppState.acts.earthPath || AppState.acts.path));
    if (!path || path.length < 2) return;

    const maxIdx = Math.max(1, Math.floor(RoverAnimState.progress * (path.length - 1)));

    context.save();
    context.strokeStyle = isTarget ? '#f97316' : '#38bdf8';
    context.lineWidth = 3.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = isTarget ? '#ea580c' : '#0284c7';
    context.shadowBlur = 12;

    context.beginPath();
    for (let idx = 0; idx <= maxIdx; idx++) {
      const pt = path[idx];
      const cx = (pt.x + 0.5) * CELL_PIXELS;
      const cy = (pt.y + 0.5) * CELL_PIXELS;
      if (idx === 0) context.moveTo(cx, cy);
      else context.lineTo(cx, cy);
    }
    context.stroke();
    context.restore();
  }

  function renderWaypointMarkersPass(context) {
    const mission = AppState.config && AppState.config.mission;
    if (!mission) return;

    if (mission.start) {
      const cx = (mission.start.x + 0.5) * CELL_PIXELS;
      const cy = (mission.start.y + 0.5) * CELL_PIXELS;
      drawMarker(context, cx, cy, '#22c55e', 'rgba(34, 197, 94, 0.25)', 'A');
    }

    if (mission.end) {
      const cx = (mission.end.x + 0.5) * CELL_PIXELS;
      const cy = (mission.end.y + 0.5) * CELL_PIXELS;
      drawMarker(context, cx, cy, '#06b6d4', 'rgba(6, 182, 212, 0.25)', 'B');
    }
  }

  function drawMarker(context, cx, cy, fillHex, haloRgba, label) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, 14, 0, Math.PI * 2);
    context.fillStyle = haloRgba;
    context.fill();

    context.beginPath();
    context.arc(cx, cy, 9, 0, Math.PI * 2);
    context.fillStyle = fillHex;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#ffffff';
    context.stroke();

    context.fillStyle = '#0f172a';
    context.font = 'bold 10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, cx, cy + 0.5);
    context.restore();
  }

  function renderRoverPass(context, isTarget) {
    const path = isTarget ? (AppState.acts && AppState.acts.targetPath) : (AppState.acts && (AppState.acts.earthPath || AppState.acts.path));
    if (!path || path.length === 0) return;

    const floatIdx = RoverAnimState.progress * (path.length - 1);
    const idx0 = Math.floor(floatIdx);
    const idx1 = Math.min(path.length - 1, idx0 + 1);
    const frac = floatIdx - idx0;

    const p0 = path[idx0];
    const p1 = path[idx1];
    const rx = p0.x + (p1.x - p0.x) * frac;
    const ry = p0.y + (p1.y - p0.y) * frac;

    const cx = (rx + 0.5) * CELL_PIXELS;
    const cy = (ry + 0.5) * CELL_PIXELS;

    context.save();
    context.beginPath();
    context.arc(cx, cy, 16, 0, Math.PI * 2);
    context.fillStyle = isTarget ? 'rgba(249, 115, 22, 0.32)' : 'rgba(56, 189, 248, 0.32)';
    context.fill();

    context.fillStyle = '#facc15';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(cx - 8, cy - 8, 16, 16, 4);
    context.fill();
    context.stroke();

    context.fillStyle = '#0f172a';
    context.font = 'bold 9px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('R', cx, cy + 0.5);
    context.restore();
  }

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

  function screenToGrid(canvas, screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    if (screenX < rect.left || screenX > rect.right || screenY < rect.top || screenY > rect.bottom) {
      return null;
    }

    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;

    const worldX = (mouseX - ViewState.panX) / ViewState.zoom;
    const worldY = (mouseY - ViewState.panY) / ViewState.zoom;

    const cellX = Math.floor(worldX / CELL_PIXELS);
    const cellY = Math.floor(worldY / CELL_PIXELS);

    if (cellX >= 0 && cellX < GRID_SIZE && cellY >= 0 && cellY < GRID_SIZE) {
      const isTarget = (canvas.id === 'map-canvas-target') || isSingleViewTargetSelected();
      const grid = isTarget ? AppState.facts.targetHeightmap : AppState.facts.heightmap;
      const z = grid ? grid[cellY][cellX] : 0;
      return { x: cellX, y: cellY, z, isTarget };
    }
    return null;
  }

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
    } else if (ViewState.hoveredCell !== null) {
      ViewState.hoveredCell = null;
      if (hudCoord) hudCoord.textContent = '--';
      if (hudElev) hudElev.textContent = '--';
      if (tooltip) tooltip.style.display = 'none';
      render();
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

  if (btnZoomReset) btnZoomReset.addEventListener('click', () => resetView());

  const panStep = 60;
  if (btnPanUp) btnPanUp.addEventListener('click', () => { ViewState.panY += panStep; render(); });
  if (btnPanDown) btnPanDown.addEventListener('click', () => { ViewState.panY -= panStep; render(); });
  if (btnPanLeft) btnPanLeft.addEventListener('click', () => { ViewState.panX += panStep; render(); });
  if (btnPanRight) btnPanRight.addEventListener('click', () => { ViewState.panX -= panStep; render(); });
  if (btnPanCenter) btnPanCenter.addEventListener('click', () => resetView());

  updateMissionStatusHUD();
}

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
window.updateMissionStatusHUD = updateMissionStatusHUD;

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
  if (typeof window.sieveStats === 'function') {
    return window.sieveStats(AppState.acts);
  }
}

function updateMetricsUI() {
  const stats = (window.AppState && window.AppState.stats) || {};
  const isCompare = !!(window.AppState && window.AppState.compareMode);
  const singleTarget = isSingleViewTargetSelected();

  const elEnergy = document.getElementById('stat-energy');
  const elHazards = document.getElementById('stat-hazards');
  const elLength = document.getElementById('stat-length');
  const elSimilarity = document.getElementById('stat-similarity');

  if (isCompare) {
    if (elEnergy) {
      const eEarth = stats.energyEarth ?? stats.energyUsed ?? null;
      const eTarget = stats.energyTarget ?? null;
      elEnergy.textContent = (eEarth != null && eTarget != null) ? `${eEarth} J | ${eTarget} J` : '-- J | -- J';
    }
    if (elHazards) {
      const hEarth = stats.hazardsEarth ?? stats.hazardsAvoided ?? null;
      const hTarget = stats.hazardsTarget ?? null;
      elHazards.textContent = (hEarth != null && hTarget != null) ? `${hEarth} | ${hTarget}` : '-- | --';
    }
    if (elLength) {
      const lEarth = stats.lengthEarth ?? stats.pathLength ?? null;
      const lTarget = stats.lengthTarget ?? null;
      elLength.textContent = (lEarth != null && lTarget != null) ? `${lEarth} m | ${lTarget} m` : '-- m | -- m';
    }
    if (elSimilarity) {
      const sim = stats.analogSimilarity;
      elSimilarity.textContent = (sim != null && !isNaN(sim)) ? `${Number(sim).toFixed(1)}%` : '--%';
    }
  } else {
    if (elEnergy) {
      const energy = singleTarget ? stats.energyTarget : stats.energyUsed;
      elEnergy.textContent = (energy != null && !isNaN(energy)) ? `${energy} J` : '-- J';
    }
    if (elHazards) {
      const hazards = singleTarget ? stats.hazardsTarget : stats.hazardsAvoided;
      elHazards.textContent = (hazards != null && !isNaN(hazards)) ? `${hazards}` : '--';
    }
    if (elLength) {
      const length = singleTarget ? stats.lengthTarget : stats.pathLength;
      elLength.textContent = (length != null && !isNaN(length)) ? `${length} m` : '-- m';
    }
    if (elSimilarity) {
      const sim = stats.analogSimilarity;
      elSimilarity.textContent = (sim != null && !isNaN(sim)) ? `${Number(sim).toFixed(1)}%` : '--%';
    }
  }
}

window.updateMetricsUI = updateMetricsUI;
window.updateLegendUI = updateLegendUI;
window.runSimulation = runSimulation;