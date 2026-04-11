import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('staff')
    .select('company_id')
    .eq('auth_id', user.id)
    .single()

  if (!me?.company_id) return NextResponse.json({ error: 'No company' }, { status: 404 })

  const { data: company } = await service
    .from('companies')
    .select('enabled_cert_templates, preferred_cert_template')
    .eq('id', me.company_id)
    .single()

  return NextResponse.json({
    enabled_cert_templates: company?.enabled_cert_templates ?? ['bacb'],
    preferred_cert_template: company?.preferred_cert_template ?? 'bacb',
  })
}
