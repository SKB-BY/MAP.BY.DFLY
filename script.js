let map;
let flyZonesGeoJSON = null;
let flyZonesLayer = null;
let rblaMode = false;
let centerPoint = null;
let tempLine = null;
let tempLabel = null;
let tempCircle = null;
let radiusMeters = null;

function getZoneStyle(zoneName) {
  // Базовые стили для всех зон
  const baseStyle = {
    weight: 2,
    opacity: 0.9,     // Прозрачность контура
    fillOpacity: 0.3  // Прозрачность заливки
  };

  if (!zoneName) {
    return {
      ...baseStyle,
      color: '#ff0000',
      fillColor: '#ff0000'
    };
  }

  // Определяем цвета в зависимости от типа зоны
  if (zoneName.startsWith('UMU_')) {
    return {
      ...baseStyle,
      color: '#800080',
      fillColor: '#800080'
    };
  } else if (zoneName.startsWith('UMD_')) {
    return {
      ...baseStyle,
      color: '#654321',
      fillColor: '#b57e54'
    };
  } else if (zoneName.startsWith('UMP_')) {
    return {
      ...baseStyle,
      color: '#cc8400',
      fillColor: '#ffa500'
    };
  } else if (zoneName.startsWith('UMR_')) {
    return {
      ...baseStyle,
      color: '#cc0000',
      fillColor: '#ff0000'
    };
  } else {
    return {
      ...baseStyle,
      color: '#cc0000',
      fillColor: '#ff0000'
    };
  }
}

function initMap() {
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([53.9, 27.5667], 10);

  // Слои
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {});
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {});
  const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {});
  const hybrid = L.layerGroup([satellite, labels]);

  L.control.layers({
    'OSM': osm,
    'Спутник': satellite,
    'Гибрид': hybrid
  }, {}, { position: 'topright' }).addTo(map);

  osm.addTo(map);

  // Загрузка GeoJSON из файла
  loadZones();

  // Кнопки
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
      
      // Создаем слой с динамической стилизацией
      flyZonesLayer = L.geoJSON(geojson, {
        onEachFeature: (feature, layer) => {
          // ИСПРАВЛЕНИЕ: используем "Name" вместо "name"
          const name = feature.properties.Name || 'Зона';
          const description = feature.properties.description || '';
          layer.bindPopup(`<b>${name}</b><br>${description}`);
        },
        style: function(feature) {
          // ИСПРАВЛЕНИЕ: используем "Name" вместо "name"
          return getZoneStyle(feature.properties.Name);
        }
      }).addTo(map);
      
      console.log('✅ GeoJSON загружен. Объектов:', geojson.features.length);
      console.log('✅ Пример свойств первого объекта:', geojson.features[0]?.properties);
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки GeoJSON:', err);
      alert('⚠️ Не удалось загрузить зоны ограничений. Проверьте файл Fly_Zones_BY.geojson.');
    });
}

function initButtons() {
  const btnRbla = document.getElementById('btn-rbla');
  const btnGps = document.getElementById('btn-gps');
  const btnCalculate = document.getElementById('btn-calculate');

  if (btnGps) {
    btnGps.addEventListener('click', () => {
      map.locate({ setView: true, maxZoom: 16 });
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
            // ИСПРАВЛЕНИЕ: используем "Name" вместо "name"
            const name = zone.properties.Name || 'Зона';
            if (!intersectingNames.includes(name)) {
              intersectingNames.push(name);
            }
          }
        } catch (e) {
          console.warn('Ошибка при проверке пересечения:', e);
        }
      });

      let content = `
        <b>Центр:</b> ${centerPoint.lat.toFixed(6)}, ${centerPoint.lng.toFixed(6)}<br>
        <b>Радиус:</b> ${radiusMeters} м<br>
      `;
      if (intersectingNames.length > 0) {
        content += `<b>Пересекает зоны:</b><br>• ${intersectingNames.join('<br>• ')}`;
      } else {
        content += `<b>Пересечений нет</b>`;
      }

      tempCircle.bindPopup(content).openPopup();
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
    fillColor: 'red',
    fillOpacity: 0.2,
    opacity: 0.7
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
