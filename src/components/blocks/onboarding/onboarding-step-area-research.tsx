"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

const commonResearchAreas = [
  // AI & Computer Science
  "Artificial Intelligence",
  "Machine Learning",
  "Computer Vision",
  "Natural Language Processing",
  "Cybersecurity",
  "Data Science",

  // Biology & Medicine
  "Genetics",
  "Molecular Biology",
  "Neuroscience",
  "Biotechnology",

  // Physics & Engineering
  "Quantum Physics",
  "Robotics",
  "Nanotechnology",
  "Renewable Energy",

  // Mathematics & Statistics
  "Applied Mathematics",
  "Statistics",
  "Data Analytics",

  // Social Sciences
  "Psychology",
  "Economics",
  "Social Policy",
] as const;

type ResearchArea = (typeof commonResearchAreas)[number] | string;

interface ResearchAreaStepProps {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  NavigationButtons: React.ReactNode;
}

export function StepAreaOfResearch({
  value,
  onChange,
  error,
  NavigationButtons,
}: ResearchAreaStepProps) {
  const [clientError, setClientError] = useState("");
  const [customArea, setCustomArea] = useState("");

  const handleAreaToggle = (area: ResearchArea) => {
    const newValue = value.includes(area)
      ? value.filter((a) => a !== area)
      : [...value, area];
    onChange(newValue);
  };

  const handleAddCustomArea = (e: React.FormEvent) => {
    e.preventDefault();
    if (customArea.trim()) {
      if (!value.includes(customArea.trim())) {
        onChange([...value, customArea.trim()]);
      }
      setCustomArea("");
    }
  };

  const handleRemoveArea = (area: ResearchArea) => {
    onChange(value.filter((a) => a !== area));
  };

  return (
<div className="w-full flex flex-col items-end bg-background z-10">
  <div className="space-y-2 w-full">
    <label htmlFor="Area of Research" className="block text-lg font-medium text-primary">
      Select your Areas of Research
    </label>
    <p className="text-sm text-primary/60">
      Choose up to 3 areas that match your research interests
    </p>

    <div className="space-y-4">
      {/* Common research areas */}
      <div className="flex flex-wrap gap-2">
        {commonResearchAreas.map((area) => (
          <Button
            key={area}
            variant="zotero"
            onClick={() => handleAreaToggle(area)}
            disabled={value.length >= 4 && !value.includes(area)}
            className={`
              px-4 py-1.5 rounded-full text-sm transition-colors duration-200
              ${
                value.includes(area)
                  ? "border-sky-100 bg-sky-50/30 text-primary text-opacity-50"
                  : "border-secondary-foreground bg-gray-50/20 text-gray-400/60 hover:text-primary hover:bg-gray-50/30"
              }
              ${
                value.length >= 4 && !value.includes(area)
                  ? "opacity-40 cursor-not-allowed"
                  : ""
              }
            `}
          >
            {area}
          </Button>
        ))}
      </div>

      {/* Custom area input */}
      <form onSubmit={handleAddCustomArea} className="flex gap-2">
        <input
          type="text"
          value={customArea}
          onChange={(e) => setCustomArea(e.target.value)}
          placeholder="Enter custom research area"
          disabled={value.length >= 4}
          className="w-full py-2 px-2 text-xl font-medium rounded-md
          border-2 border-sky-100
          bg-white/70 backdrop-blur-sm
          text-primary placeholder:text-secondary-foreground
          focus:outline-none outline-none
          shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50)]
          transition-all duration-200 disabled:bg-white disabled:cursor-not-allowed disabled:placeholder:text-card"
      />
        <Button
          type="submit"
          disabled={!customArea.trim() || value.length >= 4}
          className={`
            px-4 rounded-xl transition-colors duration-200
            ${
              !customArea.trim() || value.length >= 4 
                ? "bg-gray-50/20 text-primary/40 cursor-not-allowed"
                : "border-card bg text-card bg-primary"
            }
          `}
        >
          Add
        </Button>
      </form>

      {/* Selected areas */}
      {value.length > 0 && (
        <div className="p-4 rounded-xl border border-sky-100/30 bg-gray-50/10">
          <h4 className="text-sm font-medium text-gray-400/60 mb-3 ">
            Selected Areas ({value.length}/4):
          </h4>
          <div className="flex flex-wrap gap-2">
            {value.map((area) => (
              <span
                key={area}
                className="px-4 py-1.5 rounded-full text-sm
                  border border-sky-100/30 bg-sky-50/30
                  text-primary flex items-center gap-2"
              >
                {area}
                <button
                  onClick={() => handleRemoveArea(area)}
                  className="hover:text-primary/60 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>

    {(clientError || error) && (
      <p className="text-red-500 text-sm">{clientError || error}</p>
    )}
  </div>

  {NavigationButtons}
</div>
  );
}
