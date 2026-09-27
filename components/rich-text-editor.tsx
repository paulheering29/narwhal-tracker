'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Bold, Italic, Underline, List, ListOrdered, Link2, Link2Off } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize-html'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
}

type ToolbarButton = {
  cmd: string
  icon: typeof Bold
  label: string
}

const BUTTONS: ToolbarButton[] = [
  { cmd: 'bold',            icon: Bold,        label: 'Bold' },
  { cmd: 'italic',          icon: Italic,      label: 'Italic' },
  { cmd: 'underline',       icon: Underline,   label: 'Underline' },
  { cmd: 'insertUnorderedList', icon: List,        label: 'Bullet list' },
  { cmd: 'insertOrderedList',   icon: ListOrdered, label: 'Numbered list' },
]

/**
 * Small contenteditable editor for section descriptions.
 *
 * Uses document.execCommand, which is formally deprecated but still
 * implemented everywhere and has no replacement short of pulling in a full
 * editor framework — not worth ~100kb of ProseMirror for bold/italic/lists.
 * Everything it produces passes through sanitizeHtml before it is stored or
 * rendered, so the deprecation is a maintenance risk, not a security one.
 */
export function RichTextEditor({ value, onChange, placeholder, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Only write into the DOM when the incoming value actually differs from
  // what's already there. Blindly assigning innerHTML on every render would
  // reset the caret to the start on every keystroke.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value ?? ''
  }, [value])

  const emit = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML)
  }, [onChange])

  function exec(cmd: string) {
    document.execCommand(cmd, false)
    ref.current?.focus()
    emit()
  }

  function addLink() {
    const url = prompt('Link URL (e.g. https://example.com)')
    if (!url) return
    // execCommand would happily write href="javascript:..." — only allow
    // schemes the sanitiser would keep anyway, so the UI doesn't silently
    // create links that vanish on save.
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
      alert('Links must start with https://, http://, mailto: or tel:')
      return
    }
    document.execCommand('createLink', false, url)
    ref.current?.focus()
    emit()
  }

  function removeLink() {
    document.execCommand('unlink', false)
    ref.current?.focus()
    emit()
  }

  // Pasting from Word/Docs drags in a pile of markup. Keep the basic
  // formatting, drop everything else.
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const html  = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    if (html) {
      document.execCommand('insertHTML', false, sanitizeHtml(html))
    } else {
      document.execCommand('insertText', false, plain)
    }
    emit()
  }

  const isEmpty = !value || value === '<br>' || value.replace(/<[^>]*>/g, '').trim() === ''

  return (
    <div className={`rounded-md border ${disabled ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        {BUTTONS.map(({ cmd, icon: Icon, label }) => (
          <button
            key={cmd}
            type="button"
            title={label}
            disabled={disabled}
            // Keep focus (and the selection) inside the editable — without
            // this the button steals it and the command applies to nothing.
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec(cmd)}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <button type="button" title="Add link" disabled={disabled}
          onMouseDown={e => e.preventDefault()} onClick={addLink}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40">
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" title="Remove link" disabled={disabled}
          onMouseDown={e => e.preventDefault()} onClick={removeLink}
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40">
          <Link2Off className="h-4 w-4" />
        </button>
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-gray-400">{placeholder}</p>
        )}
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onPaste={handlePaste}
          className="min-h-[7rem] w-full px-3 py-2.5 text-sm text-gray-900 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline"
        />
      </div>
    </div>
  )
}
