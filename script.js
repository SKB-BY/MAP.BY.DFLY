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

function getZoneStyle(name) {
  // Базовые стили для всех зон
  const baseStyle = {
    weight: 2,
    opacity: 0.9,     // Прозрачность контура
    fillOpacity: 0.3  // Прозрачность заливки (увеличена для лучшей видимости)
  };

  if (!name) {
    return {
      ...baseStyle,
      color: '#ff0000',    // Красный контур
      fillColor: '#ff0000' // Красная заливка
    };
  }

  // Определяем цвета в зависимости от типа зоны
  if (name.startsWith('UMU_')) {
    return {
      ...baseStyle,
      color: '#800080',    // Темно-фиолетовый контур
      fillColor: '#800080' // Фиолетовая заливка
    };
  } else if (name.startsWith('UMD_')) {
    return {
      ...baseStyle,
      color: '#654321',    // Темно-коричневый контур
      fillColor: '#b57e54' // Светло-коричневая заливка
    };
  } else if (name.startsWith('UMP_')) {
    return {
      ...baseStyle,
      color: '#cc8400',    // Темно-оранжевый контур
      fillColor: '#ffa500' // Оранжевая заливка
    };
  } else if (name.startsWith('UMR_')) {
    return {
      ...baseStyle,
      color: '#cc0000',    // Темно-красный контур
      fillColor: '#ff0000' // Красная заливка
    };
  } else if (name.startsWith('ARD_')) {
    return {
      ...baseStyle,
      color: '#666666',    // Темно-серый контур
      fillColor: '#c8c8c8' // Светло-серовая заливка
    };
  } else if (name.startsWith('ARZ_')) {
    return {
      ...baseStyle,
      color: '#666666',    // Темно-серый контур
      fillColor: '#c8c8c8' // Светло-серовая заливка
    };
  } else {
    return {
      ...baseStyle,
      color: '#cc0000',    // Контур по умолчанию
      fillColor: '#ff0000' // Заливка по умолчанию
    };
  }
}

function initCoordinatesDisplay() {
  // Создаем элемент для отображения координат
  coordinatesDisplay = L.control({ position: 'bottomleft' });

  coordinatesDisplay.onAdd = function(map) {
    this._div = L.DomUtil.create('div', 'coordinates-display');
    this.update([53.9, 27.5667]); // Начальные координаты
    return this._div;
  };

  coordinatesDisplay.update = function(coords) {
    const lat = coords[0].toFixed(6);
    const lng = coords[1].toFixed(6);
    this._div.innerHTML = `
      <div class="coordinates-content">
        <strong>Координаты:</strong><br>
        Ш: ${lat}°<br>
        Д: ${lng}°
      </div>
    `;
  };

  coordinatesDisplay.addTo(map);
}

function updateCoordinates(e) {
  if (coordinatesDisplay) {
    coordinatesDisplay.update([e.latlng.lat, e.latlng.lng]);
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

  // Инициализация отображения координат
  initCoordinatesDisplay();

  // Событие перемещения курсора по карте
  map.on('mousemove', updateCoordinates);

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
          // ИСПРАВЛЕНИЕ: используем Name с заглавной буквы
          const name = feature.properties.Name || feature.properties.name || 'Зона';
          const description = feature.properties.description || '';
          layer.bindPopup(`<b>${name}</b><br>${description}`);
        },
        style: function(feature) {
          // ИСПРАВЛЕНИЕ: используем Name с заглавной буквы
          const name = feature.properties.Name || feature.properties.name;
          return getZoneStyle(name);
        }
      }).addTo(map);
      
      console.log('✅ GeoJSON загружен. Объектов:', geojson.features.length);
      // Добавим отладочную информацию
      if (geojson.features.length > 0) {
        console.log('🔍 Пример свойств первого объекта:', geojson.features[0].properties);
        console.log('🔍 Имя зоны:', geojson.features[0].properties.Name || geojson.features[0].properties.name);
      }
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки GeoJSON:', err);
      alert('⚠️ Не удалось загрузить зоны. Проверьте файл Fly_Zones_BY.geojson.');
    });
}

function initButtons() {
  const btnRbla = document.getElementById('btn-rbla');
  const btnGps = document.getElementById('btn-gps');
  const btnCalculate = document.getElementById('btn-calculate');

  if (btnGps) {
    btnGps.addEventListener('click', () => {
      map.locate({ setView: true, maxZoom: 21 });
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
            // ИСПРАВЛЕНИЕ: используем Name с заглавной буквы
            const name = zone.properties.Name || zone.properties.name || 'Зона';
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
