export const defaultEditorContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Welcome to NeuraQuery" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "NeuraQuery is your all in one Co-pilot, designed to streamline academic writing and research organization. Start writing, collaborating, and organizing your research documents right here.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Key Features" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", marks: [{ type: "bold" }], text: "AI-Powered Writing Assistant: " },
                { type: "text", text: "Get intelligent suggestions and help with your research writing. Press " },
                { type: "text", text: " or use the bubble menu to activate AI assistance." },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", marks: [{ type: "bold" }], text: "Real-time Collaboration: " },
                { type: "text", text: "Work together with your research team in real-time, with live cursors and synchronized editing." },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", marks: [{ type: "bold" }], text: "Zotero Integration: " },
                { type: "text", text: "Connect your Zotero library to easily manage and cite your research papers." },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Getting Started" }],
    },
    {
      type: "orderedList",
      attrs: { tight: true, start: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Use the slash command (type " },
                { type: "text", text: ") to access formatting options" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Highlight text to access quick formatting options like bold, italic, and underline" },
              ],
            },
          ],
        },

        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Upload images or research diagrams by dragging and dropping or copying and pasting" },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Organize your work in folders and keep track of your research progress" },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Research Tools" }],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Connect your Zotero account to import references" },
              ],
            },
          ],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Explore latest research trends in your field" },
              ],
            },
          ],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Start collaborating with your research team" },
              ],
            },
          ],
        },
      ],
    },
    { type: "horizontalRule" },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Need help? Check out our " },
        {
          type: "text",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://neuraquery.com/docs",
                target: "_blank",
              },
            },
          ],
          text: "documentation",
        },
        { type: "text", text: " or contact support." },
      ],
    },
  ],
};