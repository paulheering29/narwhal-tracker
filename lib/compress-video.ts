import { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat } from 'mediabunny'

// Below this, the upload is quick enough that re-encoding isn't worth the wait.
const SKIP_UNDER_BYTES = 150 * 1024 * 1024
const MAX_HEIGHT = 1080
const VIDEO_BITRATE = 4_000_000
const AUDIO_BITRATE = 128_000

/**
 * Re-encodes a video to 1080p H.264/AAC MP4 in the browser (WebCodecs, hardware
 * accelerated) so the upload over slow wifi is a fraction of the size. Bunny
 * re-encodes everything anyway, so nothing is lost by shrinking first.
 *
 * Returns the original file whenever compressing isn't possible or wouldn't
 * help (small file, unsupported browser/codec, output not smaller), so callers
 * can always upload whatever comes back.
 */
export async function compressVideo(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<File> {
  if (file.size < SKIP_UNDER_BYTES) return file
  if (typeof VideoEncoder === 'undefined') return file

  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })

    // Only downscale — asking for 1080 on a 720p source would upscale it.
    const track = await input.getPrimaryVideoTrack()
    const shrink = track && track.displayHeight > MAX_HEIGHT

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        ...(shrink ? { height: MAX_HEIGHT } : {}),
        codec: 'avc',
        bitrate: VIDEO_BITRATE,
      },
      audio: { codec: 'aac', bitrate: AUDIO_BITRATE },
    })
    if (!conversion.isValid) return file

    conversion.onProgress = onProgress
    await conversion.execute()

    const buffer = output.target.buffer
    if (!buffer || buffer.byteLength >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.mp4'
    return new File([buffer], name, { type: 'video/mp4' })
  } catch {
    return file
  }
}
