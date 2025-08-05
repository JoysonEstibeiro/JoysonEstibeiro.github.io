// ----------------------------
// 1) Initialize map & basemap
// ----------------------------

// 📱 Check if the device is mobile-sized (viewport width < 768px)
const isMobile = window.innerWidth < 768;

// Set initial zoom based on screen size
const initialZoom = isMobile ? 9 : 10;

const map = L.map('map').setView([51.4772, -0.0376], initialZoom);

// Home button with SVG icon
const HomeButton = L.Control.extend({
  options: { position: 'topleft' },

  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-home');
    container.title = 'Reset to Home';
    container.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9L12 2l9 7v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4H9v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      </svg>
    `;
    container.onclick = function () {
      map.setView([51.4772, -0.0476], initialZoom);
    };
    return container;
  }
});
map.addControl(new HomeButton());

// Leaflet legend control (bottom-right)
const legend = L.control({ position: 'bottomright' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'info legend');
  div.innerHTML = `
    <h4>Legend</h4>
    <div><img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" class="legend-icon"> Stadiums</div>
    <div><span class="legend-circle pub-default"></span> Pubs</div>
    <div><span class="legend-circle pub-highlight"></span> Pubs (highlighted)</div>
    <div><span class="legend-polygon london"></span> Greater London</div>
  `;
  return div;
};
legend.addTo(map);

// Add basemap layer
// Using CARTO Light basemap
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> | Data: Stadiums and Pubs from <a href="https://overpass-turbo.eu/">OSM via Overpass Turbo</a>',
	subdomains: 'abcd',
	maxZoom: 18
}).addTo(map);

// ----------------------------
// 2) Load data (relative to index.html)
// ----------------------------
const STADIUMS_URL = 'data/stadiums.geojson'; // adjust if your filename differs
const PUBS_URL     = 'data/pubs.geojson';
const LONDON_URL = 'data/London.geojson';



let londonLayer; // will hold the boundary layer


let stadiumLayer, pubsLayer;
let highlightedPubs = [];
let activeBufferCircle = null;

// Styling for markers
const stadiumStyle = {
  radius: 8, weight: 2, color: '#2f6fed', fillColor: '#2f6fed', fillOpacity: 1
};
const stadiumMarkerStyle = {
  weight: 2, color: '#2f6fed', fillColor: '#1b8a45ff', fillOpacity: 1
};
const pubStyleDefault = {
  radius: 5, weight: 1, color: '#7a3e00', fillColor: '#ffd9a6', fillOpacity: 0.9
};
const pubStyleHighlight = {
  radius: 6, weight: 2, color: '#d42a1f', fillColor: '#e93723ff', fillOpacity: 1
};
const londonStyle = {
  color: '#105228ff',     // outline
  weight: 3,
  fillColor: '#b9e3c6', // light fill
  fillOpacity: 0.15
};

Promise.all([
  fetch(STADIUMS_URL).then(r => r.json()),
  fetch(PUBS_URL).then(r => r.json()),
  fetch(LONDON_URL).then(r => r.json())
  ]).then(([stadiumsGeoJSON, pubsGeoJSON, londonGeoJSON]) => {

   // --- London boundary ---
  londonLayer = L.geoJSON(londonGeoJSON, {
    style: londonStyle
  }).addTo(map);
  // Keep it beneath points
  londonLayer.bringToBack();
  // ----------------------------
  // 3) Stadiums layer
  //    Assumes properties: { id: <int>, name: <string>, ... }
  // ----------------------------
  stadiumLayer = L.geoJSON(stadiumsGeoJSON, {
    // pointToLayer: (feature, latlng) => L.circleMarker(latlng, stadiumStyle)  //if Using Circle markers intead of icons    
    onEachFeature: (feature, layer) => {
      layer._sid = feature.properties.id; // unique integer starting at 1
      const name = feature.properties.name || `Stadium #${layer._sid}`;
      layer.bindPopup(`<b>${name}</b>`);
      layer.on('click', () => focusStadium(layer));
    }
  }).addTo(map);

  // ----------------------------
  // 4) Pubs layer
  //    Assumes properties: { id: <int>, name?: <string>, ... }
  // ----------------------------
  pubsLayer = L.geoJSON(pubsGeoJSON, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, pubStyleDefault),
    onEachFeature: (feature, layer) => {
      layer._pid = feature.properties.id; // unique integer starting at 1
      const name = feature.properties.name || `Pub #${layer._pid}`;
      layer.bindPopup(`<b>${name}</b>`);
    }
  }).addTo(map);

  // ----------------------------
  // 5) Build sidebar list from stadiums
  // ----------------------------
  buildSidebar(stadiumsGeoJSON);

  console.log(stadiumsGeoJSON.features[0].properties);
}).catch(err => {
  console.error('Failed to load data:', err);
  document.getElementById('stadium-list').innerHTML =
    '<div style="color:#b00">Error loading data. Check file paths.</div>';
});


// ----------------------------
// Sidebar builder
// ----------------------------
function buildSidebar(stadiumsGeoJSON) {
  const list = document.getElementById('stadium-list');
  list.innerHTML = '';

  // Sort by name if available
  const feats = [...stadiumsGeoJSON.features].sort((a, b) => {
    const an = (a.properties.operator || '').toLowerCase();
    const bn = (b.properties.operator || '').toLowerCase();
    return an.localeCompare(bn);
  });

  feats.forEach(f => {
    const div = document.createElement('div');
    div.className = 'sidebar-item';
    const label = f.properties.operator ? f.properties.operator : `Stadium #${f.properties.id}`;
    div.textContent = label;

    div.onclick = () => {
      // find corresponding marker by id
      const marker = stadiumLayer.getLayers().find(l => l._sid === f.properties.id);
      if (marker) {
        map.setView(marker.getLatLng(), 14);
        marker.openPopup();
        focusStadium(marker);
      }
    };

    list.appendChild(div);
  });
}

// ----------------------------
// Highlight pubs within 1 km of a stadium
// Uses Turf.js for client-side point-in-buffer tests
// ----------------------------
function focusStadium(stadiumMarker) {
  // 1) Clear previous highlights
  highlightedPubs.forEach(layer => layer.setStyle(pubStyleDefault));
  highlightedPubs = [];


  // 2) Draw/update buffer circle (visual aid)
  if (activeBufferCircle) map.removeLayer(activeBufferCircle);
  const center = stadiumMarker.getLatLng();
  activeBufferCircle = L.circle(center, {
    radius: 1000,       // 1 km
    color: '#2f6fed',
    weight: 1,
    fillOpacity: 0.06
    }).addTo(map);
    activeBufferCircle.bringToBack();
  

  // 3) Build a Turf buffer (1 km) around stadium
  const turfCenter = turf.point([center.lng, center.lat]);
  const turfBuffer = turf.buffer(turfCenter, 1, { units: 'kilometers' });

  // 4) Test each pub against this buffer and highlight matches
  let count = 0;
  pubsLayer.eachLayer(pub => {
    const p = pub.getLatLng();
    const inside = turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), turfBuffer);
    if (inside) {
      pub.setStyle(pubStyleHighlight);
      highlightedPubs.push(pub);
      count++;
    } else {
      pub.setStyle(pubStyleDefault);
    }
  });

  // 5) Update summary text
  const name = stadiumMarker.feature?.properties?.name || `Stadium #${stadiumMarker._sid}`;
  const club = stadiumMarker.feature?.properties?.operator || 'Unknown Club';
  const summary = document.getElementById('summary');
  summary.innerHTML = `
    <div>Stadium: <u>${name}</u></div>
    <div>Club: <u>${club}</u></div>
    <div>Pubs within 1 km: <strong><span class="count-number">${count}</span></strong></div>
  `;
}