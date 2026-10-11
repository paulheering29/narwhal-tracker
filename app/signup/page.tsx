'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Loader2, MailCheck } from 'lucide-react'

const MIN_PASSWORD = 10
const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

export default function SignupPage() {
  const [organization, setOrganization] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [website, setWebsite]     = useState('')           // honeypot: people never see or fill this
  const startedAt = useRef(Date.now())

  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  // An organization on this email domain already uses Training Loop. Shown as a
  // heads-up the person can wave off; it never blocks them.
  const [domainExists, setDomainExists] = useState(false)
  const [bypassed, setBypassed]         = useState(false)
  const checkedEmail = useRef('')

  async function checkDomain(): Promise<boolean> {
    const value = email.trim().toLowerCase()
    if (!value.includes('@') || checkedEmail.current === value) return domainExists
    checkedEmail.current = value
    try {
      const res = await fetch('/api/signup/check-domain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: value }),
      })
      const json = await res.json()
      setDomainExists(!!json.exists)
      setBypassed(false)
      return !!json.exists
    } catch {
      return false   // the check is a courtesy; never get in the way of signing up
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters.`); return }
    if (password !== confirmPassword)   { setError('The passwords don’t match.'); return }

    if (!bypassed && (await checkDomain())) return   // the heads-up is now showing

    setLoading(true)
    const res = await fetch('/api/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization, firstName, lastName, email, password, website,
        elapsedMs: Date.now() - startedAt.current,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Something went wrong. Please try again.'); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image src="/training-loop-logo.png" alt="Training Loop" width={1296} height={613} className="h-20 w-auto" priority />
        </div>

        {sent ? (
          <Card>
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <MailCheck className="h-6 w-6 text-[#025CA8]" />
              </div>
              <CardTitle className="text-2xl">Check your email</CardTitle>
              <CardDescription>
                We sent a confirmation link to <span className="font-medium text-gray-700">{email}</span>.
                Click it to finish setting up {organization}.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-gray-500">
              Nothing after a few minutes? Check your spam folder.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">Start your free trial</CardTitle>
              <CardDescription>Set up your organization. 30 days free, no card needed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-3.5 text-sm text-blue-900">
                <p className="font-medium">This page is for signing up a new company.</p>
                <p className="mt-1 text-blue-800">
                  If you work for a company that already uses Training Loop, don’t sign up here. Ask an admin at your
                  company to add your account, and you’ll get an email to sign in.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="org" className="text-sm font-medium text-gray-700">Organization name</label>
                  <input id="org" required maxLength={100} value={organization} onChange={e => setOrganization(e.target.value)}
                    autoComplete="organization" className={inputCls} placeholder="Acme Behavioral Services" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="first" className="text-sm font-medium text-gray-700">First name</label>
                    <input id="first" required maxLength={60} value={firstName} onChange={e => setFirstName(e.target.value)}
                      autoComplete="given-name" className={inputCls} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="last" className="text-sm font-medium text-gray-700">Last name</label>
                    <input id="last" required maxLength={60} value={lastName} onChange={e => setLastName(e.target.value)}
                      autoComplete="family-name" className={inputCls} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-700">Work email</label>
                  <input id="email" type="email" required value={email}
                    onChange={e => { setEmail(e.target.value); setDomainExists(false); checkedEmail.current = '' }}
                    onBlur={checkDomain}
                    autoComplete="email" className={inputCls} placeholder="you@company.com" />
                </div>

                {domainExists && !bypassed && (
                  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="flex gap-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Hey, it looks like your company is already using Training Loop.</p>
                        <p className="mt-1 text-amber-800">
                          Check in with staff at your company. They can add you to your existing account instead of starting a new one.
                        </p>
                        <button type="button" onClick={() => setBypassed(true)}
                          className="mt-2 font-medium text-amber-900 underline underline-offset-2 hover:no-underline">
                          Continue anyway
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
                  <input id="password" type="password" required minLength={MIN_PASSWORD} value={password}
                    onChange={e => setPassword(e.target.value)} autoComplete="new-password" className={inputCls}
                    placeholder={`At least ${MIN_PASSWORD} characters`} />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">Confirm password</label>
                  <input id="confirm-password" type="password" required value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" className={inputCls}
                    placeholder="Type it again" />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-600">Passwords don’t match yet.</p>
                  )}
                </div>

                {/* Honeypot: off-screen, skipped by keyboard and assistive tech. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="website">Website</label>
                  <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

                <Button type="submit" className="w-full bg-[#025CA8] hover:bg-[#024A87]" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account…</> : 'Create account'}
                </Button>

                <p className="text-center text-sm text-gray-500">
                  Already have an account? <Link href="/login" className="text-[#025CA8] hover:underline">Sign in</Link>
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
