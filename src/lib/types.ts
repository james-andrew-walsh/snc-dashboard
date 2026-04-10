export interface BusinessUnit {
  id: string
  code: string
  description: string
}

export interface Equipment {
  id: string
  businessUnitId: string
  code: string
  make: string
  model: string
  year: number
  serialNumber: string
  hourMeter: number
  odometer: number
  isRental: boolean
  isActive: boolean
  status: 'Available' | 'In Use' | 'Down'
}

export interface Job {
  id: string
  businessUnitId: string
  code: string
  description: string
  locationId: string | null
}

export interface Location {
  id: string
  businessUnitId: string
  code: string
  description: string
  latitude: number | null
  longitude: number | null
  geofence: number[][] | null
}

export interface Employee {
  id: string
  businessUnitId: string
  firstName: string
  lastName: string
  employeeCode: string
  role: string
}

export interface DispatchEvent {
  id: string
  equipmentId: string
  jobId: string
  locationId: string
  operatorId: string
  startDate: string
  endDate: string
  notes: string
}

export interface TelematicsSnapshot {
  equipmentCode: string
  latitude: number
  longitude: number
  locationDateTime: string | null
  isLocationStale: boolean
  engineStatus: string
  snapshotAt: string
  // Joined from Equipment table for popup display
  make?: string
  model?: string
  equipmentDescription?: string
  // Reconciliation status from RPC
  reconciliation_status?: string
  e360_job?: string | null
  e360_location?: string | null
  hj_job?: string | null
  hj_job_description?: string | null
  hour_meter?: number | null
}

export interface SiteLocation {
  id: string
  name: string
  description: string | null
  centerLat: number | null
  centerLng: number | null
  polygon: GeoJSON.Polygon | null
  radiusMeters: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteLocationJob {
  id: string
  siteLocationId: string
  jobHcssId: string | null
  jobCode: string
  jobDescription: string | null
  createdAt: string
}

export interface SyncLog {
  id: string
  providerKey: string
  providerName: string
  status: 'success' | 'error'
  rowsInserted: number | null
  durationMs: number | null
  errorMessage: string | null
  details: Record<string, unknown> | null
  completedAt: string
}

export interface CrewAssignment {
  id: string
  jobId: string
  employeeId: string
  role: string
  startDate: string
  endDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}
