let map;
let flyZonesGeoJSON = null;
let flyZonesLayer = null;
let rblaMode = false;
let centerPoint = null;
let tempLine = null;
let tempLabel = null;
let tempCircle = null;
let radiusMeters = null;
let coordinatesDisplay = null;
let operatorMarker = null;
let elevationCache = {};
let lastElevationRequest = 0;
const ELEVATION_REQUEST_DELAY = 1000;
let pendingElevationRequest = null;
let isTrackingCenter = true; // Флаг для отслеживания центра карты

function getZoneStyle(name) {
  const baseStyle = {
    weight: 2,
    opacity: 0.9,
    fillOpacity: 0.3
  };

  if (!name) {
    return {
      ...baseStyle,
      color: '#ff0000',
      fillColor: '#ff0000'
    };
  }

  if (name.startsWith('UMU_')) {
    return {
      ...baseStyle,
      color: '#800080',
      fillColor: '#800080'
    };
  } else if (name.startsWith('UMD_')) {
    return {
      ...baseStyle,
      color: '#654321',
      fillColor: '#b57e54'
    };
  } else if (name.startsWith('UMP_')) {
    return {
      ...baseStyle,
      color: '#cc8400',
      fillColor: '#ffa500'
    };
  } else if (name.startsWith('UMR_')) {
    return {
      ...baseStyle,
      color: '#cc0000',
      fillColor: '#ff0000'
    };
  } else if (name.startsWith('ARD_')) {
    return {
      ...baseStyle,
      color: '#666666',
      fillColor: '#c8c8c8'
    };
  } else if (name.startsWith('ARZ_')) {
    return {
      ...baseStyle,
      color: '#666666',
      fillColor: '#c8c8c8'
    };
  } else {
    return {
      ...baseStyle,
      color: '#cc0000',
      fillColor: '#ff0000'
    };
  }
}

async function getElevation(lat, lng) {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  
  if (elevationCache[cacheKey] !== undefined) {
    return elevationCache[cacheKey];
  }
  
  const now = Date.now();
  if (now - lastElevationRequest < ELEVATION_REQUEST_DELAY) {
    if (pendingElevationRequest) {
      return pendingElevationRequest;
    }
    return getApproximateElevation(lat, lng);
  }
  
  lastElevationRequest = now;
  
  pendingElevationRequest = new Promise(async (resolve) => {
    try {
      const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.results && data.results[0]) {
        const elevation = data.results[0].elevation;
        elevationCache[cacheKey] = elevation;
        resolve(elevation);
      } else {
        throw new Error('No elevation data in response');
      }
    } catch (error) {
      console.warn('Ошибка получения высоты, используем приблизительную:', error);
      const approximateElevation = getApproximateElevation(lat, lng);
      elevationCache[cacheKey] = approximateElevation;
      resolve(approximateElevation);
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
  coordinatesDisplay.innerHTML = `
    <div class="coordinates-content">
      <strong>Координаты:</strong> 53.900000, 27.566700 / <strong>Высота:</strong> 160 м.
    </div>
  `;
  document.body.appendChild(coordinatesDisplay);
}

function updateCoordinatesDisplay(coords, elevation = 0) {
  if (!coordinatesDisplay) return;
  
  const lat = coords[0].toFixed(6);
  const lng = coords[1].toFixed(6);
  
  coordinatesDisplay.innerHTML = `
    <div class="coordinates-content">
      <strong>Координаты:</strong> ${lat}, ${lng} / <strong>Высота:</strong> ${Math.round(elevation)} м.
    </div>
  `;
}

// Обновление координат центра карты
function updateCenterCoordinates() {
  if (!coordinatesDisplay || !map) return;
  
  const center = map.getCenter();
  getElevation(center.lat, center.lng).then(elevation => {
    updateCoordinatesDisplay([center.lat, center.lng], elevation);
  });
}

// Обновление координат при движении курсора
let cursorUpdateTimeout = null;
function updateCursorCoordinates(e) {
  if (cursorUpdateTimeout) {
    clearTimeout(cursorUpdateTimeout);
  }
  
  cursorUpdateTimeout = setTimeout(() => {
    isTrackingCenter = false;
    getElevation(e.latlng.lat, e.latlng.lng).then(elevation => {
      updateCoordinatesDisplay([e.latlng.lat, e.latlng.lng], elevation);
    });
  }, 100);
}

// Возврат к отслеживанию центра при уходе курсора
function resetToCenterTracking() {
  isTrackingCenter = true;
  updateCenterCoordinates();
}

function initMap() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    tap: isMobile,
    tapTolerance: isMobile ? 15 : 10
  }).setView([53.9, 27.5667], 10);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    detectRetina: isMobile
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    detectRetina: isMobile
  });
  const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
    detectRetina: isMobile
  });
  const hybrid = L.layerGroup([satellite, labels]);

  L.control.layers({
    'OSM': osm,
    'Спутник': satellite,
    'Гибрид': hybrid
  }, {}, { position: 'topright' }).addTo(map);

  osm.addTo(map);

  initCoordinatesDisplay();

  // События для отслеживания центра карты
  map.on('moveend', () => {
    if (isTrackingCenter) {
      updateCenterCoordinates();
    }
  });
  
  map.on('zoomend', () => {
    if (isTrackingCenter) {
      updateCenterCoordinates();
    }
  });

  // События для отслеживания курсора
  map.on('mousemove', updateCursorCoordinates);
  map.on('mouseout', resetToCenterTracking);

  if (isMobile) {
    map.on('touchmove', updateCursorCoordinates);
    map.on('touchend', resetToCenterTracking);
  }

  // Первоначальное обновление
  updateCenterCoordinates();

  loadZones();
  initButtons();
}

function loadZones() {
  fetch('Fly_Zones_BY.geojson')
    .then(res => {
      if (!res.ok) throw new Error(`GeoJSON не найден: ${res.status}`);
      return res.json();
    })
    .then(geojson => {
      flyZonesGeoJSON = geojson;
      
      flyZonesLayer = L.geoJSON(geojson, {
        onEachFeature: (feature, layer) => {
          const name = feature.properties.Name || feature.properties.name || 'Зона';
          const description = feature.properties.description || '';
          layer.bindPopup(`<b>${name}</b><br>${description}`);
        },
        style: function(feature) {
          const name = feature.properties.Name || feature.properties.name;
          return getZoneStyle(name);
        }
      }).addTo(map);
      
      console.log('✅ GeoJSON загружен. Объектов:', geojson.features.length);
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки GeoJSON:', err);
      alert('⚠️ Не удалось загрузить зоны. Проверьте файл Fly_Zones_BY.geojson.');
    });
}

function setOperatorMarker(latlng) {
  if (operatorMarker) {
    map.removeLayer(operatorMarker);
  }
  
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

function initButtons() {
  const btnRbla = document.getElementById('btn-rbla');
  const btnGps = document.getElementById('btn-gps');
  const btnCalculate = document.getElementById('btn-calculate');
  const btnOperator = document.getElementById('btn-operator');

  if (btnGps) {
    btnGps.addEventListener('click', () => {
      map.locate({ 
        setView: true, 
        maxZoom: 16,
        watch: false,
        enableHighAccuracy: true,
        timeout: 10000
      });
      
      map.once('locationfound', function(e) {
        if (btnOperator) {
          btnOperator.style.display = 'block';
        }
        
        L.marker(e.latlng).addTo(map)
          .bindPopup("Ваше местоположение")
          .openPopup();
          
        // Обновляем координаты после перемещения
        setTimeout(() => {
          isTrackingCenter = true;
          updateCenterCoordinates();
        }, 1000);
      });
      
      map.once('locationerror', function(e) {
        alert('Не удалось определить местоположение. Проверьте настройки GPS.');
      });
    });
  }

  if (btnOperator) {
    btnOperator.addEventListener('click', () => {
      const center = map.getCenter();
      setOperatorMarker(center);
      
      getElevation(center.lat, center.lng).then(elevation => {
        alert(`Маркер оператора установлен!\nКоординаты: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}\nВысота: ${Math.round(elevation)} м.`);
      });
    });
  }

  if (btnRbla) {
    btnRbla.addEventListener('click', () => {
      if (rblaMode) return;

      rblaMode = true;
      btnRbla.disabled = true;
      centerPoint = map.getCenter();

      map.dragging.disable();
      map.on('mousemove', drawTempLine);
      map.once('click', finishRadius);
    });
  }

  if (btnCalculate) {
    btnCalculate.addEventListener('click', () => {
      if (!tempCircle || !flyZonesGeoJSON) {
        alert('Нет данных для расчёта.');
        return;
      }

      const centerArr = [centerPoint.lng, centerPoint.lat];
      const circleFeature = turf.circle(centerArr, radiusMeters / 1000, { steps: 64 });

      const intersectingNames = [];
      flyZonesGeoJSON.features.forEach(zone => {
        try {
          if (turf.booleanIntersects(circleFeature, zone)) {
            const name = zone.properties.Name || zone.properties.name || 'Зона';
            if (!intersectingNames.includes(name)) {
              intersectingNames.push(name);
            }
          }
        } catch (e) {
          console.warn('Ошибка при проверке пересечения:', e);
        }
      });

      getElevation(centerPoint.lat, centerPoint.lng).then(elevation => {
        let content = `
          <b>Центр:</b> ${centerPoint.lat.toFixed(6)}, ${centerPoint.lng.toFixed(6)}<br>
          <b>Высота:</b> ${Math.round(elevation)} м.<br>
          <b>Радиус:</b> ${radiusMeters} м<br>
        `;
        if (intersectingNames.length > 0) {
          content += `<b>Пересекает зоны:</b><br>• ${intersectingNames.join('<br>• ')}`;
        } else {
          content += `<b>Пересечений нет</b>`;
        }

        tempCircle.bindPopup(content).openPopup();
      });

      btnCalculate.style.display = 'none';
    });
  }
}

function drawTempLine(e) {
  if (!rblaMode || !centerPoint) return;

  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) return;

  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);

  tempLine = L.polyline([centerPoint, e.latlng], {
    color: '#ffff00',
    weight: 3,
    dashArray: '8,8'
  }).addTo(map);

  tempLabel = L.marker(e.latlng, {
    icon: L.divIcon({
      className: 'distance-label',
      html: `<div>${Math.round(distance)} м</div>`,
      iconSize: [0, 0]
    })
  }).addTo(map);
}

function finishRadius(e) {
  if (!rblaMode) return;

  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) {
    resetRBLA();
    return;
  }

  radiusMeters = Math.ceil(distance / 50) * 50;

  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);

  if (tempCircle) map.removeLayer(tempCircle);

  tempCircle = L.circle(centerPoint, {
    radius: radiusMeters,
    color: 'red',
    fillOpacity: 0.2
  }).addTo(map);

  const btnCalculate = document.getElementById('btn-calculate');
  if (btnCalculate) {
    btnCalculate.style.display = 'block';
  }
  
  resetRBLA();
}

function resetRBLA() {
  rblaMode = false;
  const btnRbla = document.getElementById('btn-rbla');
  if (btnRbla) {
    btnRbla.disabled = false;
  }
  map.dragging.enable();
  map.off('mousemove', drawTempLine);
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
});
