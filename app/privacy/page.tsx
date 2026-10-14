import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, type LegalSection } from '@/components/legal-page'
import { CONTACT_EMAIL } from '@/lib/pricing'

export const metadata: Metadata = { title: 'Privacy Policy · Training Loop' }

const sections: LegalSection[] = [
  {
    heading: 'What we collect',
    body: (
      <>
        <p>
          <strong>Information your organization enters about its staff.</strong> Names (including preferred names), work
          email addresses, roles and credentials, certification and license numbers and dates, training and attendance
          records, quiz attempts, and course reviews and comments.
        </p>
        <p>
          <strong>Documents you upload.</strong> Certificates and licensing documents, company logos and signatures, and
          course videos.
        </p>
        <p>
          <strong>Account and billing details.</strong> The organization’s name and contact, plus subscription status.
          Card details are entered directly with Stripe; we never see or store full card numbers.
        </p>
        <p>
          <strong>Technical information.</strong> Basic logs such as IP address, browser type and the pages used, which we
          need to keep the service secure and working.
        </p>
        <p>
          Training Loop is meant for staff training and credential records. <strong>Please don’t upload client or patient
          health information.</strong>
        </p>
      </>
    ),
  },
  {
    heading: 'How we use it',
    body: (
      <ul>
        <li>to provide the service: tracking credits, running trainings, issuing certificates and showing records;</li>
        <li>to send emails you’d expect, such as sign-in and password messages, certificates and renewal reminders;</li>
        <li>to bill your organization and manage your subscription;</li>
        <li>to keep the service secure, prevent abuse and fix problems;</li>
        <li>to provide AI features you choose to use (see below); and</li>
        <li>to understand overall usage so we can improve the product.</li>
      </ul>
    ),
  },
  {
    heading: 'AI features',
    body: (
      <>
        <p>
          Two features send content to Anthropic, which provides the AI model we use: reading the details from a certificate
          you upload to fill in an outside-training form, and summarizing the written reviews of a course. Only what is
          needed for that task is sent, such as the uploaded certificate or the review text.
        </p>
        <p>
          Under Anthropic’s commercial terms, content sent through its API is not used to train its models. Details read from
          a certificate are suggestions only; nothing is saved until a person reviews and saves it.
        </p>
      </>
    ),
  },
  {
    heading: 'Who we share it with',
    body: (
      <>
        <p>We don’t sell personal information, and we don’t share it for advertising. We use these service providers to run Training Loop:</p>
        <ul>
          <li><strong>Supabase</strong> – database, sign-in and file storage;</li>
          <li><strong>Vercel</strong> – hosting and basic, aggregate website analytics;</li>
          <li><strong>Stripe</strong> – payments and subscriptions;</li>
          <li><strong>Resend</strong> – sending email;</li>
          <li><strong>Bunny</strong> – streaming course videos; and</li>
          <li><strong>Anthropic</strong> – the AI features described above.</li>
        </ul>
        <p>
          They process information only on our behalf and to provide their service. We may also disclose information if the
          law requires it, to protect people’s safety or our rights, or as part of a merger or sale of the business.
        </p>
      </>
    ),
  },
  {
    heading: 'Who can see your data',
    body: (
      <p>
        Each organization’s data is kept separate from every other organization’s. Within an organization, roles control
        access: administrators and trainers can see and manage staff records, while an individual sees their own. People
        in your organization can see what you and your administrators choose to record about them.
      </p>
    ),
  },
  {
    heading: 'Cookies and similar technology',
    body: (
      <p>
        We use only the cookies needed to keep you signed in, end an idle session, and remember your light or dark display
        choice. We don’t use advertising or cross-site tracking cookies. Our analytics are aggregate and don’t build
        profiles of individuals.
      </p>
    ),
  },
  {
    heading: 'How long we keep it',
    body: (
      <p>
        We keep your organization’s information while its account is active, because training and certification records
        are meant to last. When an account ends, we delete or anonymize its data within a reasonable period, except where
        we must keep something by law or for business records such as invoices. Backups age out on their normal schedule.
      </p>
    ),
  },
  {
    heading: 'Security',
    body: (
      <p>
        We use encryption in transit, access controls that separate organizations, and restricted access to production
        systems. No system is perfectly secure, so we can’t guarantee absolute security. If we learn of a breach that
        affects your information, we’ll notify you as the law requires.
      </p>
    ),
  },
  {
    heading: 'Your choices and rights',
    body: (
      <>
        <p>
          You can ask to see, correct or delete personal information we hold about you, or ask for a copy of it. Because
          your organization controls the records it keeps about its staff, we may direct staff requests to the organization
          first. Depending on where you live, you may have additional rights under local privacy law.
        </p>
        <p>To make a request, email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#025CA8] underline">{CONTACT_EMAIL}</a>. We may need to verify who you are first.</p>
      </>
    ),
  },
  {
    heading: 'Children',
    body: <p>Training Loop is for working adults and is not directed to children under 13. We don’t knowingly collect information from them.</p>,
  },
  {
    heading: 'Changes to this policy',
    body: (
      <p>
        We may update this policy. When we make a material change we’ll tell you by email or in the service. The date at the
        top shows when it was last revised. See also our{' '}
        <Link href="/terms" className="text-[#025CA8] underline">Terms of Service</Link>.
      </p>
    ),
  },
  {
    heading: 'Contact',
    body: <p>Questions about privacy? Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#025CA8] underline">{CONTACT_EMAIL}</a>.</p>,
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 14, 2026"
      intro={<p>This policy explains what information Training Loop collects, how we use it, and the choices you have.</p>}
      sections={sections}
    />
  )
}
