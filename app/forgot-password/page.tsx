'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    const json = await res.json().catch(() => ({}))

    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.')
      return
    }

    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <ThemeToggle className="fixed right-4 top-4" />
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex justify-center mb-8">
          <Image src="/training-loop-logo.png" alt="Training Loop" width={1296} height={613} className="h-20 w-auto" priority />
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Forgot password?</CardTitle>
            <CardDescription>
              {sent
                ? 'Check your inbox for a reset link.'
                : "Enter your email and we'll send you a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <MailCheck className="h-7 w-7 text-emerald-600" />
                </div>
                {/* We can't say whether an account exists, so the wording can't promise an email was sent. */}
                <p className="text-sm text-center text-gray-600">
                  If there&apos;s an account for <strong>{email}</strong>, we&apos;ve sent it a password reset link. Check your spam folder if you don&apos;t see it within a minute.
                </p>
                <button type="button" onClick={() => setSent(false)} className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">
                  Wrong address? Fix it and try again
                </button>
                <Link
                  href="/login"
                  className="text-sm font-medium text-[#025CA8] hover:underline flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="you@company.com"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
                )}

                <Button type="submit" className="w-full bg-[#025CA8] hover:bg-[#024A87]" disabled={loading}>
                  {loading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    'Send reset link'
                  )}
                </Button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
