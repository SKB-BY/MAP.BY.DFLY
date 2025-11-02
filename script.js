let map;
let flyZonesGeoJSON = null;
let flyZonesLayer = null;
let rblaMode = false;
let centerPoint = null;
let tempLine = null;
let tempLabel = null;
let tempCircle = null;
let radiusMeters = null;

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

  osm.addTo(map); // По умолчанию — OSM

  // Загрузка KML
  loadKML();

  // Кнопки
  initButtons();
}

function loadKML() {
  fetch('Fly_Zones_BY.kml', {
    headers: {
      'Accept': 'text/plain'
    }
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(kmlText => {
      const kml = new DOMParser().parseFromString(kmlText, 'text/xml');
      if (kml.documentElement.nodeName === 'parsererror') {
        throw new Error('Ошибка парсинга KML');
      }
      const geojson = toGeoJSON.kml(kml);
      flyZonesGeoJSON = geojson;
      flyZonesLayer = L.geoJSON(geojson, {
        onEachFeature: (feature, layer) => {
          const name = feature.properties.name || 'Зона';
          layer.bindPopup(`<b>${name}</b>`);
        },
        style: { color: '#ff0000', weight: 2, fillOpacity: 0.1 }
      }).addTo(map);
      console.log('✅ KML загружен. Объектов:', geojson.features.length);
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки KML:', err);
      alert('⚠️ Не удалось загрузить зоны полёта. Проверьте файл Fly_Zones_BY.kml.');
    });
}

function initButtons() {
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
    map.once('click', finishRadius);
  });

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
          const name = zone.properties.name || 'Зона';
          if (!intersectingNames.includes(name)) {
            intersectingNames.push(name);
          }
        }
      } catch (e) {}
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

function drawTempLine(e) {
  if (!rblaMode || !centerPoint) return;

  const distance = map.distance(centerPoint, e.latlng);
  if (isNaN(distance)) return;

  if (tempLine) map.removeLayer(tempLine);
  if (tempLabel) map.removeLayer(tempLabel);

  tempLine = L.polyline([centerPoint, e.latlng], {
    color: '#ffff00', // Жёлтый — хорошо виден на спутнике
    weight: 3,
    dashArray: '8,8'
  }).addTo(map);

  tempLabel = L.marker(e.latlng, {
    icon: L.divIcon({
      className: 'distance-label',
      html: `<div style="background: rgba(255,255,255,0.9); padding: 6px 10px; border: 3px solid #ff0000; border-radius: 6px; font-size: 20px; font-weight: bold; box-shadow: 0 0 8px rgba(0,0,0,0.7); color: #000; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${Math.round(distance)} м</div>`,
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

  btnCalculate.style.display = 'block';
  resetRBLA();
}

function resetRBLA() {
  rblaMode = false;
  document.getElementById('btn-rbla').disabled = false;
  map.dragging.enable();
  map.off('mousemove', drawTempLine);
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
});
