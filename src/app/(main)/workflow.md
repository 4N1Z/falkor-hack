# Application Structure

# Workflow

### Data Flow

1. Workspace Selection
   - User selects workspace
   - Loads workspace details and folders
   
2. Folder Navigation

   - Folders act as accordions
   - Display contained files
   - No separate folder view/editor

3. File Operations
   - Files are the only entities with editor content
   - Need both workspaceId and folderId for operations
   - Can be moved between folders while maintaining workspace relationship



## Workspace -> folderID -> files

- The workspace have an editor init
- The foler have a editor init
- The files also have an editor in it.

- Workspaces are top-level containers

  - Contains basic info (title, icon, banner)
  - No editor content at workspace level
  - Has `workspaceOwner` for permissions
  - Can be shared via collaborators table

- Folders belong to Workspaces

  - Referenced by `workspaceId` foreign key
  - Acts as organizational containers
  - No editor content at folder level
  - Cascade deletes with workspace

- Files

  - Files have dual relationships
  - Referenced by both `workspaceId` and `folderId`
  - This dual relationship allows:
    - Quick file lookup by workspace
    - Proper folder organization
    - Cascade deletes from either parent
  - Contains actual editor content in `data` field
  - Can have their own banner and icon


### Sharing & Collaboration

- Collaborators table tracks workspace access
  - Links users to workspaces
  - Enables workspace-level sharing

  - (TODO): Consider file-level sharing
  - (TODO): For sharing the files, need to change the DB schema
  - (TODO): Maybe add a fileID also to (to make it file wise sharabale)
  - (TODO): Check the DB logic in sharing workspace to understand how it works



## State Management

- State provider maintains hierarchical structure
- Reflects database relationships
- Enables quick access to:
  - Current workspace
  - Current folder
  - Current file
- Handles optimistic updates for better UX



## Sidebar

#### WorkspaceDropdown

- Handles the logic for selecting the workspace
- - `WorkspaceSelected` : Handles the logic for displaying the workspace
- - `WorkspaceCreator` : Handles the logic for creating the workspace

#### NativeNavigation

- Contains :
  - `Dashboard` :
  - `Settings` :
  - `Trash/Archive (Deleted Files)` :
  #### (TODO): EnableAIWorkspace
- Need to add the logic for enabling the AI for the entire workspace

#### FoldersDropdownList

- Handles the logic for displaying + creating + Deleting the folders
- - `DropDown` : Handles the logic for displaying the files inside the folder

#### (TODO): EnableAIWorkspace
#### (TODO): ResearchPaper List
- Need to add the logic for displaying the research paper from zotero
- Need to add the logic for adding the research paper from files



## TODO Updates

- Remove editor initialization from workspaces and folders
- Focus on file-level editing only
- Consider adding file-level sharing
- Improve folder navigation UX

- change the sidebar
- Then do the workspace menu. Focus on the functionality first
- Then make the necessary changes to the folder and files strucutre
- Then make the changes as such
- Need to correct the Auth.
- Make it proper else remove it and add lucia auth

## For AI :

- If we need to persist the AI history, we need to add a new table called AI_history.
- Then need to add referecne to userID and workspaceID/fileID
- Then need to add the logic to the sidebar to display the AI history.
- Should contain, the name of the AI, last edited Date, and history to be shown(json)
- Add persistance to DB, also add the updated at and created at columns.
- add a duration column to the AI history table, the AI history should be 10 days. 

## For research paper :

- Need to add a new table called research_paper.
- Need to add a column for 
- - userID
- - workspaceID 
- - fileID to connect it to the file
- - title
- - PaperID (from zotero)
- - last edited date

