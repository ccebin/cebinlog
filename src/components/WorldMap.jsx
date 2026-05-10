import React, { useEffect, useState, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import Globe from 'react-globe.gl'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Search, Map as MapIcon, Layers, Target, ExternalLink, RefreshCw, X, Crosshair, ZoomIn, ZoomOut, Globe as GlobeIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_BASE } from '../lib/apiBase'

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

/** useQuery data yokken `= []` her render’da yeni referans üretir → useEffect([people]) sonsuz döngü. */
const EMPTY_PEOPLE = []

// Leaflet fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapController({ center, zoom, setMode, setMapFocus, mode }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom, { animate: false });
      setTimeout(() => map.invalidateSize(), 100);
    }
  }, [center, zoom, map, mode]);

  useMapEvents({
    zoomend: () => {
      if (map.getZoom() < 3.5 && mode === '2d') {
        const c = map.getCenter();
        setMapFocus({ center: [c.lat, c.lng], zoom: 3 });
        setMode('3d');
      }
    }
  });
  return null;
}

export default function WorldMap({ setSelectedId, setView }) {
  const [mode, setMode] = useState('3d'); 
  const [locations, setLocations] = useState([]);
  const [mapFocus, setMapFocus] = useState({ center: [20, 0], zoom: 3 });
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });
  const [isRotating, setIsRotating] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const globeRef = useRef();
  const containerRef = useRef();

  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = isRotating;
        controls.autoRotateSpeed = 1.2;
      }
    }
  }, [isRotating, mode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { data: peopleData } = useQuery({
    queryKey: ['people'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })
  const people = peopleData ?? EMPTY_PEOPLE

  const globeArcs = useMemo(() => {
    if (!locations?.length || locations.length < 2) return []
    return locations.map((loc, i) => ({
      startLat: loc.lat,
      startLng: loc.lng,
      endLat: locations[(i + 1) % locations.length].lat,
      endLng: locations[(i + 1) % locations.length].lng,
      color: ['#00f2fe', '#7c4dff'],
    }))
  }, [locations])

  const peopleWithLocation = useMemo(
    () => people.filter((p) => String(p.location ?? '').trim()),
    [people],
  )

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return peopleWithLocation
    return peopleWithLocation.filter((p) => {
      const dn = (p.display_name || '').toLowerCase()
      const un = (p.username || '').toLowerCase()
      const loc = (p.location || '').toLowerCase()
      const rn = (p.real_name || '').toLowerCase()
      const id = String(p.id || '').toLowerCase()
      return dn.includes(q) || un.includes(q) || loc.includes(q) || rn.includes(q) || id.includes(q)
    })
  }, [peopleWithLocation, searchQuery])

  useEffect(() => {
    const buildLocations = async () => {
      const withLoc = people.filter((p) => String(p.location ?? '').trim())
      if (withLoc.length === 0) {
        setLocations([])
        return
      }
      const newLocs = []
      const coordCounts = new Map()
      for (const p of withLoc) {
        let lat
        let lng
        const cLat = p.location_lat ?? p.locationLat
        const cLng = p.location_lng ?? p.locationLng
        if (cLat != null && cLng != null && Number.isFinite(Number(cLat)) && Number.isFinite(Number(cLng))) {
          lat = Number(cLat)
          lng = Number(cLng)
        } else {
          try {
            const res = await axios.get(`${API_BASE}/geocode`, {
              params: { format: 'json', q: p.location, limit: 1 },
              headers: getHeaders(),
            })
            if (!res.data?.[0]) continue
            lat = parseFloat(res.data[0].lat)
            lng = parseFloat(res.data[0].lon)
          } catch {
            continue
          }
          await new Promise((r) => setTimeout(r, 220))
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
        const count = coordCounts.get(key) || 0
        coordCounts.set(key, count + 1)
        let adjLat = lat
        let adjLng = lng
        if (count > 0) {
          adjLat += Math.cos(count) * 0.0005
          adjLng += Math.sin(count) * 0.0005
        }
        newLocs.push({ ...p, lat: adjLat, lng: adjLng })
      }
      setLocations(newLocs)
    }
    buildLocations()
  }, [people])

  const handleSelectTarget = async (person) => {
    let loc = locations.find((l) => l.id === person.id)
    if (!loc && String(person.location ?? '').trim()) {
      try {
        const res = await axios.get(`${API_BASE}/geocode`, {
          params: { format: 'json', q: person.location, limit: 1 },
          headers: getHeaders(),
        })
        if (res.data?.[0]) {
          const lat = parseFloat(res.data[0].lat)
          const lng = parseFloat(res.data[0].lon)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            loc = { ...person, lat, lng }
            setLocations((prev) => [...prev.filter((x) => x.id !== person.id), loc])
          }
        }
      } catch {
        /* Nominatim / ağ */
      }
    }
    if (loc) {
      if (mode === '2d') setMapFocus({ center: [loc.lat, loc.lng], zoom: 14 })
      else {
        globeRef.current?.pointOfView({ lat: loc.lat, lng: loc.lng, altitude: 0.5 }, 1500)
        setIsRotating(false)
      }
    }
    setSearchQuery('')
    setIsSearchFocused(false)
  }

  const getAvatarUrl = p => {
    if (!p.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    const isGif = p.avatar.startsWith('a_');
    return `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${isGif ? 'gif' : 'png'}?size=64`;
  };

  const createIcon = p => L.divIcon({
    className: 'custom-icon',
    html: `<div class="w-12 h-12 rounded-full border-2 border-primary bg-background overflow-hidden shadow-lg"><img src="${getAvatarUrl(p)}" class="w-full h-full object-cover" /></div>`,
    iconSize: [48, 48], iconAnchor: [24, 24]
  });

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] space-y-6 relative group overflow-hidden">
      <div className="flex justify-between items-center z-[100] gap-4">
        <div className="flex-1 max-w-md relative">
          <div className={`flex items-center bg-background/50 backdrop-blur-xl border ${isSearchFocused ? 'border-primary' : 'border-border'} rounded-2xl px-4 py-2 transition-all shadow-lg`}>
            <Search className={`w-5 h-5 ${isSearchFocused ? 'text-primary' : 'text-muted-foreground'}`} />
            <input 
              type="text" 
              placeholder="Hedef ara..." 
              className="bg-transparent border-none outline-none flex-1 ml-3 text-sm placeholder:text-muted-foreground/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          <AnimatePresence>
            {isSearchFocused && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-background/80 backdrop-blur-2xl border border-border rounded-2xl overflow-hidden shadow-2xl z-[110]"
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {peopleWithLocation.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">Konum bilgisi olan hedef yok. Kişi kartından konum ekleyin.</p>
                  ) : searchMatches.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">Aramanızla eşleşen hedef yok.</p>
                  ) : (
                    searchMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectTarget(p)}
                        className="w-full flex items-center gap-3 p-2 hover:bg-primary/10 rounded-xl transition-all text-left group"
                      >
                        <div className="w-10 h-10 rounded-full border border-border overflow-hidden bg-muted">
                          <img src={getAvatarUrl(p)} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.display_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.location || 'Konum'}</p>
                        </div>
                        <Target className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <button 
          onClick={() => setMode(mode === '2d' ? '3d' : '2d')}
          className="px-6 py-3 bg-primary/10 border border-primary/30 rounded-2xl text-primary text-[10px] font-black uppercase hover:bg-primary/20 transition-all shadow-lg flex items-center gap-2 whitespace-nowrap"
        >
          {mode === '2d' ? <GlobeIcon className="w-4 h-4"/> : <MapIcon className="w-4 h-4"/>}
          {mode === '2d' ? '3D GÖRÜNÜM' : '2D HARİTA'}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 relative rounded-[40px] border border-border overflow-hidden shadow-2xl bg-black">
        {/* 2D MAP LAYER - ALWAYS IN DOM */}
        <div className={`absolute inset-0 transition-opacity duration-500 ${mode === '2d' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <MapContainer center={mapFocus.center} zoom={mapFocus.zoom} minZoom={2} maxZoom={20} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
            <MapController center={mapFocus.center} zoom={mapFocus.zoom} setMode={setMode} setMapFocus={setMapFocus} mode={mode} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" opacity={0.8} />
            {locations.map(loc => (
              <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={createIcon(loc)}>
                <Popup><div className="p-2 font-bold text-center">{loc.display_name}<br/><button onClick={() => { setSelectedId(loc.id); setView('people'); }} className="mt-2 bg-primary text-white px-3 py-1 rounded text-[10px]">Profil</button></div></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* 3D GLOBE LAYER - ALWAYS IN DOM */}
        <div className={`absolute inset-0 transition-opacity duration-500 ${mode === '3d' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <Globe
            ref={globeRef}
            onGlobeReady={() => {
              if (globeRef.current) {
                const controls = globeRef.current.controls();
                if (controls) {
                  controls.autoRotate = isRotating;
                  controls.autoRotateSpeed = 1.2;
                }
              }
            }}
            width={dimensions.width} height={dimensions.height} backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
            bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
            showAtmosphere={true} atmosphereColor="#1a0b4d" atmosphereAltitude={0.28}
            ringsData={locations}
            ringLat="lat"
            ringLng="lng"
            ringColor={() => '#7c4dff'}
            ringMaxRadius={2}
            ringPropagationSpeed={3}
            arcsData={globeArcs}
            arcColor="color" arcDashLength={0.6} arcDashGap={1.5} arcDashAnimateTime={1500} arcStroke={0.6} arcCurve={0.4}
            onZoom={({ altitude }) => {
              if (altitude < 1.0) setIsRotating(false);
              if (altitude < 0.5 && mode === '3d') {
                const pov = globeRef.current?.pointOfView() || { lat: 0, lng: 0 };
                setMapFocus({ center: [pov.lat, pov.lng], zoom: 14 });
                setMode('2d');
              }
            }}
            htmlElementsData={locations}
            htmlLat="lat"
            htmlLng="lng"
            htmlElement={d => {
              const el = document.createElement('div');
              el.style.transform = 'translate(-50%, -50%)'; el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer';
              el.innerHTML = `<div class="w-12 h-12 rounded-full border-2 border-primary bg-background overflow-hidden"><img src="${getAvatarUrl(d)}" class="w-full h-full object-cover" /></div>`;
              el.onclick = (e) => { 
                e.stopPropagation();
                setSelectedId(d.id); 
                globeRef.current?.pointOfView({ lat: d.lat, lng: d.lng, altitude: 0.5 }, 1200); 
                setIsRotating(false);
                const controls = globeRef.current?.controls();
                if (controls) controls.autoRotate = false;
              };
              el.ondblclick = () => { setMapFocus({ center: [d.lat, d.lng], zoom: 14 }); setMode('2d'); };
              return el;
            }}
            onGlobeClick={() => setIsRotating(true)}
            onBackgroundClick={() => setIsRotating(true)}
          />
        </div>

        <div className="absolute bottom-10 left-10 z-[20]">
          <button 
            onClick={() => { 
              if (mode === '2d') {
                setMapFocus({ center: [20, 0], zoom: 3 });
              } else {
                globeRef.current?.pointOfView({ lat: 0, lng: 0, altitude: 2.5 }, 1000);
                setIsRotating(true);
              }
            }} 
            className="p-3 bg-background/80 backdrop-blur-xl border border-border rounded-2xl hover:bg-primary/20 hover:text-primary transition-all shadow-2xl"
          >
            <Crosshair className="w-5 h-5" />
          </button>
        </div>
      </div>
      <style>{`.leaflet-container { background: #060606 !important; } .custom-popup .leaflet-popup-content-wrapper { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }`}</style>
    </div>
  )
}
