interface ProgressIndicatorProps {
  steps: ReadonlyArray<string> | string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export default function ProgressIndicator({
  steps,
  currentStep,
  onStepClick,
}: ProgressIndicatorProps) {
  return (
    <div className="flex items-center space-x-1">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <button
            onClick={() => onStepClick?.(index)}
            disabled={index > currentStep}
            className={`
              relative flex h-10 w-10 items-center justify-center
              rounded-md text-xl font-medium
              transition-colors duration-150
              ${
                index <= currentStep
                  ? `
                    border border-[#F9FBFE]
                    bg-[linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]
                    shadow-[inset_-2.66px_-2.66px_5.32px_rgba(238,244,251,0.34),0px_3.99px_6.65px_rgba(109,205,247,0.52)]
                    ring-1 ring-sky-100
                    `
                  : `
                    bg-none
                    border border-secondary
                    text-gray-400
                    `
              }
              ${
                index < currentStep
                  ? "cursor-pointer hover:opacity-90"
                  : index > currentStep
                  ? "cursor-not-allowed opacity-50"
                  : ""
              }
            `}
          >
            <span 
              className={`
                ${
                  index <= currentStep
                    ? "bg-gradient-to-b from-[#84CDFF] to-primary bg-clip-text text-transparent"
                    : "bg-gradient-to-b from-[#84CDFF] to-primary bg-clip-text text-transparent "
                }
              `}
            >
              {index + 1}
            </span>
          </button>
          {index < steps.length - 1 && (
            <div
              className={`
                mx-2 h-0.5 w-8 rounded-full transition-colors duration-200
                ${
                  index < currentStep 
                    ? `bg-secondary`
                    : "bg-secondary-foreground"
                }
              `}
            />
          )}
        </div>
      ))}
    </div>
  );
}