import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import { RbtTimelineClient } from './client'

const IMAGE_BUCKET = 'timeline_images'

export default async function RbtTimelinePage() {
  await cookies()
  const supabase = await createClient()
  const service = createServiceClient()

  const [{ data: staff }, { data: comparisons }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, first_name, last_name, display_first_name, display_last_name, original_certification_date')
      .eq('role', 'RBT')
      .not('original_certification_date', 'is', null)
      .order('original_certification_date', { ascending: true }),
    service
      .from('timeline_comparisons')
      .select('name, year, value, image')
      .order('year', { ascending: true }),
  ])

  // Resolve image paths → public URLs from the storage bucket.
  const resolved = (comparisons ?? []).map(c => {
    let image_url: string | null = null
    const raw = (c as Record<string, unknown>).image as string | null
    if (raw) {
      if (raw.startsWith('http')) {
        image_url = raw
      } else {
        const { data } = service.storage.from(IMAGE_BUCKET).getPublicUrl(raw)
        image_url = data?.publicUrl ?? null
      }
    }
    return { name: c.name, year: c.year, value: c.value, image_url }
  })

  return <RbtTimelineClient staff={staff ?? []} comparisons={resolved} />
}
