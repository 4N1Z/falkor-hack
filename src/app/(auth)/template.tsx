import React, { Children } from "react";

interface TemplateProps {
  children: React.ReactNode;
}

export default function Template({children}:{children:React.ReactNode}){
    return (
        <div className="h-screen p-6 flex justify-center font-sans  items-center">
            {children}
        </div>
    )
}