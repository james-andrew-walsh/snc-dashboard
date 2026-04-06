import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Location, DispatchEvent, Equipment, Job, Employee } from '../lib/types'

interface MapboxMapProps {
  locations: Location[]
  activeDispatches: DispatchEvent[]
  equipment: Equipment[]
  jobs: Job[]
  employees: Employee[]
}

const STATUS_COLORS: Record<string, string> = {
  'Available': '#3b82f6',
  'In Use': '#22c55e',
  'Down': '#ef4444',
}

export function MapboxMap({ locations, activeDispatches, equipment, jobs, employees }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const addedLayersRef = useRef<string[]>([])
  const addedSourcesRef = useRef<string[]>([])
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

  // Effect 1: initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-119.8138, 39.5296],
      zoom: 10,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => setIsLoaded(true))

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: render data when map is ready and data has arrived
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    const map = mapRef.current

    // Remove existing layers then sources
    for (const layerId of addedLayersRef.current) {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
    }
    for (const sourceId of addedSourcesRef.current) {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    addedLayersRef.current = []
    addedSourcesRef.current = []

    // Add geofence polygons
    locations.forEach((loc) => {
      if (!loc.geofence || !loc.latitude || !loc.longitude) return

      const sourceId = `geofence-${loc.id}`
      const fillId = `${sourceId}-fill`
      const lineId = `${sourceId}-line`

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [loc.geofence],
          },
        } as GeoJSON.Feature,
      })
      addedSourcesRef.current.push(sourceId)

      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': 'rgba(249, 115, 22, 0.15)',
          'fill-outline-color': 'rgb(249, 115, 22)',
        },
      })
      addedLayersRef.current.push(fillId)

      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': 'rgb(249, 115, 22)',
          'line-width': 2,
        },
      })
      addedLayersRef.current.push(lineId)
    })

    // Add location labels
    const labelFeatures: GeoJSON.Feature[] = locations
      .filter((loc) => loc.latitude && loc.longitude)
      .map((loc) => ({
        type: 'Feature' as const,
        properties: { code: loc.code },
        geometry: {
          type: 'Point' as const,
          coordinates: [loc.longitude!, loc.latitude!],
        },
      }))

    if (labelFeatures.length > 0) {
      map.addSource('location-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: labelFeatures },
      })
      addedSourcesRef.current.push('location-labels')

      map.addLayer({
        id: 'location-labels-text',
        type: 'symbol',
        source: 'location-labels',
        layout: {
          'text-field': ['get', 'code'],
          'text-size': 12,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#f97316',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      })
      addedLayersRef.current.push('location-labels-text')
    }

    // Add equipment markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const equipMap = new Map(equipment.map((e) => [e.id, e]))
    const jobMap = new Map(jobs.map((j) => [j.id, j]))
    const locMap = new Map(locations.map((l) => [l.id, l]))
    const empMap = new Map(employees.map((e) => [e.id, e]))

    activeDispatches.forEach((dispatch) => {
      const equip = equipMap.get(dispatch.equipmentId)
      if (!equip) return

      const job = jobMap.get(dispatch.jobId)
      if (!job || !job.locationId) return

      const loc = locMap.get(job.locationId)
      if (!loc || !loc.latitude || !loc.longitude) return

      const operator = empMap.get(dispatch.operatorId)
      const color = STATUS_COLORS[equip.status] ?? '#6b7280'

      // Create colored marker element
      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.backgroundColor = color
      el.style.border = '2px solid white'
      el.style.cursor = 'pointer'
      el.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)'

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
        `<div style="color:#1e293b;font-size:13px;line-height:1.4">
          <strong>${equip.make} ${equip.model}</strong> (${equip.code})<br/>
          Status: <span style="color:${color};font-weight:600">${equip.status}</span><br/>
          ${operator ? `Operator: ${operator.firstName} ${operator.lastName}` : 'Operator: —'}
        </div>`
      )

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([loc.longitude!, loc.latitude!])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [isLoaded, locations, activeDispatches, equipment, jobs, employees])

  return <div ref={containerRef} className="w-full h-full" />
}
