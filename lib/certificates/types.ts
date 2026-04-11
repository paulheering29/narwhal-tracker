export type CertData = {
  staffName:            string
  certNumber:           string
  trainingName:         string
  eventDate:            string
  pduCount:             string
  modality:             string
  trainerName:          string
  trainerCertNumber:    string
  companyName:          string
  orgContactName:       string
  orgContactCertNumber: string
  trainerSignatureUrl:  string | null
  companyLogoUrl:       string | null
  narwhalLogoPath:      string   // absolute fs path to narwhal-tracker.jpg
}
