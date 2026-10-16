import { StepProps } from "@/lib/types";
import { useState } from "react";

export function StepUniversity({
  value,
  onChange,
  error,
  NavigationButtons,
}: StepProps) {
  const [clientError, setClientError] = useState("");

  const handleChange = (newValue: string) => {
    setClientError("");
    onChange(newValue);
  };

  return (
    <div
      className="w-full flex justify-between items-end">
      <div className="space-y-2">
        <label
          htmlFor="university"
          className="block text-16 text-primary font-medium">
          Which university are you affiliated with ?
        </label>
        <input
          type="text"
          id="university"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter your university"
          className="w-full py-2 text-4xl font-semibold rounded-md
        bg-white/5 backdrop-blur-sm text-primary placeholder:text-secondary-foreground
        
        focus:outline-none outline-none
        transition-colors duration-150"
        />
        {(clientError || error) && (
          <p className="text-red-500">{clientError || error}</p>
        )}
      </div>
      {NavigationButtons}
    </div>
  );
}
