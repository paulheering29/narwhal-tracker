import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Three doors, so someone whose company already uses Training Loop doesn't end
// up creating a second, empty organization.
const base = 'block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition-colors'

export default function SignupChooserPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image src="/training-loop-logo.png" alt="Training Loop" width={1296} height={613} className="h-20 w-auto" priority />
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Welcome to Training Loop</CardTitle>
            <CardDescription>Which of these sounds like you?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/signup/company" className={`${base} bg-[#025CA8] text-white hover:bg-[#024A87]`}>
              I Want To Sign My Company Up
            </Link>
            <Link href="/signup/join" className={`${base} border border-gray-300 bg-white text-[#025CA8] hover:bg-gray-50`}>
              My Company Uses Training Loop &amp; I Need An Account
            </Link>
            <Link href="/login" className={`${base} border border-gray-300 bg-white text-[#025CA8] hover:bg-gray-50`}>
              I Already Have An Account
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
