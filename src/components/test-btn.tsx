"use client";

import { getResearchPaperSummary } from "@/lib/action/get-summary";
import { Button } from "./ui/button";
import { useState } from "react";

export default function TestBtn() {
  const [generation, setGeneration] = useState<string>("");

  return (
    <Button
      onClick={async () => {
        const { data: text } = await getResearchPaperSummary(
          "ai openai"
        );
        setGeneration(text);
      }}
    >
      Test Btn
    </Button>
  );
}
