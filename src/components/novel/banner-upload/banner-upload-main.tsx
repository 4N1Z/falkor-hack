import CustomDialogTrigger from "@/components/custom-dialog";
import BannerUploadForm from "./banner-upload-form";

interface BannerUploadProps {
  children: React.ReactNode;
  className?: string;
  dirType: "file" ;
  id: string;
}

export default function BannerUpload({
  id,
  dirType,
  children,
  className,
}: BannerUploadProps) {
  return (
    <CustomDialogTrigger
      header="Upload Banner"
      content={<BannerUploadForm dirType={dirType} id={id} />}
      className={className}
    >
      {children}
    </CustomDialogTrigger>
  );
}
