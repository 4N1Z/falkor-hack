import { StepProps } from "@/lib/types";
import { useState } from "react";

export function StepName({
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
    <div className="w-full flex justify-between items-end">
      <div className="space-y-2">
        <label
          htmlFor="name"
          className="block text-16 text-primary font-medium">
          Welcome, Tell us your name !
        </label>
        <input
          type="text"
          id="name"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="First Name"
          className="w-full py-2 text-4xl font-semibold rounded-md
          bg-white/5 backdrop-blur-sm text-primary placeholder:text-secondary-foreground
          focus:outline-none outline-none
          transition-colors duration-150"
        />
        {(clientError || error) && (
          <p className="text-red-500 mt-2">{clientError || error}</p>
        )}
      </div>
      {NavigationButtons}
    </div>
  );
}
