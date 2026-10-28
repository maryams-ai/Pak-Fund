// Shown instead of the app when web/.env is not filled in yet.
import { APP_NAME } from '../config'

export default function SetupMissing() {
  return (
    <div className="page-x py-16">
      <div className="card mx-auto max-w-xl p-8">
        <h1 className="mt-0 text-2xl font-semibold">{APP_NAME}: Supabase settings missing</h1>
        <ol className="mb-0 space-y-2 pl-5 text-ink-soft">
          <li>
            Copy <code>web/.env.example</code> to <code>web/.env</code>.
          </li>
          <li>
            Fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from Supabase Dashboard →
            Project Settings → API.
          </li>
          <li>
            Stop and restart <code>npm run dev</code>.
          </li>
        </ol>
      </div>
    </div>
  )
}
