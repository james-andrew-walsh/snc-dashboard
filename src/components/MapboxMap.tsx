import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { TelematicsSnapshot } from '../lib/types'

interface MapboxMapProps {
  points: TelematicsSnapshot[]
}

function formatGpsTime(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) {
    const diffMin = Math.floor(diffMs / (1000 * 60))
    return diffMin <= 0 ? 'Just now' : `${diffMin} min ago`
  }
  if (diffHours < 24) return `${diffHours} hours ago`

  // Different day — show date + time
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function MapboxMap({ points }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token || token === 'pk.your_mapbox_token_here') {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 flex flex-col items-center justify-center h-full">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-10 h-10 text-slate-600 mb-3">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-slate-400 font-medium">Map View</p>
        <p className="text-xs text-slate-500 mt-1">Set VITE_MAPBOX_TOKEN to enable</p>
      </div>
    )
  }

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-119.8138, 39.5296],
      zoom: 11,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.on('load', () => setIsLoaded(true))

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build GeoJSON from points
  const buildGeoJSON = useCallback((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature' as const,
      properties: {
        equipmentCode: p.equipmentCode,
        engineStatus: p.engineStatus,
        isLocationStale: p.isLocationStale,
        locationDateTime: p.locationDateTime,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.longitude, p.latitude],
      },
    })),
  }), [points])

  // Update data when map is ready or points change
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    const map = mapRef.current
    const geojson = buildGeoJSON()

    const source = map.getSource('telematics') as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData(geojson)
      return
    }

    // First render — add source + layer
    map.addSource('telematics', { type: 'geojson', data: geojson })

    map.addLayer({
      id: 'telematics-dots',
      type: 'circle',
      source: 'telematics',
      paint: {
        'circle-radius': 5,
        'circle-color': [
          'case',
          ['==', ['get', 'engineStatus'], 'Active'],
          '#22c55e',
          '#6b7280',
        ],
        'circle-opacity': [
          'case',
          ['get', 'isLocationStale'],
          0.4,
          1,
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#0f172a',
      },
    })

    // Click handler for popups
    map.on('click', 'telematics-dots', (e) => {
      if (!e.features?.length) return
      const feat = e.features[0]
      const props = feat.properties!
      const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number]

      const stale = props.isLocationStale === true || props.isLocationStale === 'true'
      const statusColor = props.engineStatus === 'Active' ? '#22c55e' : '#6b7280'

      const html = `<div style="color:#1e293b;font-size:13px;line-height:1.5">
        <strong>${props.equipmentCode}</strong><br/>
        Engine: <span style="color:${statusColor};font-weight:600">${props.engineStatus === 'Active' ? 'Active' : 'Off'}</span><br/>
        GPS: ${formatGpsTime(props.locationDateTime)}
        ${stale ? '<br/><span style="color:#f59e0b">&#9888;&#65039; GPS stale</span>' : ''}
      </div>`

      popupRef.current?.remove()
      popupRef.current = new mapboxgl.Popup({ offset: 8, closeButton: false })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map)
    })

    // Pointer cursor on hover
    map.on('mouseenter', 'telematics-dots', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'telematics-dots', () => {
      map.getCanvas().style.cursor = ''
    })
  }, [isLoaded, buildGeoJSON])

  return <div ref={containerRef} className="w-full h-full" />
}
