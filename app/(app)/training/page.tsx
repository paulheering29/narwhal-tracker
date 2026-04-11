import { redirect } from 'next/navigation'

export default function TrainingRecordsRedirect() {
  redirect('/trainings?tab=records')
}
