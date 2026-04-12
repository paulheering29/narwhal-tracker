// Client-safe constants for the cert template list. This file must NOT
// import anything from pdf-lib / fs / path — it's bundled into client
// components (admin settings UI, template picker dialog).

export type CertTemplate = 'bacb' | 'formal' | 'fun' | 'basic'

export const CERT_TEMPLATES: readonly {
  value: CertTemplate
  label: string
  desc:  string
}[] = [
  { value: 'bacb',   label: 'Official BACB Form',     desc: 'The original BACB fillable PDF — required if your company submits directly to the BACB.' },
  { value: 'formal', label: 'Formal (Diploma Style)', desc: 'Cream background, navy & gold borders, serif fonts — looks like a framed diploma.' },
  { value: 'fun',    label: 'Fun',                    desc: 'Bright teal & coral, colourful badges, celebratory feel — great for team recognition.' },
  { value: 'basic',  label: 'Basic',                  desc: 'Clean white with a navy top bar and a simple grid layout — professional and minimal.' },
]
