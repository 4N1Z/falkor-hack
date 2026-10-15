import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import Highlight from '@tiptap/extension-highlight'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { handleCommandNavigation, SuggestionItem } from '../extensions/slash-command'
import { handleImageDrop, handleImagePaste } from '../plugins'
import { uploadFn } from '../image-upload'
import GenerativeMenuSwitch from '../generative/generative-menu-switch'
import { ColorSelector } from '../selectors/color-selector'
import { LinkSelector } from '../selectors/link-selector'
import { NodeSelector } from '../selectors/node-selector'
import { SemanticScholarSelector } from '../selectors/reseach-paper'
import { TextButtons } from '../selectors/text-buttons'
import { suggestionItems } from '../slash-command'
import {
  EditorRoot,
  EditorContent,
  EditorCommand,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorCommandList,
  type JSONContent,

} from "../headless/index";
import { updateFile } from '@/db/actions/action-workspace'
import { useAppState } from '@/lib/providers/state-providers'
import { defaultExtensions } from '../extensions'
import { ImageResizer } from '../extensions/index'
import Link from '@tiptap/extension-link'
import { TabIndent } from '../extensions/tab-indent'



const Editore = ({
  ydoc, provider, fileId, data, session, onUpdate, collabEnabled
}: {
  ydoc: any;
  provider: any;
  fileId: string;
  data: JSONContent;
  session: any;
  onUpdate: any;
  collabEnabled: boolean;
}) => {
  const [status, setStatus] = useState('connecting')
  const [saving, setSaving] = useState<boolean>(false);
  const [openNode, setOpenNode] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openAI, setOpenAI] = useState(false);
  const [openScholar, setOpenScholar] = useState(false)

  const baseExtensions = [...defaultExtensions];
  let totalExtensions: any[] = baseExtensions;
  console.log("YDOC:", ydoc)
    // if (collabEnabled) {
    //   // console.log("isCollaborationEnabled :: ", isCollaborationEnabled);
    //   totalExtensions = [
    //     ...baseExtensions,
    //     StarterKit.configure({
    //       history: false,
    //     }),
    //     Highlight,
    //     TaskList,
    //     TaskItem,
    //     Collaboration.extend().configure({
    //       document: ydoc,
    //     }),
    //     CollaborationCursor.extend().configure({
    //       provider,
    //       user: {
    //         name: session?.user?.email,
    //         color: "#FF0000",
    //       },
    //       render: (user: any) => {
    //         const cursor = document.createElement("span");
    //         cursor.classList.add("collaboration-cursor__caret");
    //         cursor.setAttribute(
    //           "style",
    //           `
    //           border-left: 1px solid ${user.color};
    //           border-right: 1px solid ${user.color};
    //           margin-left: -1px;
    //           margin-right: -1px;
    //           pointer-events: none;
    //           position: relative;
    //           word-break: normal;
    //         `
    //         );

    //         const label = document.createElement("div");
    //         label.classList.add("collaboration-cursor__label");
    //         label.setAttribute(
    //           "style",
    //           `
    //           background-color: ${user.color};
    //           border-radius: 3px 3px 3px 0;
    //           color: white;
    //           font-size: 12px;
    //           font-style: normal;
    //           font-weight: 600;
    //           left: -1px;
    //           line-height: normal;
    //           padding: 0.1rem 0.3rem;
    //           position: absolute;
    //           top: -1.4em;
    //           user-select: none;
    //           white-space: nowrap;
    //         `
    //         );

    //         label.insertBefore(document.createTextNode(user.name), null);
    //         cursor.insertBefore(label, null);

    //         return cursor;
    //       },
    //     }),
    //   ];
    // }
  // const editor = useEditor({
  //   enableContentCheck: true,
  //   onContentError: ({ disableCollaboration }) => {
  //     disableCollaboration()
  //   },
  //   onCreate: ({ editor: currentEditor }) => {
  //     provider.on('synced', () => {
  //       if (currentEditor.isEmpty) {
  //         currentEditor.commands.setContent(defaultContent)
  //       }
  //     })
  //   },
  //   onUpdate: ({ editor: currentEditor }) => {
  //     if (currentEditor.isEmpty) {
  //       currentEditor.commands.setContent(defaultContent)
  //     }
  //   },
  //   editorProps:{
  //       handleDOMEvents: {
  //         keydown: (_view: any, event: KeyboardEvent) =>
  //           handleCommandNavigation(event),
  //       },
  //       handlePaste: (view: any, event: ClipboardEvent) =>
  //         handleImagePaste(view, event, uploadFn),
  //       handleDrop: (
  //         view: any,
  //         event: DragEvent,
  //         _slice: any,
  //         moved: boolean
  //       ) => handleImageDrop(view, event, moved, uploadFn),
  //       attributes: {
  //         class: `prose prose-slate prose-lg dark:prose-invert prose-headings:font-title prose-headings:text-foreground font-default focus:outline-none max-w-full`,
  //       },
  //     },
  //   extensions: [
  //     StarterKit.configure({
  //       history: false,
  //     }),
  //     Highlight,
  //     TaskList,
  //     TaskItem,
  //     Collaboration.extend().configure({
  //       document: ydoc,
  //     }),
  //     CollaborationCursor.extend().configure({
  //       provider,
  //     }),
  //   ],
    
  // })

  useEffect(() => {
    // Update status changes
    const statusHandler = (event: any) => {
      setStatus(event.status)
    }

    provider.on('status', statusHandler)

    return () => {
      provider.off('status', statusHandler)
    }
  }, [provider])

  // Save current user to localStorage and emit to editor
  // useEffect(() => {
  //   if (editor && currentUser) {
  //     editor.chain().focus().updateUser(currentUser).run()
  //   }
  // }, [editor, currentUser])


  // if (!editor) {
  //   return null
  // }

  return (
      <EditorRoot>

      <EditorContent  
        onContentError={({ disableCollaboration }) => {
          disableCollaboration()
        }}
        immediatelyRender= {false}
        className="relative min-h-[500px] w-full max-w-screen-md sm:mb-[calc(20vh)]"
        onCreate={({ editor }) => {
          provider.on('synced', () => {
            if (editor.isEmpty) {
              editor.commands.setContent(data)
            }
          })
        }}
        initialContent={data}
        enableContentCheck={true}
        onUpdate={onUpdate}
        editorProps={{
          handleDOMEvents: {
            keydown: (_view: any, event: KeyboardEvent) =>
              handleCommandNavigation(event),
          },
          handlePaste: (view: any, event: ClipboardEvent) =>
            handleImagePaste(view, event, uploadFn),
          handleDrop: (
            view: any,
            event: DragEvent,
            _slice: any,
            moved: boolean
          ) => handleImageDrop(view, event, moved, uploadFn),
          attributes: {
            class: `prose prose-slate prose-lg dark:prose-invert prose-headings:font-title prose-headings:text-foreground font-default focus:outline-none max-w-full`,
          },
        }}
        extensions={[
          StarterKit.configure({
            history: false,
          }),
          Link,
          Highlight,
          TaskList,
          TaskItem,
          TabIndent,
          Collaboration.extend().configure({
            document: ydoc ,
          }),
          CollaborationCursor.extend().configure({
            provider,
            user: {
              name: session?.user?.email,
              color: "#FF0000",
            },
            render: (user: any) => {
              const cursor = document.createElement("span");
              cursor.classList.add("collaboration-cursor__caret");
              cursor.setAttribute(
                "style",
                `
                border-left: 1px solid ${user.color};
                border-right: 1px solid ${user.color};
                margin-left: -1px;
                margin-right: -1px;
                pointer-events: none;
                position: relative;
                word-break: normal;
              `
              );
  
              const label = document.createElement("div");
              label.classList.add("collaboration-cursor__label");
              label.setAttribute(
                "style",
                `
                background-color: ${user.color};
                border-radius: 3px 3px 3px 0;
                color: white;
                font-size: 12px;
                font-style: normal;
                font-weight: 600;
                left: -1px;
                line-height: normal;
                padding: 0.1rem 0.3rem;
                position: absolute;
                top: -1.4em;
                user-select: none;
                white-space: nowrap;
              `
              );
  
              label.insertBefore(document.createTextNode(user.name), null);
              cursor.insertBefore(label, null);
  
              return cursor;
            },
          }),
          
        ]}
        slotAfter={<ImageResizer />}>
      

            <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto  rounded-md border border-muted bg-background px-1 py-2 shadow-md">
              <EditorCommandEmpty className="px-2 text-muted-foreground">
                No results
              </EditorCommandEmpty>
              <EditorCommandList className="gap-2">
                {suggestionItems.map((item: SuggestionItem) => (
                  <EditorCommandItem
                    value={item.title}
                    onCommand={(val) => item.command && item.command(val)} // check if command exists first
                    className={`flex  w-full font-sans items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-card aria-selected:bg-card border-transparent hover:border-sky-100 hover:border`}
                    key={item.title}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>

            <GenerativeMenuSwitch open={openAI} onOpenChange={setOpenAI}>
              <SemanticScholarSelector open={openScholar} onOpenChange={setOpenScholar}/>
              <NodeSelector open={openNode} onOpenChange={setOpenNode} />
              <LinkSelector open={openLink} onOpenChange={setOpenLink} />
              <ColorSelector open={openColor} onOpenChange={setOpenColor} />
              <TextButtons />
            </GenerativeMenuSwitch>
       </EditorContent> 

      </EditorRoot>
      

  )
}

export default Editore