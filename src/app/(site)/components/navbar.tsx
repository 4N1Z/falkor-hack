import Link from "next/link";
import MaxWidthContainer from "./max-width-container";
import { neuraQueryLogo } from "@/lib/logos";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function Navbar() {
  return (
    <MaxWidthContainer className="w-full flex justify-between items-center mt-2 md:mt-4">
      <Link href={"/"} className="flex items-center gap-2 ">
      <div className="w-8 h-8">
        {neuraQueryLogo}
      </div>
        <span className="text-primary text-xl md:text-26 font-medium">neura query</span>
      </Link>

      {/* Desktop Navigation */}
      <div className="hidden md:flex gap-2 text-foreground text-26">
        <Link
          href={"#home"}
          className="hover:text-primary transition-colors duration-150"
        >
          home
        </Link>
        <span className="text-primary font-bold">/</span>
        <Link
          href={"#features"}
          className="hover:text-primary transition-colors duration-150"
        >
          features
        </Link>
        <span className="text-primary font-bold">/</span>
        <Link
          href={"#footer"}
          className="hover:text-primary transition-colors duration-150"
        >
          demo
        </Link>
      </div>

      {/* Mobile Navigation */}
      <Sheet>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[300px]">
          <div className="flex flex-col gap-4 mt-8">
            <Link
              href={"#home"}
              className="text-xl hover:text-primary transition-colors duration-150"
            >
              home
            </Link>
            <Link
              href={"#features"}
              className="text-xl hover:text-primary transition-colors duration-150"
            >
              features
            </Link>
            <Link
              href={"#footer"}
              className="text-xl hover:text-primary transition-colors duration-150"
            >
              demo
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </MaxWidthContainer>
  );
}
