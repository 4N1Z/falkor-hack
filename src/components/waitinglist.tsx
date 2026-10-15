"use client"
import React, { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { addData } from "@/lib/action/waitinglist-action";

export function WaitingList({ }) {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    try {
      await addData(formData);
      setSubmitted(true);
      toast.success("You've been added to the waiting list.");
    } catch (error) {
      toast.error("Failed to join the waiting list. Please try again.");
    }
  };

  return (
    <form className={`text-white flex w-full flex-row gap-2 items-center py-2`} action={handleSubmit}>
      <Input placeholder="Enter your email" name="email" type="email" required disabled={submitted} 
        className="text-16 placeholder:text-16 text-primary border-primary-foreground font-semibold placeholder:text-primary placeholder:font-medium placeholder:opacity-60 bg-sky-50 backdrop-blur-sm "
      />
      <Submit submitted={submitted} />
    </form>
  );
}

function Submit({ submitted }: { submitted: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button 
      variant={'neura'} 
      className={`w-fit text-16`} 
      disabled={pending || submitted} 
      type={"submit"}
    >
      {pending ? "Submitting.." : submitted ? "Joined" : "Join the waitlist"}
    </Button>
  );
}