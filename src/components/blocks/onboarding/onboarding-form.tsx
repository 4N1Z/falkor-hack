"use client";

import { useState } from "react";

import { submitForm } from "@/lib/action/onboarding-form-submission";
import ProgressIndicator from "./onboarding-progress";
import { useRouter } from "next/navigation";
import { OnboardingFormData } from "@/lib/onboarding-validation";

import { StepUniversity } from "./onboarding-step-university";
import { StepDesignation } from "./onboarding-step-designation";
import { StepAreaOfResearch } from "./onboarding-step-area-research";
import { StepName } from "./onboarding-steps-name";
import { Button } from "@/components/ui/button";
import { neuraQueryLogo } from "@/lib/logos";
import { Loader2 } from "lucide-react";
import { NeuraQueryLogoWithText } from "@/utils/neura-query-logo-component";

export default function OnboardingForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [formData, setFormData] = useState<OnboardingFormData>({
    name: "",
    university: "",
    designation: "",
    researchAreas: [],
  });

  const steps = ["Name", "University", "Designation", "Research Areas"];
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<keyof OnboardingFormData, string[]>>
  >({});

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setIsNavigating(true);
      // Simulate a small delay for smoother transitions
      await new Promise((resolve) => setTimeout(resolve, 300));
      setCurrentStep(currentStep + 1);
      setIsNavigating(false);
    }
  };

  const handleBack = async () => {
    if (currentStep > 0) {
      setIsNavigating(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      setCurrentStep(currentStep - 1);
      setIsNavigating(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await submitForm(formData);
      if (result.data === true || result.success) {
        router.push("/dashboard");
        setIsSubmitting(false);
      } else {
        setServerErrors(result.errors || {});
      }
    } catch (error) {
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = <K extends keyof OnboardingFormData>(
    field: K,
    value: OnboardingFormData[K]
  ) => {
    setFormData({ ...formData, [field]: value });
    setServerErrors({ ...serverErrors, [field]: undefined });
  };

  // Navigation buttons component
  const NavigationButtons = ({
    onNext,
    showNext = true,
    nextDisabled = false,
    submitButton = false,
  }: {
    onNext: () => void;
    showNext?: boolean;
    nextDisabled?: boolean;
    submitButton?: boolean;
  }) => (
    <div className="flex gap-3 mt-6">
      {currentStep > 0 && (
        <Button
          variant={"zotero"}
          onClick={handleBack}
          className={`text-primary font-medium transition-colors bg-none leading-none duration-150
          bg-card hover:bg-card opacity-100 hover:duration-150`}
        >
          <p className="py-0 px-3">Back</p>
        </Button>
      )}

      {/* className={` text-primary font-medium transition-colors bg-none leading-none duration-150
              ${
                nextDisabled
                  ? "bg-card text-secondary cursor-not-allowed duration-150"
                  : "bg-card hover:bg-card opacity-100 duration-150"}`} */}
      {showNext && (
        <Button
          variant={"zotero"}
          onClick={onNext}
          disabled={nextDisabled}
          className={`
     text-primary font-medium transition-colors bg-none leading-none duration-150
     ${
       submitButton
         ? nextDisabled
           ? "opacity-50 cursor-not-allowed"
           : `
             bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
             text-primary
             border-2 border-sky-100
             shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.32)]
           
           `
         : nextDisabled
         ? "bg-card text-secondary cursor-not-allowed duration-150"
         : "bg-card hover:bg-card opacity-100 duration-150"
     }
   `}
        >
          {isSubmitting || isNavigating ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : submitButton ? (
            <p className="py-0 px-3">Submit</p>
          ) : (
            <p className="py-0 px-3">Next</p>
          )}
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-white flex flex-col items-center justify-center tracking-4">
      <div className="fixed top-10 w-full h-full">
        <NeuraQueryLogoWithText />
      </div>
      <div className="w-full max-w-3xl">
        <div
          className={`space-y-8 font-sans box-border border p-4 rounded-lg `}
        >
          <ProgressIndicator
            steps={steps}
            currentStep={currentStep}
            onStepClick={(step) => {
              if (step < currentStep) {
                setCurrentStep(step);
              }
            }}
          />

          {currentStep === 0 && (
            <StepName
              value={formData.name}
              onChange={(value) => updateFormData("name", value)}
              error={serverErrors.name?.[0]}
              NavigationButtons={
                <NavigationButtons
                  onNext={handleNext}
                  nextDisabled={!formData.name.trim()}
                />
              }
            />
          )}

          {currentStep === 1 && (
            <StepUniversity
              value={formData.university}
              onChange={(value) => updateFormData("university", value)}
              error={serverErrors.university?.[0]}
              NavigationButtons={
                <NavigationButtons
                  onNext={handleNext}
                  nextDisabled={!formData.university.trim()}
                />
              }
            />
          )}

          {currentStep === 2 && (
            <StepDesignation
              value={formData.designation}
              onChange={(value) => updateFormData("designation", value)}
              error={serverErrors.designation?.[0]}
              NavigationButtons={
                <NavigationButtons
                  onNext={handleNext}
                  nextDisabled={!formData.designation.trim()}
                />
              }
            />
          )}

          {currentStep === 3 && (
            <StepAreaOfResearch
              value={formData.researchAreas}
              onChange={(value) => updateFormData("researchAreas", value)}
              error={serverErrors.researchAreas?.[0]}
              NavigationButtons={
                <NavigationButtons
                  onNext={handleSubmit}
                  nextDisabled={
                    formData.researchAreas.length === 0 ||
                    formData.researchAreas.length > 4
                  }
                  submitButton={true}
                />
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
