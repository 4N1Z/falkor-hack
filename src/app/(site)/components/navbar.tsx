import Link from "next/link";
import { Fragment } from "react";
import MaxWidthContainer from "./max-width-container";
import { neuraQueryLogo } from "@/lib/logos";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { href: "#home", label: "home" },
  { href: "#adam", label: "adam" },
  { href: "#features", label: "features" },
  { href: "#upgrade", label: "what's new" },
];

export default function Navbar() {
  return (
    <MaxWidthContainer className="w-full flex justify-between items-center mt-2 md:mt-4">
      <Link href={"/"} className="flex items-center gap-2 ">
        <div className="w-8 h-8">{neuraQueryLogo}</div>
        <span className="text-primary text-xl md:text-26 font-medium">neura query</span>
      </Link>

      {/* Desktop Navigation */}
      <div className="hidden md:flex gap-2 text-foreground text-26">
        {links.map((link, i) => (
          <Fragment key={link.href}>
            {i > 0 && <span className="text-primary font-bold">/</span>}
            <Link
              href={link.href}
              className="hover:text-primary transition-colors duration-150"
            >
              {link.label}
            </Link>
          </Fragment>
        ))}
      </div>

      <Button asChild variant="neura" className="hidden md:inline-flex text-16">
        <Link href="/dashboard">Open dashboard</Link>
      </Button>

      {/* Mobile Navigation */}
      <Sheet>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[300px]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex flex-col gap-4 mt-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xl hover:text-primary transition-colors duration-150"
              >
                {link.label}
              </Link>
            ))}
            <Button asChild variant="neura" className="text-16 w-full">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </MaxWidthContainer>
  );
}
