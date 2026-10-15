"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import ImportPaper from "@/components/zotero/components/dialog/ImportPaper";

export default function TestPage() {
    const [ isLoading, setIsLoading ] = useState(false);

    const handleDownload = async () => {
        setIsLoading(true);
        try {
            // Fetch with no-transform to prevent any content encoding issues
            const response = await fetch("http://localhost:3000/api/zotero/items/5JP2EJ5R/file", {
                headers: {
                    'Cache-Control': 'no-transform'
                }
            });

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }

            // Log headers for debugging
            // console.log('Content-Type:', response.headers.get('Content-Type'));
            // console.log('Content-Length:', response.headers.get('Content-Length'));

            // Get the original blob with its content type
            const blob = await response.blob();

            // Get filename from headers or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'downloaded-file';

            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[ 1 ]) {
                    filename = filenameMatch[ 1 ].replace(/['"]/g, '');
                }
            }

            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.style.display = 'none';
            link.href = url;
            link.download = filename;

            // Trigger download
            document.body.appendChild(link);
            link.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 100);

        } catch (error) {
            console.error("Download error:", error);
            alert("Failed to download file. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4">
            <Button
                onClick={handleDownload}
                disabled={isLoading}
                className="min-w-[150px]"
            >
                {isLoading ? "Downloading..." : "Download File"}
            </Button>
            <ImportPaper  workspaceId="6b185a16-08f1-43d0-ab67-620648b865cf"/>
        </div>
    );
}