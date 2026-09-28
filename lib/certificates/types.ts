export type CertData = {
  staffName:            string
  certNumber:           string
  trainingName:         string
  eventDate:            string
  unitCount:            string
  unitLabel:            string   // 'PDU' / 'CEU', from the learner's credential
  credentialCode:       string   // 'RBT' / 'BCBA' — labels the learner's cert number
  unitBreakdown:        string   // e.g. 'Includes 1 ethics CEU' — '' when not applicable
  modality:             string
  trainerName:          string
  trainerCertNumber:    string
  companyName:          string
  orgContactName:       string
  orgContactCertNumber: string
  trainerSignatureUrl:  string | null
  companyLogoUrl:       string | null
  brandLogoPath:        string   // absolute fs path to training-loop-logo.png
}
