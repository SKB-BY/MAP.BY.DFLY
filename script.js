let map;
let flyZonesGeoJSON = null;
let coordinatesDisplay = null;
let operatorMarker = null;
let elevationCache = {};
let lastElevationRequest = 0;
const ELEVATION_REQUEST_DELAY = 1000;
let pendingElevationRequest = null;
let isTrackingCenter = true;

// Режимы
let currentMode = null; // 'rbla', 'mbla', 'pbla'
let routePoints = [];
let routeLine = null;
let tempCircle = null;
let tempLine = null;
let tempLabel = null;
let centerPoint = null;
let radiusMeters = null;

// Зоны
let zoneLayers = {};
const ZONE_PREFIXES = ["RB", "MIL", "UMU", "UMP", "UMD", "UMR", "ARD", "ARZ"];

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function getZoneStyle(feature) {
  const name = feature.properties?.Name || feature.properties?.name || '';
  const baseStyle = { weight: 2, opacity: 0.9, fillOpacity: 0.3 };
  if (name.startsWith('UMU_')) return { ...baseStyle, color: '#800080', fillColor: '#800080' };
  else if (name.startsWith('UMD_')) return { ...baseStyle, color: '#654321', fillColor: '#b57e54' };
  else if (name.startsWith('UMP_')) return { ...baseStyle, color: '#cc8400', fillColor: '#ffa500' };
  else if (name.startsWith('UMR_')) return { ...baseStyle, color: '#cc0000', fillColor: '#ff0000' };
  else if (name.startsWith('ARD_') || name.startsWith('ARZ_')) return { ...baseStyle, color: '#666666', fillColor: '#c8c8c8' };
  else return { ...baseStyle, color: '#cc0000', fillColor: '#ff0000' };
}

async function getElevation(lat, lng) {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (elevationCache[cacheKey] !== undefined) return elevationCache[cacheKey];
  const now = Date.now();
  if (now - lastElevationRequest < ELEVATION_REQUEST_DELAY) {
    if (pendingElevationRequest) return pendingElevationRequest;
    return getApproximateElevation(lat, lng);
  }
  lastElevationRequest = now;
  pendingElevationRequest = new Promise(async (resolve) => {
    try {
      const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data.results?.[0]) {
        const elevation = data.results[0].elevation;
        elevationCache[cacheKey] = elevation;
        resolve(elevation);
      } else throw new Error('No elevation data');
    } catch (error) {
      console.warn('Ошибка получения высоты:', error);
      const approx = getApproximateElevation(lat, lng);
      elevationCache[cacheKey] = approx;
      resolve(approx);
    } finally {
      pendingElevationRequest = null;
    }
  });
  return pendingElevationRequest;
}

function getApproximateElevation(lat, lng) {
  const baseHeight = 160;
  const variation = Math.sin(lat * 10) * 50 + Math.cos(lng * 10) * 30;
  return Math.max(100, baseHeight + variation);
}

function initCoordinatesDisplay() {
  coordinatesDisplay = document.createElement('div');
  coordinatesDisplay.className = 'coordinates-display';
  coordinatesDisplay.innerHTML = '<div class="coordinates-content"><strong>Координаты:</strong> 53.900000, 27.566700 / <strong>Высота:</strong> 160 м.</div>';
  document.body.appendChild(coordinatesDisplay);
}

function updateCoordinatesDisplay(coords, elevation = 0) {
  if (!coordinatesDisplay) return;
  const lat = coords[0].toFixed(6);
  const lng = coords[1].toFixed(6);
  coordinatesDisplay.innerHTML = `<div class="coordinates-content"><strong>Координаты:</strong> ${lat}, ${lng} / <strong>Высота:</strong> ${Math.round(elevation)} м.</div>`;
}

function updateCenterCoordinates() {
  if (!coordinatesDisplay || !map) return;
  const center = map.getCenter();
  getElevation(center.lat, center.lng).then(elevation => {
    updateCoordinatesDisplay([center.lat, center.lng], elevation);
  });
}

let cursorUpdateTimeout = null;
function updateCursorCoordinates(e) {
  if (cursorUpdateTimeout) clearTimeout(cursorUpdateTimeout);
  cursorUpdateTimeout = setTimeout(() => {
    isTrackingCenter = false;
    getElevation(e.latlng.lat, e.latlng.lng).then(elevation => {
      updateCoordinatesDisplay([e.latlng.lat, e.latlng.lng], elevation);
    });
  }, 100);
}

function resetToCenterTracking() {
  isTrackingCenter = true;
  updateCenterCoordinates();
}

// === ИНИЦИАЛИЗАЦИЯ КАРТЫ ===
function initMap() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    tap: isMobile,
    tapTolerance: isMobile ? 15 : 10
  }).setView([53.9, 27.5667], 10);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { detectRetina: isMobile });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { detectRetina: isMobile });
  const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { detectRetina: isMobile });
  const hybrid = L.layerGroup([satellite, labels]);

  L.control.layers({
    'OSM': osm,
    'Спутник': satellite,
    'Гибрид': hybrid
  }, {}, { position: 'topright' }).addTo(map);

  osm.addTo(map);
  initCoordinatesDisplay();

  map.on('moveend', () => { if (isTrackingCenter) updateCenterCoordinates(); });
  map.on('zoomend', () => { if (isTrackingCenter) updateCenterCoordinates(); });
  map.on('mousemove', updateCursorCoordinates);
  map.on('mouseout', resetToCenterTracking);
  if (isMobile) {
    map.on('touchmove', updateCursorCoordinates);
    map.on('touchend', resetToCenterTracking);
  }

  updateCenterCoordinates();
  loadZones();
  initButtons();
  createZoneToggleControl();
}

// === ЗАГРУЗКА ЗОН ===
function loadZones() {
  fetch('Fly_Zones_BY.geojson')
    .then(res => {
      if (!res.ok) throw new Error(`GeoJSON не найден: ${res.status}`);
      return res.json();
    })
    .then(geojson => {
      flyZonesGeoJSON = geojson;

      ZONE_PREFIXES.forEach(prefix => {
        zoneLayers[prefix] = L.featureGroup();
      });

      geojson.features.forEach(feature => {
        const name = feature.properties?.Name || feature.properties?.name || '';
        let assigned = false;
        for (const prefix of ZONE_PREFIXES) {
          if (name.startsWith(prefix)) {
            const layer = L.geoJSON(feature, {
              onEachFeature: (feat, l) => {
                const n = feat.properties.Name || feat.properties.name || 'Зона';
                const desc = feat.properties.description || '';
                l.bindPopup(`<b>${n}</b><br>${desc}`);
              },
              style: getZoneStyle
            });
            zoneLayers[prefix].addLayer(layer);
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          console.warn('Не распознана зона:', name);
        }
      });

      ZONE_PREFIXES.forEach(prefix => {
        map.addLayer(zoneLayers[prefix]);
      });

      console.log('✅ GeoJSON загружен. Зоны распределены.');
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки GeoJSON:', err);
      alert('⚠️ Не удалось загрузить зоны.');
    });
}

// === ПРОВЕРКА ПЕРЕСЕЧЕНИЙ ===
function checkIntersectionsForGeometry(points, isPolygon = false) {
  if (!flyZonesGeoJSON) return [];
  const intersectingNames = [];

  flyZonesGeoJSON.features.forEach(feature => {
    const tempLayer = L.geoJSON(feature);
    const zoneBounds = tempLayer.getBounds();
    let intersects = false;

    if (isPolygon && points.length >= 3) {
      const polyBounds = L.polygon(points).getBounds();
      if (polyBounds.overlaps(zoneBounds)) {
        intersects = true;
      }
    } else {
      for (let pt of points) {
        const d = map.distance(pt, zoneBounds.getCenter());
        const zoneRad = map.distance(zoneBounds.getNorthWest(), zoneBounds.getSouthEast()) / 2;
        if (d <= (10 + zoneRad)) {
          intersects = true;
          break;
        }
      }
    }

    if (intersects) {
      const name = feature.properties.Name || feature.properties.name || 'Зона';
      if (!intersectingNames.includes(name)) {
        intersectingNames.push(name);
      }
    }
    tempLayer.remove();
  });

  return intersectingNames;
}

// === МАРКЕР ОПЕРАТОРА ===
function setOperatorMarker(latlng) {
  if (operatorMarker) map.removeLayer(operatorMarker);
  operatorMarker = L.marker(latlng, {
    icon: L.divIcon({
      className: 'operator-marker',
      html: '<div class="operator-marker-inner">О</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })
  }).addTo(map);
  getElevation(latlng.lat, latlng.lng).then(elevation => {
    operatorMarker.bindPopup(`
      <b>Позиция оператора</b><br>
      Координаты: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}<br>
      Высота: ${Math.round(elevation)} м.
    `).openPopup();
  });
}

// === УПРАВЛЕНИЕ РЕЖИМОМ ===
function enterMode(mode) {
  if (currentMode) {
    alert('Сначала завершите или отмените текущий режим');
    return false;
  }
  currentMode = mode;
  document.getElementById('btn-plan').disabled = true;
  document.getElementById('btn-cancel').style.display = 'block';
  document.getElementById('plan-dropdown').classList.remove('active');
  return true;
}

function exitMode() {
  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);
  if (tempCircle) map.removeLayer(tempCircle);
  if (routeLine) map.removeLayer(routeLine);
  routePoints = [];
  currentMode = null;
  document.getElementById('btn-plan').disabled = false;
  document.getElementById('btn-cancel').style.display = 'none';
  document.getElementById('btn-finish').style.display = 'none';
  map.dragging.enable();
  map.off('click', addRoutePoint);
  map.off('mousemove', drawTempLine);
}

// === КНОПКИ ===
function initButtons() {
  const btnPlan = document.getElementById('btn-plan');
  const btnGps = document.getElementById('btn-gps');
  const btnOperator = document.getElementById('btn-operator');
  const btnFinish = document.getElementById('btn-finish');
  const btnCancel = document.getElementById('btn-cancel');

  // Выпадающее меню
  const dropdown = document.createElement('div');
  dropdown.id = 'plan-dropdown';
  dropdown.className = 'plan-dropdown';
  dropdown.innerHTML = `
    <button class="rbla" data-mode="rbla">Р-БЛА</button>
    <button class="mbla" data-mode="mbla">М-БЛА</button>
    <button class="pbla" data-mode="pbla">П-БЛА</button>
  `;
  document.body.appendChild(dropdown);

  btnPlan.addEventListener('click', () => {
    dropdown.classList.toggle('active');
  });

  dropdown.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const mode = e.target.dataset.mode;
      dropdown.classList.remove('active');
      if (mode === 'rbla') activateRBLA();
      else if (mode === 'mbla') activateMBLA();
      else if (mode === 'pbla') activatePBLA();
    }
  });

  // Закрытие меню при клике вне его
  document.addEventListener('click', (e) => {
    if (!btnPlan.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  // GPS
  btnGps.addEventListener('click', () => {
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 10000 });
    map.once('locationfound', e => {
      btnOperator.style.display = 'block';
      L.marker(e.latlng).addTo(map).bindPopup("Ваше местоположение").openPopup();
      setTimeout(() => { isTrackingCenter = true; updateCenterCoordinates(); }, 1000);
    });
    map.once('locationerror', () => alert('Не удалось определить местоположение.'));
  });

  // Маркер-О
  btnOperator.addEventListener('click', () => {
    const center = map.getCenter();
    setOperatorMarker(center);
    getElevation(center.lat, center.lng).then(elevation => {
      alert(`Маркер оператора установлен!\nКоординаты: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}\nВысота: ${Math.round(elevation)} м.`);
    });
  });

  // Завершить
  btnFinish.addEventListener('click', () => {
    if (currentMode === 'mbla') finishMBLA();
    else if (currentMode === 'pbla') finishPBLA();
  });

  // Отмена
  btnCancel.addEventListener('click', () => {
    exitMode();
  });
}

// === РЕЖИМЫ ===
function activateRBLA() {
  if (!enterMode('rbla')) return;
  centerPoint = map.getCenter();
  map.dragging.disable();
  map.on('mousemove', drawTempLine);
  map.once('click', (e) => {
    finishRadius(e);
  });
}

function activateMBLA() {
  if (!enterMode('mbla')) return;
  routePoints = [];
  document.getElementById('btn-finish').style.display = 'block';
  map.on('click', addRoutePoint);
}

function activatePBLA() {
  if (!enterMode('pbla')) return;
  routePoints = [];
  document.getElementById('btn-finish').style.display = 'block';
  map.on('click', addRoutePoint);
}

function addRoutePoint(e) {
  if (!currentMode) return;
  routePoints.push(e.latlng);
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(routePoints, {
    color: currentMode === 'mbla' ? '#4169e1' : 'green',
    weight: currentMode === 'mbla' ? 8 : 3,
    opacity: 0.8
  }).addTo(map);
}

// === ЗАВЕРШЕНИЕ ===
function finishRadius(e) {
  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) {
    exitMode();
    return;
  }
  radiusMeters = Math.ceil(distance / 50) * 50;
  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);
  if (tempCircle) map.removeLayer(tempCircle);
  tempCircle = L.circle(centerPoint, { radius: radiusMeters, color: 'red', fillOpacity: 0.2, weight: 2 }).addTo(map);

  const intersects = checkIntersectionsForGeometry([centerPoint]);
  let content = `<b>Р-БЛА</b><br><b>Радиус:</b> ${radiusMeters} м<br>`;
  if (intersects.length > 0) content += `<b>Пересекает зоны:</b><br>• ${intersects.join('<br>• ')}`;
  else content += `<b>Пересечений нет</b>`;
  tempCircle.bindPopup(content).openPopup();

  exitMode();
}

function finishMBLA() {
  if (routePoints.length < 2) { alert('Минимум 2 точки'); exitMode(); return; }
  const intersects = checkIntersectionsForGeometry(routePoints, false);
  let content = `<b>М-БЛА</b><br><b>Точек:</b> ${routePoints.length}<br>`;
  if (intersects.length > 0) content += `<b>Пересекает зоны:</b><br>• ${intersects.join('<br>• ')}`;
  else content += `<b>Пересечений нет</b>`;
  L.popup().setLatLng(routePoints[0]).setContent(content).openOn(map);
  exitMode();
}

function finishPBLA() {
  if (routePoints.length < 3) { alert('Минимум 3 точки'); exitMode(); return; }
  const closed = [...routePoints, routePoints[0]];
  const poly = L.polygon(closed, { color: 'green', fillOpacity: 0.2 }).addTo(map);
  const intersects = checkIntersectionsForGeometry(routePoints, true);
  let content = `<b>П-БЛА</b><br><b>Точек:</b> ${routePoints.length}<br>`;
  if (intersects.length > 0) content += `<b>Пересекает зоны:</b><br>• ${intersects.join('<br>• ')}`;
  else content += `<b>Пересечений нет</b>`;
  poly.bindPopup(content).openPopup();
  exitMode();
}

// === ВРЕМЕННЫЕ ЛИНИИ Р-БЛА ===
function drawTempLine(e) {
  if (currentMode !== 'rbla' || !centerPoint) return;
  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) return;
  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);
  tempLine = L.polyline([centerPoint, e.latlng], { color: '#ffff00', weight: 3, dashArray: '8,8' }).addTo(map);
  tempLabel = L.marker(e.latlng, {
    icon: L.divIcon({
      className: 'distance-label',
      html: `<div>${Math.round(distance)} м</div>`,
      iconSize: [0, 0]
    })
  }).addTo(map);
}

// === МЕНЮ ЗОН ===
function createZoneToggleControl() {
  const container = document.createElement('div');
  container.style.cssText = 'position: absolute; bottom: 10px; right: 10px; z-index: 1000;';

  const btn = document.createElement('button');
  btn.className = 'zone-toggle-btn';
  btn.innerHTML = '⋮';
  btn.title = 'Фильтр зон';

  const menu = document.createElement('div');
  menu.className = 'zone-menu-container';

  ZONE_PREFIXES.forEach(prefix => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = prefix;
    checkbox.checked = true;
    checkbox.onchange = () => {
      if (checkbox.checked) map.addLayer(zoneLayers[prefix]);
      else map.removeLayer(zoneLayers[prefix]);
    };
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + prefix));
    menu.appendChild(label);
  });

  btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('active'); };
  document.addEventListener('click', () => menu.classList.remove('active'));
  menu.addEventListener('click', (e) => e.stopPropagation());

  container.appendChild(btn);
  container.appendChild(menu);
  document.body.appendChild(container);
}

// === ЗАПУСК ===
document.addEventListener('DOMContentLoaded', () => {
  initMap();
});
