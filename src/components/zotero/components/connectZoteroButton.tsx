import { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type connectZoteroButtonProps = {
    callback: string
} & ComponentProps<"a">;
export default function ConnectZoteroButton({ callback, className, children, title, ...args }: connectZoteroButtonProps) {
    return (
        <Link href={`/api/zotero/auth?callback=${callback}`} className={cn("", buttonVariants({ variant: "default" }), className)} title={title ? title : "Connect Zotero"} {...args}>
            {
                children ? children : "Connect Zotero"
            }
        </Link>
    );
}