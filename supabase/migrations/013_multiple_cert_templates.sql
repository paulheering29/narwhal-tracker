-- Add support for multiple enabled certificate templates
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS enabled_cert_templates text[] DEFAULT ARRAY['bacb']::text[];

-- Migrate existing preferred_cert_template values to the new column
UPDATE companies
SET enabled_cert_templates = ARRAY[preferred_cert_template]
WHERE preferred_cert_template IS NOT NULL AND enabled_cert_templates = ARRAY['bacb']::text[];
