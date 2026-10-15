import { Button } from "@/components/ui/button";
import { StepProps } from "@/lib/types";
import { useState } from "react";

export function StepDesignation({
  value,
  onChange,
  error,
  NavigationButtons,
}: StepProps) {
  const [clientError, setClientError] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customDesignation, setCustomDesignation] = useState("");

  const designations = [
    "Professor",
    "Associate Professor",
    "Assistant Professor",
    "Research Scholar",
    "PhD Student",
    "PostDoc Researcher",
    "Research Assistant",
    "Other",
  ];

  const handleDesignationSelect = (designation: string) => {
    if (designation === "Other") {
      setShowCustomInput(true);
      onChange("");
    } else {
      setShowCustomInput(false);
      onChange(designation);
    }
    setClientError("");
  };

  const handleCustomDesignationChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setCustomDesignation(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="w-full flex flex-col justify-between items-end">
      <div className="space-y-2 w-full">

      <label
        htmlFor="designation"
        className="block text-16 text-primary font-medium"
      >
        What is your designation?
      </label>
      <div className="grid grid-cols-2 gap-3">
        {designations.map((designation) => (
          <Button
            key={designation}
            variant="zotero"
            onClick={() => handleDesignationSelect(designation)}
            className={`
              relative p-3 text-left transition-all duration-300
              rounded-md border-2 backdrop-blur-sm  ring-1 ring-sky-100
              ${
                value === designation && !showCustomInput
                  ? `
                    border-sky-100
                    bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
                    text-primary font-medium
                    shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.30),0px_8.206px_13.677px_rgba(109,205,247,0.30)]
                    ring-2 ring-white/40 duration-500 
                    border 
                  `
                  : `
                    border-transparent
                    bg-card hover:bg-card/80
                    text-gray-400/60 hover:text-primary
                    hover:shadow-md hover:shadow-sky-100
                  `
              }`}
          >
            {designation}
          </Button>
        ))}
      </div>
      {showCustomInput && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your designation"
          className="w-full py-2 px-2 text-xl font-medium rounded-md
            border-2 border-sky-100
            bg-white/70 backdrop-blur-sm
            text-primary placeholder:text-secondary-foreground
            focus:outline-none outline-none
            shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50)]
            transition-all duration-200"
        />
      )}

      {(clientError || error) && (
        <p className="text-red-500 text-sm">{clientError || error}</p>
      )}
      </div>

      {NavigationButtons}
    </div>
  );
}
