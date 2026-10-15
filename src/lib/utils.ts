import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { OnboardingDetails, UserContext } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// write a function to return greetings based on time of day
export function getGreeting() {
  const date = new Date();
  const hours = date.getHours();
  if (hours < 12) return "Good Morning";
  if (hours < 17) return "Good Afternoon";
  return "Good Evening";
}

export function formatDate(dateString: string) {
  const date = new Date(dateString);

  const day = date.getDate().toString().padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);

  return `${day}-${month}-${year}`;
}




interface ApplicationError extends Error {
  info: string;
  status: number;
}


export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};


function getBrowserName(userAgent: string): string {
  if (userAgent.includes('chrome/') && userAgent.includes('edg/')) return 'edge';
  if (userAgent.includes('samsung')) return 'samsung';
  if (userAgent.includes('safari/') && !userAgent.includes('chrome/')) return 'safari';
  if (userAgent.includes('chrome/')) return 'chrome';
  return 'unsupported';
}


export function isSupportedBrowser(): boolean {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const browserName = getBrowserName(userAgent);
  
  // List of supported browsers
  const supportedBrowsers = {
    'chrome': true,          // Chrome desktop
    'edge': true,           // Microsoft Edge
    'samsung': true,        // Samsung Internet
    'safari': parseFloat(userAgent.match(/version\/(\d+)/)?.[1] || '0') >= 14.1  // Safari 14.1+
  } as Record<string, boolean>;

  return !!supportedBrowsers[browserName];
}

export const getLastUpdatedTime = (dateString: string) => {
  const now = new Date();
  const diff = now.getTime() - new Date(dateString).getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};


export function extractResearchAreas(onboardingDetails: string): string {
  try {
    const parsedData: OnboardingDetails = JSON.parse(onboardingDetails);
    return parsedData.details.research_areas.join(", ");
  } catch (error) {
    console.error("Error parsing onboarding details:", error);
    return "general research";
  }
}


export function extractUserContext(onboardingDetails: string): UserContext {
  try {
    const parsedData: OnboardingDetails = JSON.parse(onboardingDetails);
    return {
      name: parsedData.details.name,
      university: parsedData.details.university,
      designation: parsedData.details.designation,
      researchAreas: parsedData.details.research_areas.join(", ")
    };
  } catch (error) {
    console.error("Error parsing onboarding details:", error);
    return {
      name: "",
      university: "",
      designation: "",
      researchAreas: "value life"
    };
  }
}
