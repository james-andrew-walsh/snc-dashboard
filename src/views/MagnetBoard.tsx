import { useState, useMemo } from 'react'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRealtime } from '../hooks/useRealtime'
import { StatusBadge } from '../components/StatusBadge'
import type { Job, Location, CrewAssignment, DispatchEvent, Equipment, Employee } from '../lib/types'

const TODAY = new Date().toISOString().slice(0, 10)

function isActive(row: { startDate: string; endDate: string | null }): boolean {
  return row.startDate <= TODAY && (row.endDate == null || row.endDate >= TODAY)
}

export function MagnetBoard() {
  const { data: jobs, setData: setJobs } = useSupabaseQuery<Job>('Job')
  const { data: locations } = useSupabaseQuery<Location>('Location')
  const { data: crewAssignments, setData: setCrewAssignments } = useSupabaseQuery<CrewAssignment>('CrewAssignment')
  const { data: dispatchEvents, setData: setDispatchEvents } = useSupabaseQuery<DispatchEvent>('DispatchEvent')
  const { data: equipment, setData: setEquipment } = useSupabaseQuery<Equipment>('Equipment')
  const { data: employees } = useSupabaseQuery<Employee>('Employee')

  // Realtime for Job, CrewAssignment, DispatchEvent, Equipment
  const [flashedJobIds, setFlashedJobIds] = useState<Set<string>>(new Set())
  const [flashedCrewIds, setFlashedCrewIds] = useState<Set<string>>(new Set())
  const [flashedDispatchIds, setFlashedDispatchIds] = useState<Set<string>>(new Set())
  const [flashedEquipIds, setFlashedEquipIds] = useState<Set<string>>(new Set())

  useRealtime('Job', jobs, setJobs, flashedJobIds, setFlashedJobIds)
  useRealtime('CrewAssignment', crewAssignments, setCrewAssignments, flashedCrewIds, setFlashedCrewIds)
  useRealtime('DispatchEvent', dispatchEvents, setDispatchEvents, flashedDispatchIds, setFlashedDispatchIds)
  useRealtime('Equipment', equipment, setEquipment, flashedEquipIds, setFlashedEquipIds)

  // Lookup maps
  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const equipmentMap = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment])

  // Active crew assignments grouped by jobId
  const crewByJob = useMemo(() => {
    const map = new Map<string, CrewAssignment[]>()
    for (const ca of crewAssignments) {
      if (!isActive(ca)) continue
      const list = map.get(ca.jobId) ?? []
      list.push(ca)
      map.set(ca.jobId, list)
    }
    return map
  }, [crewAssignments])

  // Active dispatch events grouped by jobId
  const dispatchByJob = useMemo(() => {
    const map = new Map<string, DispatchEvent[]>()
    for (const de of dispatchEvents) {
      if (!isActive(de)) continue
      if (!de.jobId) continue
      const list = map.get(de.jobId) ?? []
      list.push(de)
      map.set(de.jobId, list)
    }
    return map
  }, [dispatchEvents])

  // Set of equipment IDs that have an active dispatch
  const dispatchedEquipmentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const de of dispatchEvents) {
      if (isActive(de)) ids.add(de.equipmentId)
    }
    return ids
  }, [dispatchEvents])

  // Jobs that have at least one active crew assignment or dispatch event
  const activeJobs = useMemo(() => {
    return jobs.filter(j => crewByJob.has(j.id) || dispatchByJob.has(j.id))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [jobs, crewByJob, dispatchByJob])

  // Unassigned equipment
  const unassignedEquipment = useMemo(() => {
    return equipment.filter(e => !dispatchedEquipmentIds.has(e.id))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [equipment, dispatchedEquipmentIds])

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Magnet Board</h2>
        <span className="text-sm text-slate-400">As of {formattedDate}</span>
      </div>

      {/* Job Cards Grid */}
      {activeJobs.length === 0 ? (
        <div className="text-slate-400 text-sm">No active jobs with assigned resources.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeJobs.map(job => {
            const crew = crewByJob.get(job.id) ?? []
            const dispatches = dispatchByJob.get(job.id) ?? []
            const location = job.locationId ? locationMap.get(job.locationId) : null
            const isFlashed = flashedJobIds.has(job.id)

            return (
              <div
                key={job.id}
                className={`bg-slate-800 rounded-lg p-4 border border-slate-700 transition-colors duration-500 ${
                  isFlashed ? 'ring-2 ring-orange-400/60' : ''
                }`}
              >
                {/* Card Header */}
                <div className="mb-3">
                  <div className="text-orange-400 font-bold text-lg">{job.code}</div>
                  <div className="text-slate-200 text-sm">{job.description}</div>
                  {location && (
                    <div className="text-slate-400 text-xs mt-1">
                      📍 {location.description}
                    </div>
                  )}
                </div>

                {/* Crew Section */}
                {crew.length > 0 && (
                  <div className="mb-3">
                    <div className="text-slate-400 text-xs uppercase tracking-wide mb-2">Crew</div>
                    <div className="space-y-1">
                      {crew.map(ca => {
                        const emp = employeeMap.get(ca.employeeId)
                        const isCrewFlashed = flashedCrewIds.has(ca.id)
                        return (
                          <div
                            key={ca.id}
                            className={`flex items-center gap-2 text-sm transition-colors duration-500 ${
                              isCrewFlashed ? 'bg-orange-400/10 rounded px-1 -mx-1' : ''
                            }`}
                          >
                            <span className="text-slate-200">
                              {emp ? `${emp.firstName} ${emp.lastName}` : ca.employeeId}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                              {ca.role}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Equipment Section */}
                {dispatches.length > 0 && (
                  <div className="mb-1">
                    <div className="text-slate-400 text-xs uppercase tracking-wide mb-2">Equipment</div>
                    <div className="space-y-2">
                      {dispatches.map(de => {
                        const eq = equipmentMap.get(de.equipmentId)
                        const operator = de.operatorId ? employeeMap.get(de.operatorId) : null
                        const isDispFlashed = flashedDispatchIds.has(de.id)
                        return (
                          <div
                            key={de.id}
                            className={`transition-colors duration-500 ${
                              isDispFlashed ? 'bg-orange-400/10 rounded px-1 -mx-1' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-slate-200">
                                {eq ? `${eq.make} ${eq.model} (${eq.code})` : de.equipmentId}
                              </span>
                              {eq && <StatusBadge status={eq.status} />}
                            </div>
                            {operator && (
                              <div className="text-xs text-slate-400 ml-0.5 mt-0.5">
                                ↳ {operator.firstName} {operator.lastName}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {crew.length === 0 && dispatches.length === 0 && (
                  <div className="text-slate-500 text-xs italic">No resources assigned</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Unassigned Equipment Section */}
      <div className="border-t border-slate-700 mt-8 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-400 text-xs uppercase tracking-wide">Unassigned Equipment</h3>
          <span className="text-xs text-slate-500">{unassignedEquipment.length} items</span>
        </div>
        {unassignedEquipment.length === 0 ? (
          <div className="text-slate-500 text-sm">All equipment is currently dispatched.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {unassignedEquipment.map(eq => {
              const isEqFlashed = flashedEquipIds.has(eq.id)
              return (
                <div
                  key={eq.id}
                  className={`flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/50 text-sm transition-colors duration-500 ${
                    isEqFlashed ? 'ring-2 ring-orange-400/60' : ''
                  }`}
                >
                  <span className="text-slate-300">{eq.make} {eq.model} ({eq.code})</span>
                  <StatusBadge status={eq.status} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
