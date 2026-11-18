import { cn } from "@/lib/utils";

export default function MaxWidthContainer({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={cn(`w-full min-w-screen max-w-7xl  mx-auto tracking-4 py-4 px-4`, className)}>
            {children}
        </div>
    );
}