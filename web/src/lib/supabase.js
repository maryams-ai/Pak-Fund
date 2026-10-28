// One shared Supabase client for the whole app.
//
// It uses only the public anon key. That key is safe in the browser
// because Row Level Security (002_rls.sql) decides what each user may
// read and write. The values come from the .env file.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// If .env is not filled in yet, supabase is null and main.jsx shows a
// "setup missing" page instead of crashing.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
