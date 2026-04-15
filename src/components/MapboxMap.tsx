import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type { TelematicsSnapshot, SiteLocation, ProviderDiscrepancy } from '../lib/types'

interface MapboxMapProps {
  points: TelematicsSnapshot[]
  geofences?: SiteLocation[]
  drawMode?: boolean
  onDrawComplete?: (polygon: GeoJSON.Polygon) => void
  onDrawCancel?: () => void
  comparisonMode?: boolean
  discrepancies?: Map<string, ProviderDiscrepancy>
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

  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function MapboxMap({ points, geofences = [], drawMode = false, onDrawComplete, onDrawCancel, comparisonMode = false, discrepancies }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
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
      if (drawRef.current && map) {
        try { map.removeControl(drawRef.current as unknown as mapboxgl.IControl) } catch { /* already removed */ }
        drawRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build GeoJSON from points
  const buildGeoJSON = useCallback((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: points.map((p) => {
      const hasDiscrepancy = comparisonMode && discrepancies?.has(p.equipmentCode) || false
      return {
        type: 'Feature' as const,
        properties: {
          equipmentCode: p.equipmentCode,
          engineStatus: p.engineStatus,
          engineStatusAt: p.engineStatusAt ?? '',
          isLocationStale: p.isLocationStale,
          locationDateTime: p.locationDateTime,
          make: p.make ?? '',
          model: p.model ?? '',
          equipmentDescription: p.equipmentDescription ?? '',
          provider: p.provider ?? '',
          idleHours: p.idleHours ?? null,
          fuelRemainingPercent: p.fuelRemainingPercent ?? null,
          fuelConsumedLiters: p.fuelConsumedLiters ?? null,
          defRemainingPercent: p.defRemainingPercent ?? null,
          anomalyType: p.anomalyType ?? '',
          e360_job: p.e360_job ?? '',
          e360_location: p.e360_location ?? '',
          hj_job: p.hj_job ?? '',
          hj_job_description: p.hj_job_description ?? '',
          hour_meter: p.hour_meter ?? null,
          hasDiscrepancy,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [p.longitude, p.latitude],
        },
      }
    }),
  }), [points, comparisonMode, discrepancies])

  // Update telematics data when map is ready or points change
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
        'circle-radius': [
          'case',
          ['get', 'hasDiscrepancy'], 7,
          5,
        ] as unknown as number,
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
        'circle-stroke-width': [
          'case',
          ['get', 'hasDiscrepancy'], 4,
          ['match', ['get', 'anomalyType'],
            'ANOMALY_NO_HJ', 3,
            'DISPUTED', 3,
            'NOT_IN_EITHER', 3,
            1,
          ],
        ] as unknown as number,
        'circle-stroke-color': [
          'case',
          ['get', 'hasDiscrepancy'], '#a855f7',
          ['match', ['get', 'anomalyType'],
            'ANOMALY_NO_HJ', '#ef4444',
            'DISPUTED', '#eab308',
            'NOT_IN_EITHER', '#f97316',
            '#1e293b',
          ],
        ] as unknown as string,
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
      const makeModel = [props.make, props.model].filter(Boolean).join(' ')
      const label = makeModel || props.equipmentDescription || ''

      // Provider badge
      const provider = props.provider || 'HCSS'
      const providerColor = provider === 'JDLink' ? '#16a34a' : '#2563eb'
      const providerBadge = `<span style="display:inline-block;background:${providerColor};color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;margin-left:4px">${provider}</span>`

      // JDLink-specific data
      let jdlinkHtml = ''
      if (provider === 'JDLink') {
        const parts: string[] = []
        const idleH = props.idleHours != null ? Number(props.idleHours) : null
        const fuelPct = props.fuelRemainingPercent != null ? Number(props.fuelRemainingPercent) : null
        const fuelL = props.fuelConsumedLiters != null ? Number(props.fuelConsumedLiters) : null
        const defPct = props.defRemainingPercent != null ? Number(props.defRemainingPercent) : null
        if (idleH != null) parts.push(`Idle Hours: ${Math.round(idleH).toLocaleString()}`)
        if (fuelPct != null) parts.push(`Fuel: ${fuelPct.toFixed(0)}%`)
        if (fuelL != null) parts.push(`Consumed: ${fuelL.toFixed(0)} L`)
        if (defPct != null) parts.push(`DEF: ${defPct.toFixed(0)}%`)
        if (parts.length > 0) {
          jdlinkHtml = `<div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;color:#16a34a;font-size:12px">${parts.join('<br/>')}</div>`
        }
      }

      // Build anomaly warning if applicable
      let reconHtml = ''
      const anomalyType = props.anomalyType
      const hourMeter = props.hour_meter != null ? Number(props.hour_meter) : null
      const hourMeterStr = hourMeter != null ? `${Math.round(hourMeter).toLocaleString()} hrs` : null
      const e360Loc = props.e360_location || null

      if (anomalyType === 'ANOMALY_NO_HJ') {
        const job = props.e360_job || 'unknown'
        let detail = `&#9888;&#65039; No HeavyJob authorization<br/>E360 assigns to: ${job}`
        if (e360Loc) detail += `<br/>E360 location: ${e360Loc}`
        if (hourMeterStr) detail += `<br/>Hour meter: ${hourMeterStr}`
        reconHtml = `<div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;color:#f59e0b;font-size:12px">${detail}</div>`
      } else if (anomalyType === 'DISPUTED') {
        const e360 = props.e360_job || 'unknown'
        const hj = props.hj_job || 'unknown'
        const hjDesc = props.hj_job_description || ''
        let detail = `&#9888;&#65039; Job disagreement<br/>E360 assigns to: ${e360}`
        if (e360Loc) detail += ` (${e360Loc})`
        detail += `<br/>HeavyJob assigns to: ${hj}`
        if (hjDesc) detail += ` &mdash; ${hjDesc}`
        if (hourMeterStr) detail += `<br/>Hour meter: ${hourMeterStr}`
        reconHtml = `<div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;color:#f59e0b;font-size:12px">${detail}</div>`
      } else if (anomalyType === 'NOT_IN_EITHER') {
        let detail = `&#9888;&#65039; Not in any system<br/>No E360 or HeavyJob record found`
        if (hourMeterStr) detail += `<br/>Hour meter: ${hourMeterStr}`
        detail += `<br/>GPS: ${formatGpsTime(props.locationDateTime)}`
        reconHtml = `<div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;color:#f59e0b;font-size:12px">${detail}</div>`
      }

      // Comparison mode: side-by-side HCSS vs JDLink
      let comparisonHtml = ''
      const disc = discrepancies?.get(props.equipmentCode)
      if (comparisonMode && disc) {
        const hcss = disc.hcss
        const jdl = disc.jdlink
        const gpsDist = disc.gpsDistanceMeters != null ? `${Math.round(disc.gpsDistanceMeters)} m` : '—'
        const hourDiff = disc.engineHoursDiff != null ? `${Math.abs(disc.engineHoursDiff).toFixed(0)} hrs` : '—'
        comparisonHtml = `<div style="border-top:2px solid #a855f7;margin-top:8px;padding-top:8px;">
          <div style="color:#a855f7;font-weight:600;font-size:11px;margin-bottom:4px">PROVIDER COMPARISON</div>
          <table style="width:100%;font-size:11px;border-collapse:collapse">
            <tr style="color:#64748b"><td></td><td style="font-weight:600;color:#2563eb">HCSS</td><td style="font-weight:600;color:#16a34a">JDLink</td></tr>
            <tr><td style="color:#64748b">Engine</td><td>${hcss?.engineStatus ?? '—'}</td><td>${jdl?.engineStatus ?? '—'}</td></tr>
            <tr><td style="color:#64748b">GPS Time</td><td>${formatGpsTime(hcss?.locationDateTime ?? null)}</td><td>${formatGpsTime(jdl?.locationDateTime ?? null)}</td></tr>
            <tr><td style="color:#64748b">Hours</td><td>${hcss?.hour_meter != null ? Math.round(hcss.hour_meter).toLocaleString() : '—'}</td><td>${jdl?.hour_meter != null ? Math.round(jdl.hour_meter).toLocaleString() : '—'}</td></tr>
          </table>
          <div style="margin-top:4px;font-size:11px">
            ${disc.hasGpsDiscrepancy ? `<span style="color:#ef4444">&#9888; GPS distance: ${gpsDist}</span><br/>` : ''}
            ${disc.hasHourDiscrepancy ? `<span style="color:#ef4444">&#9888; Hour meter diff: ${hourDiff}</span>` : ''}
          </div>
        </div>`
      }

      const engineReportHtml = props.engineStatusAt
        ? `Engine Report: ${formatGpsTime(props.engineStatusAt)}`
        : ''

      const html = `<div style="color:#1e293b;font-size:13px;line-height:1.6">
        ${label ? `<div style="font-weight:600;margin-bottom:2px">${label} ${providerBadge}</div>` : `<div>${providerBadge}</div>`}
        <div style="color:#475569">${props.equipmentCode}</div>
        Engine: <span style="color:${statusColor};font-weight:600">${props.engineStatus === 'Active' ? 'Active' : 'Off'}</span><br/>
        ${engineReportHtml ? `<span style="color:#64748b">${engineReportHtml}</span><br/>` : ''}
        GPS: ${formatGpsTime(props.locationDateTime)}
        ${stale ? '<br/><span style="color:#f59e0b">&#9888; GPS stale</span>' : ''}
        ${jdlinkHtml}
        ${reconHtml}
        ${comparisonHtml}
      </div>`

      popupRef.current?.remove()
      popupRef.current = new mapboxgl.Popup({ offset: 8, closeButton: false, maxWidth: '320px' })
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

  // Render geofence polygons
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    const map = mapRef.current

    const geofenceGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geofences
        .filter(g => g.polygon)
        .map(g => ({
          type: 'Feature' as const,
          properties: { name: g.name, id: g.id },
          geometry: g.polygon!,
        })),
    }

    const source = map.getSource('geofences') as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData(geofenceGeoJSON)
      return
    }

    map.addSource('geofences', { type: 'geojson', data: geofenceGeoJSON })

    map.addLayer({
      id: 'geofence-fill',
      type: 'fill',
      source: 'geofences',
      paint: {
        'fill-color': 'rgba(249,115,22,0.15)',
      },
    }, 'telematics-dots') // insert below dots

    map.addLayer({
      id: 'geofence-outline',
      type: 'line',
      source: 'geofences',
      paint: {
        'line-color': '#f97316',
        'line-width': 2,
      },
    }, 'telematics-dots')

    map.addLayer({
      id: 'geofence-labels',
      type: 'symbol',
      source: 'geofences',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#f97316',
        'text-halo-color': '#0f172a',
        'text-halo-width': 1.5,
      },
    })
  }, [isLoaded, geofences])

  // Draw mode management
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    const map = mapRef.current

    if (drawMode) {
      if (!drawRef.current) {
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          defaultMode: 'draw_polygon',
          styles: [
            // Polygon fill while drawing
            {
              id: 'gl-draw-polygon-fill',
              type: 'fill',
              filter: ['all', ['==', '$type', 'Polygon']],
              paint: { 'fill-color': 'rgba(249,115,22,0.2)', 'fill-outline-color': '#f97316' },
            },
            // Polygon outline while drawing
            {
              id: 'gl-draw-polygon-stroke',
              type: 'line',
              filter: ['all', ['==', '$type', 'Polygon']],
              paint: { 'line-color': '#f97316', 'line-width': 2 },
            },
            // Vertices
            {
              id: 'gl-draw-point',
              type: 'circle',
              filter: ['all', ['==', '$type', 'Point']],
              paint: { 'circle-radius': 5, 'circle-color': '#f97316' },
            },
            // Lines while drawing
            {
              id: 'gl-draw-line',
              type: 'line',
              filter: ['all', ['==', '$type', 'LineString']],
              paint: { 'line-color': '#f97316', 'line-width': 2, 'line-dasharray': [2, 2] },
            },
          ],
        })
        map.addControl(draw as unknown as mapboxgl.IControl, 'top-left')
        drawRef.current = draw

        map.on('draw.create', (e: { features: GeoJSON.Feature[] }) => {
          const feature = e.features[0]
          if (feature?.geometry.type === 'Polygon') {
            onDrawComplete?.(feature.geometry as GeoJSON.Polygon)
          }
        })
      }
    } else {
      // Remove draw control when draw mode is off
      if (drawRef.current) {
        try { map.removeControl(drawRef.current as unknown as mapboxgl.IControl) } catch { /* ok */ }
        drawRef.current = null
        onDrawCancel?.()
      }
    }
  }, [isLoaded, drawMode, onDrawComplete, onDrawCancel])

  return <div ref={containerRef} className="w-full h-full" />
}
