'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SignaturePad } from '@/components/signature-pad'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle, AlertCircle, Pencil } from 'lucide-react'

type StaffOption = {
  id: string
  first_name: string
  last_name: string
  display_first_name: string | null
  display_last_name: string | null
}

interface SettingsClientProps {
  userId:             string
  currentSignatureUrl: string | null
  currentStaffId:     string | null
  staffList:          StaffOption[]
}

type Status = { type: 'success' | 'error'; message: string }

function displayName(s: StaffOption) {
  const first = s.display_first_name?.trim() || s.first_name
  const last  = s.display_last_name?.trim()  || s.last_name
  return `${first} ${last}`
}

export function SettingsClient({
  userId,
  currentSignatureUrl,
  currentStaffId,
  staffList,
}: SettingsClientProps) {
  const supabase    = createClient()
  const [staffId,   setStaffId]   = useState(currentStaffId ?? '')
  const [sigUrl,    setSigUrl]    = useState(currentSignatureUrl)
  const [showPad,   setShowPad]   = useState(!currentSignatureUrl)
  const [savingSig, setSavingSig] = useState(false)
  const [savingLink,setSavingLink]= useState(false)
  const [status,    setStatus]    = useState<Status | null>(null)

  // ── Save staff link without touching signature ──────────────
  async function handleSaveLink() {
    setSavingLink(true)
    setStatus(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ staff_id: staffId || null })
        .eq('id', userId)
      if (error) throw error
      setStatus({ type: 'success', message: 'Staff record linked to your account.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save link.'
      setStatus({ type: 'error', message: msg })
    } finally {
      setSavingLink(false)
    }
  }

  // ── Save drawn signature ─────────────────────────────────────
  const handleSaveSig = useCallback(async (dataUrl: string) => {
    setSavingSig(true)
    setStatus(null)
    try {
      // Decode data URL to blob
      const fetchRes  = await fetch(dataUrl)
      const blob      = await fetchRes.blob()
      const filePath  = `${userId}/signature.png`

      const { error: uploadErr } = await supabase.storage
        .from('signatures')
        .upload(filePath, blob, { upsert: true, contentType: 'image/png' })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('signatures')
        .getPublicUrl(filePath)

      // Cache-bust so the <img> refreshes immediately
      const urlWithBust = `${publicUrl}?t=${Date.now()}`

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          signature_url: urlWithBust,
          ...(staffId ? { staff_id: staffId } : {}),
        })
        .eq('id', userId)
      if (profileErr) throw profileErr

      setSigUrl(urlWithBust)
      setShowPad(false)
      setStatus({ type: 'success', message: 'Signature saved. It will appear on future certificates.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save signature.'
      setStatus({ type: 'error', message: msg })
    } finally {
      setSavingSig(false)
    }
  }, [supabase, userId, staffId])

  return (
    <div className="space-y-6">

      {/* ── Staff record link ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link to Your Staff Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Select <strong>your own name</strong> from the list below. This tells the system
            which staff record belongs to you so your signature can be attached to
            certificates for trainings you led.
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your name…" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {displayName(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSaveLink}
              disabled={savingLink}
              size="sm"
            >
              {savingLink ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Signature ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trainer Signature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Show existing signature */}
          {sigUrl && !showPad && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Your current signature:</p>
              <div className="inline-block border border-gray-200 rounded-lg p-4 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sigUrl}
                  alt="Saved signature"
                  className="max-h-28 w-auto"
                />
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

          {/* Signature pad */}
          {showPad && (
            <SignaturePad onSave={handleSaveSig} saving={savingSig} />
          )}

        </CardContent>
      </Card>

      {/* ── Status message ────────────────────────────────────── */}
      {status && (
        <div
          className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
            status.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {status.type === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />
          }
          {status.message}
        </div>
      )}

    </div>
  )
}
