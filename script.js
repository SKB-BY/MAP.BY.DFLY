let map;
let flyZonesGeoJSON = null;
let flyZonesLayer = null;
let rblaMode = false;
let centerPoint = null;
let tempLine = null;
let tempLabel = null;
let tempCircle = null;
let radiusMeters = null;

function getZoneStyle(name) {
  // Устанавливаем базовые стили
  const style = {
    weight: 2,
    opacity: 0.9, // Прозрачность обводки
    fillOpacity: 0.3 // УВЕЛИЧЕНА прозрачность заливки для лучшей видимости
  };

  if (!name) {
    return {
      ...style,
      color: '#ff0000',
      fillColor: '#ff0000' // УБРАН rgba, используется hex + fillOpacity
    };
  }

  if (name.startsWith('UMU_')) {
    return {
      ...style,
      color: '#800080',
      fillColor: '#800080' // УБРАН rgba
    };
  } else if (name.startsWith('UMD_')) {
    return {
      ...style,
      color: '#654321',
      fillColor: '#b57e54' // УБРАН rgba
    };
  } else if (name.startsWith('UMP_')) {
    return {
      ...style,
      color: '#cc8400',
      fillColor: '#ffa500' // УБРАН rgba
    };
  } else if (name.startsWith('UMR_')) {
    return {
      ...style,
      color: '#cc0000',
      fillColor: '#ff0000' // УБРАН rgba
    };
  } else if (name.startsWith('ARD_')) {
    return {
      ...style,
      color: '#666666',
      fillColor: '#c8c8c8' // УБРАН rgba
    };
  } else {
    return {
      ...style,
      color: '#cc0000',
      fillColor: '#ff0000' // УБРАН rgba
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
          const name = feature.properties.name || 'Зона';
          const description = feature.properties.description || '';
          layer.bindPopup(`<b>${name}</b><br>${description}`);
        },
        style: function(feature) {
          return getZoneStyle(feature.properties.name);
        }
      }).addTo(map);
      
      console.log('✅ GeoJSON загружен. Объектов:', geojson.features.length);
    })
    .catch(err => {
      console.error('❌ Ошибка загрузки GeoJSON:', err);
      alert('⚠️ Не удалось загрузить зоны полёта. Проверьте файл Fly_Zones_BY.geojson.');
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

  document.getElementById('btn-calculate').style.display = 'block';
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
