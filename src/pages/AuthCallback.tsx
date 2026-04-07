import { useEffect, useState } from 'react'

export function AuthCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function handleCallback() {
      try {
        // Parse tokens from URL fragment (hash)
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const expiresAt = params.get('expires_at')

        if (!accessToken) {
          setErrorMsg('No access token found in URL.')
          setStatus('error')
          return
        }

        // Read redirect_uri from query params
        const query = new URLSearchParams(window.location.search)
        const redirectUri = query.get('redirect_uri')

        if (redirectUri) {
          // POST tokens to the CLI's local server
          await fetch(redirectUri, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt ? Number(expiresAt) : undefined,
            }),
          })
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
