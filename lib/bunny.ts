import crypto from 'crypto'

const BUNNY_API_BASE = 'https://video.bunnycdn.com'
export const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export function bunnyLibraryId(): string {
  return requiredEnv('BUNNY_LIBRARY_ID')
}

function bunnyApiKey(): string {
  return requiredEnv('BUNNY_API_KEY')
}

function bunnyTokenAuthKey(): string {
  return requiredEnv('BUNNY_TOKEN_AUTH_KEY')
}

/**
 * Builds a signed, expiring iframe embed URL so videos can't be watched by
 * anyone who merely guesses/shares the video ID, per
 * https://bunny.net/docs/stream/token-authentication — the token security
 * key (set on the library's Security tab in the Bunny dashboard, separate
 * from the API key) never leaves the server.
 */
export function buildSignedEmbedUrl(videoId: string, expiresInSeconds = 3600): string {
  const libraryId = bunnyLibraryId()
  const key        = bunnyTokenAuthKey()
  const expires    = Math.floor(Date.now() / 1000) + expiresInSeconds
  const token      = crypto
    .createHash('sha256')
    .update(`${key}${videoId}${expires}`)
    .digest('hex')

  // showSpeed=false hides the playback-rate control so there's no visible
  // way to watch faster than 1x. The heartbeat endpoint backs this up
  // server-side too — furthest_second_reached can't advance faster than
  // real elapsed time (see MAX advance clamp in the heartbeat route) even
  // if someone forces a faster rate outside the UI.
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}&showSpeed=false`
}

/** Creates a new (empty) video object in the library. Returns its guid. */
export async function createBunnyVideo(title: string): Promise<string> {
  const libraryId = bunnyLibraryId()
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: bunnyApiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) {
    throw new Error(`Bunny video creation failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  return data.guid as string
}

/**
 * Removes a video from the Bunny library. Bunny bills for stored bytes, so
 * every video whose course_videos row goes away has to be deleted here too or
 * it sits in the library accruing cost forever with nothing pointing at it.
 * A 404 counts as success — the goal is "not in the library any more".
 */
export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const libraryId = bunnyLibraryId()
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${videoId}`, {
    method: 'DELETE',
    headers: { AccessKey: bunnyApiKey(), Accept: 'application/json' },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny video deletion failed (${res.status}): ${await res.text()}`)
  }
}

/** Fetches a video's current encoding status + duration from Bunny. */
export async function getBunnyVideoStatus(videoId: string): Promise<{ durationSeconds: number | null; ready: boolean }> {
  const libraryId = bunnyLibraryId()
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${videoId}`, {
    headers: { AccessKey: bunnyApiKey(), Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Bunny status check failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  // status 4 = "Finished" per Bunny's encoding status enum.
  const ready = data.status === 4 && data.length > 0
  return { durationSeconds: ready ? Math.round(data.length) : null, ready }
}

/**
 * Builds signed TUS resumable-upload credentials for a given video, per
 * https://bunny.net/docs/stream/tus-resumable-uploads — the library API
 * key never leaves the server; the browser only gets this short-lived
 * signature and uploads straight to Bunny.
 */
export function buildTusUploadAuth(videoId: string) {
  const libraryId = bunnyLibraryId()
  const apiKey    = bunnyApiKey()
  const expire    = Math.floor(Date.now() / 1000) + 3600 // 1 hour
  const signature = crypto
    .createHash('sha256')
    .update(`${libraryId}${apiKey}${expire}${videoId}`)
    .digest('hex')

  return {
    endpoint:  BUNNY_TUS_ENDPOINT,
    libraryId,
    videoId,
    signature,
    expire,
  }
}
