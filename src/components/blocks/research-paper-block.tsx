type Author = {
    name: string;
    authorId?: string;
  };
  
  type PaperProps = {
    title?: string;
    authors?: Author[];
    year?: number;
    abstract?: string;
    url?: string;
  };
  
  export const ResearchPaper = ({ 
    title = "Sample Paper Title",
    authors = [{ name: "John Doe" }],
    year = new Date().getFullYear(),
    abstract = "No abstract available",
    url = "#"
  }: PaperProps) => {
    return (
      <div className="text-gray-100 hover:bg-gray-700/30 transition-colors rounded-lg p-4">
        {/* Title and Year */}
        <div className="flex justify-between items-start gap-4">
          <h2 className="text-lg font-medium text-blue-400 flex-1">
            <a href={url} target="_blank" rel="noopener noreferrer" 
              className="hover:underline">
              {title}
            </a>
          </h2>
          <span className="text-gray-400 text-sm whitespace-nowrap">
            {year}
          </span>
        </div>
  
        {/* Authors */}
        <div className="mt-2 text-sm text-gray-300">
          {authors.map((author, index) => (
            <span key={author.authorId || index}>
              {author.name}
              {index < authors.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
  
        {/* Abstract */}
        <div className="mt-3 text-sm text-gray-400">
          {abstract && abstract.length > 300 
            ? `${abstract.slice(0, 300)}...` 
            : abstract}
        </div>
  
        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1 bg-blue-600/30 text-blue-300 rounded-full 
              hover:bg-blue-600/50 transition-colors"
          >
            View Paper ↗
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(url)}
            className="text-xs px-3 py-1 bg-gray-700/30 text-gray-300 rounded-full 
              hover:bg-gray-700/50 transition-colors"
          >
            Copy Link
          </button>
        </div>
      </div>
    );
  }; 