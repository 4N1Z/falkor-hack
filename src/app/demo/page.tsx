import { auth } from "@/auth";
import OnboardingForm from "@/components/blocks/onboarding/onboarding-form";
import { ColorPalette } from "@/components/ColorPalette";
import { redirect } from "next/navigation";
import React from "react";

async function page() {
  // const session = await auth();
  // if (!session) {
  //   redirect("/login");
  // }
  // console.log("Session: in DEMOO", session.user);
  return (
    // <div>
    //   <div>
    //     <h1>Demo Page</h1>
    //     <p>This is a demo page</p>
    //   </div>
    //   <div>{JSON.stringify(session)}</div>
    // </div>
    <>
      <OnboardingForm />
    </>

    // <div className="min-h-screen bg-background text-white flex items-center justify-center tracking-4">
    //   <div className="w-full max-w-3xl">
    //   </div>
    //   {/* <ColorPalette /> */}
    // </div>
  );
}

export default page;
