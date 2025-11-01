// Инициализация карты — без атрибуций
const map = L.map('map', {
  zoomControl: true,
  attributionControl: false
}).setView([53.9, 27.5667], 10); // Минск по умолчанию

// Слои
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {});

// Спутниковый слой
const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {});

// Гибрид с НАДПИСЯМИ — Esri World Street Map (улицы, номера, дороги)
const streetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {});

// Гибрид = спутник + надписи
const hybrid = L.layerGroup([satellite, streetMap]);

// Контрол слоёв
L.control.layers({
  'OSM': osm,
  'Спутник': satellite,
  'Гибрид': hybrid
}, {}, { position: 'topright' }).addTo(map);

osm.addTo(map);

// Глобальные переменные
let flyZonesGeoJSON = null;
let rblaMode = false;
let centerPoint = null;
let tempLine = null;
let tempLabel = null;
let tempCircle = null;
let radiusMeters = null;

// Загрузка KML
fetch('Fly_Zones_BY.kml')
  .then(res => {
    if (!res.ok) throw new Error(`KML не найден: ${res.status}`);
    return res.text();
  })
  .then(kmlText => {
    const kml = new DOMParser().parseFromString(kmlText, 'text/xml');
    if (kml.documentElement.nodeName === 'parsererror') {
      throw new Error('Ошибка парсинга KML');
    }
    const geojson = toGeoJSON.kml(kml);
    flyZonesGeoJSON = geojson;
    omnivore.geojson(geojson)
      .bindPopup(layer => layer.feature.properties.name || 'Зона')
      .addTo(map);
  })
  .catch(err => {
    console.error('Ошибка загрузки KML:', err);
    // Не критично — можно продолжить без зон
  });

// Кнопки
const btnRbla = document.getElementById('btn-rbla');
const btnGps = document.getElementById('btn-gps');
const btnCalculate = document.getElementById('btn-calculate');

btnGps.addEventListener('click', () => {
  map.locate({ setView: true, maxZoom: 16 });
});

btnRbla.addEventListener('click', () => {
  if (rblaMode) return;
  rblaMode = true;
  btnRbla.disabled = true;
  centerPoint = map.getCenter();
  map.dragging.disable();
  map.on('mousemove', drawTempLine);
  map.on('click', finishRadius);
});

function drawTempLine(e) {
  if (!rblaMode || !centerPoint) return;

  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) return;

  // Удалить старые элементы
  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);

  // Линия
  tempLine = L.polyline([centerPoint, e.latlng], {
    color: 'blue',
    weight: 2,
    dashArray: '5,5'
  }).addTo(map);

  // Метка с расстоянием
  tempLabel = L.marker(e.latlng, {
    icon: L.divIcon({
      className: 'distance-label',
      html: `${Math.round(distance)} м`,
      iconSize: [0, 0]
    })
  }).addTo(map);
}

function finishRadius(e) {
  if (!rblaMode) return;

  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) {
    alert('Не удалось определить расстояние. Попробуйте снова.');
    resetRBLA();
    return;
  }

  radiusMeters = Math.ceil(distance / 50) * 50;

  // Удалить линию и метку
  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);

  // Создать окружность
  tempCircle = L.circle(centerPoint, {
    radius: radiusMeters,
    color: 'red',
    fillOpacity: 0.2
  }).addTo(map);

  btnCalculate.style.display = 'block';
  resetRBLA();
}

function resetRBLA() {
  rblaMode = false;
  btnRbla.disabled = false;
  map.dragging.enable();
  map.off('mousemove', drawTempLine);
  map.off('click', finishRadius);
}

btnCalculate.addEventListener('click', () => {
  if (!tempCircle || !flyZonesGeoJSON) {
    alert('Нет данных для расчёта.');
    return;
  }

  const centerArr = [centerPoint.lng, centerPoint.lat];
  const circleFeature = turf.circle(centerArr, radiusMeters / 1000, {
    steps: 64,
    units: 'kilometers'
  });

  const intersectingNames = [];
  const zones = turf.featureCollection(flyZonesGeoJSON.features);

  zones.features.forEach(zone => {
    try {
      if (turf.booleanIntersects(circleFeature, zone)) {
        const name = zone.properties.name || 'Безымянная зона';
        if (!intersectingNames.includes(name)) {
          intersectingNames.push(name);
        }
      }
    } catch (err) {
      console.warn('Ошибка пересечения:', err);
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
