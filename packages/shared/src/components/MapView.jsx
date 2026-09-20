import { useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function makeIcon(emoji, anchor = 'bottom') {
  const size = 32;
  const anchorY = anchor === 'center' ? size / 2 : size;
  return L.divIcon({
    className: 'leaflet-div-icon-go',
    html: `<div style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:50%;background:white;border:2px solid rgba(0,0,0,.15);box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:18px;">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, anchorY],
    popupAnchor: [0, -anchorY],
  });
}

const ICON_RESTAURANT = makeIcon('🍽️');
const ICON_CUSTOMER = makeIcon('📍', 'center');
const ICON_COURIER = makeIcon('🛵');

// react-leaflet v4 TIDAK menempelkan prop event (onClick, ...) ke peta — prop
// itu disebar ke opsi konstruktor Leaflet dan diabaikan diam-diam. Cara yang
// benar untuk mendengarkan event peta adalah hook useMapEvents di dalam komponen
// anak, dan ini yang ditangani di sini.
function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      if (onClick) onClick(e.latlng);
    },
  });
  return null;
}

/**
 * MapView — peta Leaflet (OpenStreetMap, gratis dipakai)
 * props:
 *   center, restaurant, customer, courier, route (array koordinat),
 *   onMapClick(ll)          — terpanggil saat peta diklik
 *   editablePoint + onPointChange(ll) — menampilkan pin yang bisa diseret; klik
 *       peta atau seret pin memanggil onPointChange({lat, lng})
 */
export default function MapView({ center, restaurant, customer, courier, route = [], onMapClick, editablePoint, onPointChange, editableShowRestaurant = false, className = 'h-64' }) {
  const mapRef = useRef(null);
  const editing = !!(editablePoint && onPointChange);
  // Klik peta memindahkan pin yang bisa diedit, atau memanggil onMapClick bila disediakan
  const handleClick = onMapClick || (editing ? (ll) => onPointChange({ lat: ll.lat, lng: ll.lng }) : null);

  // Ekspos instance Leaflet pada container untuk penggunaan/debugging programatik.
  // Callback ref terpanggil tepat saat react-leaflet v4 menetapkan instance peta.
  const setMapRef = useCallback((instance) => {
    mapRef.current = instance;
    if (instance) instance._container._sa7teinMap = instance;
  }, []);

  return (
    <MapContainer ref={setMapRef} center={center} zoom={15} className={`w-full rounded-2xl ${className}`} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {restaurant && (!editing || editableShowRestaurant) && <Marker position={[restaurant.lat, restaurant.lng]} icon={ICON_RESTAURANT} />}
      {!editing && customer && <Marker position={[customer.lat, customer.lng]} icon={ICON_CUSTOMER} />}
      {courier && <Marker position={[courier.lat, courier.lng]} icon={ICON_COURIER} />}
      {editing && (
        <Marker
          position={[editablePoint.lat, editablePoint.lng]}
          draggable
          icon={ICON_CUSTOMER}
          eventHandlers={{
            dragend: (e) => {
              const p = e.target.getLatLng();
              onPointChange({ lat: p.lat, lng: p.lng });
            },
          }}
        />
      )}
      {handleClick && <MapClickHandler onClick={handleClick} />}
      {route && route.length >= 2 && <Polyline positions={route} pathOptions={{ color: '#e04020', weight: 4, dashArray: '1 8' }} />}
    </MapContainer>
  );
}
