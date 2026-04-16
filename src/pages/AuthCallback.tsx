import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const [status, setStatus] = useState<'processing' | 'login' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Check if we have tokens in the URL hash (from a previous auth)
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')

    if (accessToken) {
      // We have tokens - handle the callback
      handleTokenCallback()
    } else {
      // No tokens - store the CLI redirect URI and show login form
      const query = new URLSearchParams(window.location.search)
      const redirectUri = query.get('redirect_uri')
      if (redirectUri) {
        sessionStorage.setItem('cli_redirect_uri', redirectUri)
      }
      setStatus('login')
    }
  }, [])

  async function handleTokenCallback() {
    try {
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const expiresIn = params.get('expires_in')

      const redirectUri = sessionStorage.getItem('cli_redirect_uri')

      if (redirectUri && accessToken) {
        // Build URL with tokens in query string (CLI expects this format)
        const cliUrl = new URL(redirectUri)
        cliUrl.searchParams.set('access_token', accessToken)
        if (refreshToken) cliUrl.searchParams.set('refresh_token', refreshToken)
        if (expiresIn) cliUrl.searchParams.set('expires_in', expiresIn)
        
        // Clear stored redirect URI
        sessionStorage.removeItem('cli_redirect_uri')
        
        // Redirect browser to CLI localhost server
        window.location.href = cliUrl.toString()
        return
      }

      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred')
      setStatus('error')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setErrorMsg(error.message)
        setStatus('error')
        setLoading(false)
        return
      }

      // Get the redirect URI from sessionStorage
      const redirectUri = sessionStorage.getItem('cli_redirect_uri')

      if (redirectUri && data.session) {
        // Build URL with tokens in query string (CLI expects this format)
        const cliUrl = new URL(redirectUri)
        cliUrl.searchParams.set('access_token', data.session.access_token)
        cliUrl.searchParams.set('refresh_token', data.session.refresh_token)
        cliUrl.searchParams.set('expires_in', String(data.session.expires_in))
        
        // Clear stored redirect URI
        sessionStorage.removeItem('cli_redirect_uri')
        
        // Redirect browser to CLI localhost server
        window.location.href = cliUrl.toString()
        return
      }

      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred')
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-8 text-center max-w-sm w-full">
        <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center font-bold text-white text-sm mx-auto mb-4">
          SNC
        </div>

        {status === 'processing' && (
          <p className="text-slate-400 text-sm">Processing authentication...</p>
        )}

        {status === 'login' && (
          <>
            <h2 className="text-lg font-semibold text-slate-100 mb-1">CLI Authentication</h2>
            <p className="text-slate-400 text-sm mb-4">Sign in to authenticate the CLI</p>
            
            {errorMsg && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400 mb-4">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-100 font-semibold mb-1">Authentication complete.</p>
            <p className="text-slate-400 text-sm">You may close this tab.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-red-400 font-semibold mb-1">Authentication failed</p>
            <p className="text-slate-400 text-sm">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  )
}
