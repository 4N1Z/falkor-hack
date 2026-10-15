"use server";

import { revalidatePath } from "next/cache";
import { OnboardingFormSchema } from "../onboarding-validation";
import db from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

export async function submitForm(formData: unknown) {
  const session = await auth();
  console.count("Session in onBoarding");

  if (session === null || !session.user) {
    return {
      data: "Unauthorized",
      error: "401",
    };
  }
  const result = OnboardingFormSchema.safeParse(formData);

  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors };
  }

  const validatedData = result.data;

  // Check if user has a name in the database
  const userData = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, session.user?.id!),
    columns: {
      name: true,
    },
  });

  const onboardingDetails = {
    version: "0.1",
    completed_at: new Date().toISOString(),
    details: {
      name: validatedData.name,
      university: validatedData.university,
      designation: validatedData.designation,
      research_areas: validatedData.researchAreas,
    },
  };

  console.log("Onboardig data :: ", onboardingDetails);
  try {
    // Update the user's onboarding details
    await db
      .update(users)
      .set({
        onBoardingData: JSON.stringify(onboardingDetails),
        // check for name in user's field
        ...((!userData?.name || userData.name.trim() === "") && {
          name: validatedData.name,
        }),
      })
      .where(eq(users.id, session.user.id!));

      revalidatePath("/dashboard")

    return { data: true, error: null };
  } catch (error) {
    console.error("Error updating onboarding details:", error);
    return {
      data: false,
      error: "Failed to submit Data",
    };
  }
}
