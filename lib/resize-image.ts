/**
 * Resize and compress an image file client-side using the Canvas API.
 * Returns a JPEG Blob. If the input is not an image, returns the original file.
 *
 * @param file    The file to process
 * @param maxPx   Max dimension (longest side). Aspect ratio preserved. Default 1600.
 * @param quality JPEG quality 0-1. Default 0.8.
 */
export async function resizeImage(
  file: File,
  maxPx = 1600,
  quality = 0.8,
): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return file
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas 2D context unavailable'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('Canvas export failed')),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}
