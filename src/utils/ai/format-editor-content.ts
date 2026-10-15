type EditorNode = {
  type: string;
  content?: EditorNode[];
  text?: string;
  attrs?: Record<string, any>;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
};

type EditorContent = {
  type: string;
  content: EditorNode[];
};

export function formatEditorContent(data: EditorContent | string): string {
  // Handle case where data is already a string
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as EditorContent;
    } catch {
      return data as string;
    }
  }

  if (!data?.content) return '';

  function extractTextFromNode(node: EditorNode): string {
    try {
      // Handle text nodes with marks (like links, bold, etc.)
      if (node.text) {
        let text = node.text;
        if (node.marks?.length) {
          // Preserve links in a clean format
          const linkMark = node.marks.find(m => m.type === 'link');
          if (linkMark?.attrs?.href) {
            text = `${text} (${linkMark.attrs.href})`;
          }
        }
        return text;
      }

      if (node.content) {
        return node.content.map(extractTextFromNode).join(' ');
      }

      return '';
    } catch (error) {
      console.error('Error extracting text from node:', error);
      return '';
    }
  }

  try {
    const formattedContent = data.content.map((node) => {
      switch (node.type) {
        case 'heading':
          const level = '#'.repeat(Math.min(node.attrs?.level || 1, 6));
          return `${level} ${extractTextFromNode(node)}`;
        
        case 'paragraph':
          const text = extractTextFromNode(node);
          // Add extra context for important paragraphs
          if (node.marks?.some(m => m.type === 'bold')) {
            return `Important: ${text}`;
          }
          return text ? text : '';
        
        case 'orderedList':
          return node.content?.map((item, index) => 
            `${index + 1}. ${extractTextFromNode(item)}`
          ).join('\n');
        
        case 'bulletList':
          return node.content?.map(item => 
            `• ${extractTextFromNode(item)}`
          ).join('\n');
        
        case 'taskList':
          return node.content?.map(item => 
            `- [${item.attrs?.checked ? 'x' : ' '}] ${extractTextFromNode(item)}`
          ).join('\n');
        
        case 'codeBlock':
          const language = node.attrs?.language ? `(${node.attrs.language})` : '';
          // Add context about code purpose
          return `Code Example${language}:\n\`\`\`\n${extractTextFromNode(node)}\n\`\`\``;
        
        case 'blockquote':
          return `> ${extractTextFromNode(node)}`;
        
        case 'horizontalRule':
          return '---';
        
        case 'image':
          const alt = node.attrs?.alt || '';
          const src = node.attrs?.src || '';
          return `![${alt}](${src})`;
        
        default:
          return extractTextFromNode(node);
      }
    }).filter(Boolean).join('\n\n');

    // Add double line breaks for major sections
    if (formattedContent.length > 2000) {
      const summary = `Summary: This is a long document about ${
        data.content.find(n => n.type === 'heading')?.content?.[0]?.text || 'various topics'
      }.\n\n`;
      return summary + formattedContent.trim();
    }

    return formattedContent.trim();
  } catch (error) {
    console.error('Error formatting editor content:', error);
    return '';
  }
} 