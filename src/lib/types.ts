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
