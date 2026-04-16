import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function AuthCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleCallback() {
      try {
        // Parse tokens from URL fragment (hash) - Supabase returns tokens here
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const expiresIn = params.get('expires_in')

        if (!accessToken) {
          // No tokens yet - this is the initial CLI login request
          // Redirect to Supabase OAuth
          const query = new URLSearchParams(window.location.search)
          const redirectUri = query.get('redirect_uri')
          
          if (redirectUri) {
            // Store the CLI's localhost redirect URI in sessionStorage for later
            sessionStorage.setItem('cli_redirect_uri', redirectUri)
          }
          
          // Redirect to Supabase OAuth
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          })
          
          if (error) {
            setErrorMsg(error.message)
            setStatus('error')
          } else if (data.url) {
            window.location.href = data.url
          }
          return
        }

        // We have tokens from Supabase OAuth - redirect to CLI localhost with tokens in query string
        const redirectUri = sessionStorage.getItem('cli_redirect_uri')

        if (redirectUri) {
          // Build URL with tokens in query string (CLI expects this format)
          const cliUrl = new URL(redirectUri)
          cliUrl.searchParams.set('access_token', accessToken)
          if (refreshToken) cliUrl.searchParams.set('refresh_token', refreshToken)
          if (expiresIn) cliUrl.searchParams.set('expires_in', expiresIn)
          
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

    handleCallback()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-8 text-center max-w-sm w-full">
        <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center font-bold text-white text-sm mx-auto mb-4">
          SNC
        </div>

        {status === 'processing' && (
          <p className="text-slate-400 text-sm">Processing authentication...</p>
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
