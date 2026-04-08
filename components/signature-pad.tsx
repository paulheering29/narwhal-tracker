'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, Check } from 'lucide-react'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  saving?: boolean
}

export function SignaturePad({ onSave, saving = false }: SignaturePadProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const lastPos    = useRef<{ x: number; y: number } | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  // Initialise canvas background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  // ── Coordinate helpers ──────────────────────────────────────
  function getCanvasPos(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) {
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  // ── Drawing handlers ────────────────────────────────────────
  const startDraw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const pos = getCanvasPos(e, canvas)
      const ctx = canvas.getContext('2d')!
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      drawing.current = true
      lastPos.current  = pos
      setIsEmpty(false)
    },
    [],
  )

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const pos = getCanvasPos(e, canvas)
      const ctx = canvas.getContext('2d')!
      if (lastPos.current) {
        // Smooth curve through midpoint to reduce jaggedness
        const mid = {
          x: (lastPos.current.x + pos.x) / 2,
          y: (lastPos.current.y + pos.y) / 2,
        }
        ctx.quadraticCurveTo(lastPos.current.x, lastPos.current.y, mid.x, mid.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(mid.x, mid.y)
      }
      lastPos.current = pos
    },
    [],
  )

  const stopDraw = useCallback(() => {
    drawing.current = false
    lastPos.current  = null
  }, [])

  // ── Clear ───────────────────────────────────────────────────
  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }, [])

  // ── Save ────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) return
    onSave(canvas.toDataURL('image/png'))
  }, [isEmpty, onSave])

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg cursor-crosshair touch-none bg-white select-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <p className="text-xs text-gray-400">Draw with your mouse or finger</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={isEmpty || saving}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isEmpty || saving}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save Signature'}
        </Button>
      </div>
    </div>
  )
}
