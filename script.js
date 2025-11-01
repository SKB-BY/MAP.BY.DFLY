// Инициализация карты — ВАЖНО: attributionControl: false
const map = L.map('map', {
  zoomControl: true,
  attributionControl: false // 🔥 Отключаем показ атрибуций
}).setView([53.9, 27.5667], 10); // Минск по умолчанию

// Слои — БЕЗ атрибуций!
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  // attribution: '' — НИЧЕГО НЕ ПИШЕМ!
});

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  // attribution: '' — НИЧЕГО НЕ ПИШЕМ!
});

const hybrid = L.layerGroup([
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')
]);

// Контрол слоёв — но без атрибуций в названиях
L.control.layers({
  'OSM': osm,
  'Спутник': satellite,
  'Гибрид': hybrid
}, {}, { position: 'topright' }).addTo(map);

osm.addTo(map);

// Масштаб — можно оставить, он не содержит рекламы
L.control.scale({ imperial: false, maxWidth: 200 }).addTo(map);

// Загрузка зон
let flyZonesGeoJSON = null;
let flyZonesLayer = null;

fetch('Fly_Zones_BY.kml')
  .then(res => {
    if (!res.ok) throw new Error('KML не найден');
    return res.text();
  })
  .then(kmlText => {
    const kml = new DOMParser().parseFromString(kmlText, 'text/xml');
    const geojson = toGeoJSON.kml(kml);
    flyZonesGeoJSON = geojson;
    flyZonesLayer = omnivore.geojson(geojson)
      .bindPopup(layer => layer.feature.properties.name || 'Зона')
      .addTo(map);
  })
  .catch(err => {
    console.warn('Не удалось загрузить Fly_Zones_BY.kml:', err);
  });

// Глобальные переменные режима Р-БЛА
let rblaMode = false;
let centerPoint = null;
let tempLine = null;
let tempCircle = null;
let radiusMeters = null;

// Кнопки
const btnRbla = document.getElementById('btn-rbla');
const btnGps = document.getElementById('btn-gps');
const btnCalculate = document.getElementById('btn-calculate');

btnGps.addEventListener('click', () => {
  map.locate({ setView: true, maxZoom: 16 });
});

btnRbla.addEventListener('click', () => {
  rblaMode = true;
  btnRbla.disabled = true;
  centerPoint = map.getCenter();
  map.dragging.disable();
  map.on('mousemove', drawTempLine);
  map.on('click', finishRadius);
});

function drawTempLine(e) {
  if (!rblaMode) return;
  if (tempLine) map.removeLayer(tempLine);
  const distance = map.distance(centerPoint, e.latlng);
  tempLine = L.polyline([centerPoint, e.latlng], { color: 'blue', dashArray: '5,5' }).addTo(map);
}

function finishRadius(e) {
  if (!rblaMode) return;
  map.off('mousemove', drawTempLine);
  map.off('click', finishRadius);
  map.dragging.enable();

  const distance = map.distance(centerPoint, e.latlng);
  radiusMeters = Math.ceil(distance / 50) * 50;

  if (tempLine) map.removeLayer(tempLine);
  if (tempCircle) map.removeLayer(tempCircle);

  tempCircle = L.circle(centerPoint, {
    radius: radiusMeters,
    color: 'red',
    fillOpacity: 0.2
  }).addTo(map);

  btnCalculate.style.display = 'block';
  rblaMode = false;
}

btnCalculate.addEventListener('click', () => {
  if (!flyZonesGeoJSON || !tempCircle) return;

  // Создаём круг в GeoJSON через Turf (в км!)
  const centerArr = [centerPoint.lng, centerPoint.lat];
  const circleFeature = turf.circle(centerArr, radiusMeters / 1000, {
    steps: 64,
    units: 'kilometers'
  });

  const intersectingNames = [];

  // Проходим по всем объектам в KML
  turf.featureCollection(flyZonesGeoJSON.features).features.forEach(zone => {
    try {
      if (turf.booleanIntersects(circleFeature, zone)) {
        const name = zone.properties.name || 'Безымянная зона';
        if (!intersectingNames.includes(name)) {
          intersectingNames.push(name);
        }
      }
    } catch (err) {
      console.warn('Ошибка при проверке пересечения:', err);
    }
  });

  let popupContent = `
    <b>Центр:</b> ${centerPoint.lat.toFixed(6)}, ${centerPoint.lng.toFixed(6)}<br>
    <b>Радиус:</b> ${radiusMeters} м<br>
  `;
  if (intersectingNames.length > 0) {
    popupContent += `<b>Пересекает зоны:</b><br>• ${intersectingNames.join('<br>• ')}`;
  } else {
    popupContent += `<b>Пересечений нет</b>`;
  }

  tempCircle.bindPopup(popupContent).openPopup();
  btnCalculate.style.display = 'none';
});
