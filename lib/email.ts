// One place for the sender, so switching to the trainingloop.tech domain once
// it's verified in Resend is an environment variable, not a code change.
export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Training Loop <noreply@narwhaltracker.com>'
