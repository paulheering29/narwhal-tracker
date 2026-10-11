import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/theme-toggle'

export default function JoinPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <ThemeToggle className="fixed right-4 top-4" />
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image src="/training-loop-logo.png" alt="Training Loop" width={1296} height={613} className="h-20 w-auto" priority />
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Ask your admin to add you</CardTitle>
            <CardDescription>You don’t create your own account when your company already uses Training Loop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-600">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Ask an admin or training coordinator at your company to add you in Training Loop.</li>
              <li>You’ll get an email with your sign-in details.</li>
              <li>Sign in and you’re in your company’s account.</li>
            </ol>
            <p className="text-xs text-gray-500">
              Please don’t start a new company, or you’ll end up in an empty account that isn’t connected to your team.
            </p>
            <div className="flex items-center justify-between pt-2 text-sm">
              <Link href="/signup" className="text-[#025CA8] hover:underline">Back</Link>
              <Link href="/login" className="text-[#025CA8] hover:underline">Sign in</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
