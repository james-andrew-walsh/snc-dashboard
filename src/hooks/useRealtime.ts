import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function useRealtime<T extends { id: string }>(
  table: string,
  _data: T[],
  setData: React.Dispatch<React.SetStateAction<T[]>>,
  _flashedIds: Set<string>,
  setFlashedIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const newRecord = payload.new as T
          const oldRecord = payload.old as Partial<T>

          if (payload.eventType === 'INSERT') {
            setData(prev => [...prev, newRecord])
            triggerFlash(newRecord.id)
          } else if (payload.eventType === 'UPDATE') {
            setData(prev =>
              prev.map(item => (item.id === newRecord.id ? newRecord : item))
            )
            triggerFlash(newRecord.id)
          } else if (payload.eventType === 'DELETE' && oldRecord.id) {
            setData(prev => prev.filter(item => item.id !== oldRecord.id))
          }
        }
      )
      .subscribe()

    function triggerFlash(id: string) {
      setFlashedIds(prev => new Set(prev).add(id))
      setTimeout(() => {
        setFlashedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 1000)
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, setData, setFlashedIds])
}
