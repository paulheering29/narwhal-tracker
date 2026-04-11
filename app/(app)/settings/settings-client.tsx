'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SignaturePad } from '@/components/signature-pad'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertCircle, Pencil } from 'lucide-react'

interface SettingsClientProps {
  userId:              string
  currentSignatureUrl: string | null
}

type Status = { type: 'success' | 'error'; message: string }

export function SettingsClient({ userId, currentSignatureUrl }: SettingsClientProps) {
  const supabase = createClient()

  const [sigUrl,    setSigUrl]    = useState(currentSignatureUrl)
  const [showPad,   setShowPad]   = useState(!currentSignatureUrl)
  const [savingSig, setSavingSig] = useState(false)
  const [status,    setStatus]    = useState<Status | null>(null)

  const handleSaveSig = useCallback(async (dataUrl: string) => {
    setSavingSig(true)
    setStatus(null)
    try {
      const fetchRes = await fetch(dataUrl)
      const blob     = await fetchRes.blob()
      const filePath = `${userId}/signature.png`

      const { error: uploadErr } = await supabase.storage
        .from('signatures')
        .upload(filePath, blob, { upsert: true, contentType: 'image/png' })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('signatures')
        .getPublicUrl(filePath)

      const urlWithBust = `${publicUrl}?t=${Date.now()}`

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ signature_url: urlWithBust })
        .eq('id', userId)
      if (profileErr) throw profileErr

      setSigUrl(urlWithBust)
      setShowPad(false)
      setStatus({ type: 'success', message: 'Signature saved. It will appear on certificates for trainings you led.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save signature.'
      setStatus({ type: 'error', message: msg })
    } finally {
      setSavingSig(false)
    }
  }, [supabase, userId])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trainer Signature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sigUrl && !showPad && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Your current signature:</p>
              <div className="inline-block border border-gray-200 rounded-lg p-4 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sigUrl} alt="Saved signature" className="max-h-28 w-auto" />
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowPad(true); setStatus(null) }}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Draw New Signature
                </Button>
              </div>
            </div>
          )}

          {showPad && <SignaturePad onSave={handleSaveSig} saving={savingSig} />}
        </CardContent>
      </Card>

      {status && (
        <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
          status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {status.type === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />}
          {status.message}
        </div>
      )}
    </div>
  )
}
