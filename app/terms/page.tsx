import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, type LegalSection } from '@/components/legal-page'
import { CONTACT_EMAIL, TRIAL_DAYS } from '@/lib/pricing'

export const metadata: Metadata = { title: 'Terms of Service · Training Loop' }

const sections: LegalSection[] = [
  {
    heading: 'The service',
    body: (
      <p>
        Training Loop is a web application that helps organizations track continuing-education credits, run and record
        trainings, issue certificates, and monitor certification and licensure for their staff. These terms apply to
        everyone who uses it.
      </p>
    ),
  },
  {
    heading: 'Who may use it',
    body: (
      <>
        <p>
          You must be at least 18 and able to form a binding agreement. If you sign up on behalf of an organization,
          you confirm that you have the authority to bind it, and “you” in these terms includes that organization.
        </p>
        <p>
          People your organization adds to Training Loop (its “users”) use the service under your organization’s account.
          You are responsible for who you add, the roles you give them, and what they do in your account.
        </p>
      </>
    ),
  },
  {
    heading: 'Your account',
    body: (
      <p>
        Keep your sign-in details confidential and tell us promptly at {CONTACT_EMAIL} if you think someone else has
        access. You are responsible for activity under your account. Give us accurate information and keep it current.
      </p>
    ),
  },
  {
    heading: 'Free trial, pricing and payment',
    body: (
      <>
        <p>
          New organizations get a {TRIAL_DAYS}-day free trial, no card needed. After the trial, the service is billed
          monthly at the prices shown on our pricing page at the time you subscribe: a base fee plus a charge per person
          you track, and an add-on per state if you use state licensure tracking.
        </p>
        <p>
          Payments are processed by Stripe. Subscriptions renew automatically each month until cancelled. You can cancel at
          any time and the cancellation takes effect at the end of the period you have already paid for. Fees already
          paid are not refunded unless the law requires it. We may change prices with advance notice; a change applies from
          your next billing period.
        </p>
      </>
    ),
  },
  {
    heading: 'Your content',
    body: (
      <>
        <p>
          You keep ownership of everything you put into Training Loop, including staff records, certificates, course
          videos, documents and reviews (“your content”). You give us permission to store, process and display it only as
          needed to run the service for you, such as generating certificates, sending reminders and showing records to the
          people you authorize.
        </p>
        <p>
          You are responsible for your content and for having the right to upload it, including the right to share
          information about the people you add. <strong>Do not upload client or patient health information.</strong>{' '}
          Training Loop is built for staff training and credential records and is not designed to hold protected health
          information.
        </p>
      </>
    ),
  },
  {
    heading: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use the service unlawfully or to infringe anyone’s rights;</li>
          <li>upload malware, or try to probe, disrupt or gain unauthorized access to the service or other organizations’ data;</li>
          <li>record false training, attendance, certification or licensure information, or issue certificates for training that did not happen;</li>
          <li>resell the service or use it to build a competing product; or</li>
          <li>use the service to send spam or unsolicited messages.</li>
        </ul>
      </>
    ),
  },
  {
    heading: 'Certificates, credits and AI-assisted entries',
    body: (
      <>
        <p>
          Training Loop helps you record and document training. It does not decide whether any training qualifies for credit
          with the BACB, a state board, or any other body. Those bodies set their own rules, and you remain responsible for
          confirming that a training, certificate or record meets them. Certificates produced by the service are only as
          accurate as the information entered.
        </p>
        <p>
          Some features use AI, such as reading details from an uploaded certificate or summarizing course reviews. AI can
          make mistakes. Details it reads from a certificate are suggestions that a person reviews before saving, and
          summaries are an aid, not a substitute for reading the reviews. You are responsible for checking the output
          before you rely on it.
        </p>
      </>
    ),
  },
  {
    heading: 'Third-party services',
    body: (
      <p>
        We rely on other companies to run Training Loop, for example for hosting, database, payments, email, video
        delivery and AI processing. Our{' '}
        <Link href="/privacy" className="text-[#025CA8] underline">Privacy Policy</Link> lists them. We aren’t responsible
        for outages or changes at those providers, though we will work to minimize their effect on you.
      </p>
    ),
  },
  {
    heading: 'Availability and changes',
    body: (
      <p>
        We work to keep the service available but don’t promise it will be uninterrupted or error-free. We may update,
        change or remove features. If we make a change that materially reduces what a paying customer receives, we will
        give reasonable notice.
      </p>
    ),
  },
  {
    heading: 'Ending your use',
    body: (
      <>
        <p>
          You can stop using the service at any time. We may suspend or end your access if you breach these terms, if
          payment fails and isn’t fixed after notice, or if needed to protect the service or other customers.
        </p>
        <p>
          After your account ends, you can ask us for a copy of your records. We delete or anonymize account data within a
          reasonable period afterward, except where we must keep it by law or for legitimate business records such as
          invoices.
        </p>
      </>
    ),
  },
  {
    heading: 'Disclaimers',
    body: (
      <p>
        The service is provided “as is” and “as available.” To the fullest extent the law allows, we disclaim all
        warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement.
        We do not guarantee that using Training Loop will keep any person certified or licensed, or satisfy any regulator.
      </p>
    ),
  },
  {
    heading: 'Limitation of liability',
    body: (
      <p>
        To the fullest extent the law allows, Training Loop will not be liable for indirect, incidental, special,
        consequential or punitive damages, or for lost profits, revenue, data or goodwill. Our total liability for any claim
        relating to the service is limited to the amount you paid us in the 12 months before the event that gave rise to the
        claim. Some places do not allow these limits, so they may not fully apply to you.
      </p>
    ),
  },
  {
    heading: 'Changes to these terms',
    body: (
      <p>
        We may update these terms from time to time. When we make a material change we’ll tell you by email or in the
        service before it takes effect. Continuing to use the service after that means you accept the updated terms.
      </p>
    ),
  },
  {
    heading: 'Governing law and disputes',
    body: (
      <p>
        These terms are governed by the laws of the United States and the state in which Training Loop is based, without
        regard to conflict-of-law rules. We encourage you to contact us first so we can try to resolve any problem
        informally. Any dispute we can’t resolve that way will be handled in the courts located in that state.
      </p>
    ),
  },
  {
    heading: 'Contact',
    body: <p>Questions about these terms? Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#025CA8] underline">{CONTACT_EMAIL}</a>.</p>,
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 14, 2026"
      intro={<p>By creating an account or using Training Loop you agree to these terms. If you don’t agree, please don’t use the service.</p>}
      sections={sections}
    />
  )
}
