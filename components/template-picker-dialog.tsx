'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CERT_TEMPLATES } from '@/lib/certificates/generate-cert'

interface TemplatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enabledTemplates: string[]
  onSelect: (template: string) => void | Promise<void>
  isLoading?: boolean
}

export function TemplatePickerDialog({
  open,
  onOpenChange,
  enabledTemplates,
  onSelect,
  isLoading = false,
}: TemplatePickerDialogProps) {
  const [selected, setSelected] = useState(enabledTemplates[0] ?? 'bacb')

  const handleSelect = async () => {
    await onSelect(selected)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Certificate Template</DialogTitle>
          <DialogDescription>
            Choose which template you&rsquo;d like to use for this certificate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {CERT_TEMPLATES
            .filter(t => enabledTemplates.includes(t.value))
            .map(({ value, label, desc }) => (
              <label
                key={value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selected === value ? 'border-[#0A253D] bg-[#0A253D]/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  value={value}
                  checked={selected === value}
                  onChange={() => setSelected(value)}
                  className="mt-0.5 accent-[#0A253D]"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </label>
            ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={isLoading}
            className="bg-[#0A253D] hover:bg-[#0d2f4f]"
          >
            {isLoading ? 'Loading…' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
