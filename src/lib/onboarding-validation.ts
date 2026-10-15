import { z } from "zod";

export const nameSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters long")
    .max(100, "Name must be less than 100 characters"),
});

export const universitySchema = z.object({
  university: z
    .string()
    .min(2, "University name must be at least 2 characters long")
    .max(100, "University name must be less than 100 characters"),
});

export const designationSchema = z.object({
  designation: z
    .string()
    .min(2, "Designation must be at least 2 characters long")
    .max(100, "Designation must be less than 100 characters"),
});

export const researchAreasSchema = z.object({
  researchAreas: z
    .array(z.string())
    .min(3, "Please select at least 3 research area")
    .max(4, "You can select up to 4 research areas"),
});

export const OnboardingFormSchema = nameSchema
  .merge(universitySchema)
  .merge(designationSchema)
  .merge(researchAreasSchema);

export type OnboardingFormData = z.infer<typeof OnboardingFormSchema>;