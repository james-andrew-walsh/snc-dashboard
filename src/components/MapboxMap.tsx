const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

export function MapboxMap() {
  const hasToken = mapboxToken && mapboxToken !== 'pk.your_mapbox_token_here'

  if (!hasToken) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 flex flex-col items-center justify-center min-h-[300px]">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-10 h-10 text-slate-600 mb-3">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-slate-400 font-medium">Map View — Phase 1.3</p>
        <p className="text-xs text-slate-500 mt-1">Set VITE_MAPBOX_TOKEN to enable</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden min-h-[300px]">
      <div id="mapbox-container" className="w-full h-[400px]">
        {/* Mapbox GL JS will mount here in Phase 1.3 */}
        <p className="p-4 text-sm text-slate-400">Mapbox token detected. Map integration coming in Phase 1.3.</p>
      </div>
    </div>
  )
}
