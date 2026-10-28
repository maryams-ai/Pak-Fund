// Loads the two lookup tables (City, Industry) for filter dropdowns.
// Both are public to read (002_rls.sql), so this works without login.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useLookups() {
  const [cities, setCities] = useState([])
  const [industries, setIndustries] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [cityResult, industryResult] = await Promise.all([
        supabase.from('city').select('cityno, cityname').order('cityname'),
        supabase.from('industry').select('industryno, industryname').order('industryname'),
      ])
      if (cancelled) return
      if (cityResult.error || industryResult.error) {
        setError((cityResult.error ?? industryResult.error).message)
        return
      }
      setCities(cityResult.data)
      setIndustries(industryResult.data)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { cities, industries, error }
}
