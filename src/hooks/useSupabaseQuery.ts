import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useSupabaseQuery<T>(table: string) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = async () => {
    setLoading(true)
    const { data: rows, error: err } = await supabase.from(table).select('*')
    if (err) {
      setError(err.message)
    } else {
      setData((rows as T[]) ?? [])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    refetch()
  }, [table])

  return { data, setData, loading, error, refetch }
}
