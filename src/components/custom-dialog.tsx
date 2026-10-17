import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CustomDialogTriggerProps {
  header?: string;
  content?: React.ReactNode;
  children?: React.ReactNode;
  description?: string;
  className?: string;
  // Optional controlled mode, for opening the dialog from elsewhere (e.g. a menu item)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CustomDialogTrigger: React.FC<CustomDialogTriggerProps> = ({
  header,
  content,
  children,
  description,
  className,
  open,
  onOpenChange,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && (
        <DialogTrigger className={cn('w-full', className)}>{children}</DialogTrigger>
      )}
      <DialogContent
        className="h-[90dvh]
        sm:h-[440px]
        overflow-y-auto
        flex
        flex-col
        justify-start
        w-full
        font-sans"
      >
        <DialogHeader>
          <DialogTitle>{header}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};

export default CustomDialogTrigger;