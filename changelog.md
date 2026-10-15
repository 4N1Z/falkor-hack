## Neura Query

This documents the changes made to the Neura Query project.
to download types for here : https://supabase.com/dashboard/project/dvftuokutylysenmwjzw/api?page=tables-intro

## In Use

- For utilizing the schema, import from migrations/schema
- For importing DB types, use it from database.types.ts
- for doing auth, import supabaseClient/supabaseServer.

- State Management is done using useContext + useReducer.

- when pulling schema, don't forget to copy-paste the subscription-schema to migration/schema.ts file from db/schema.ts (ts mismatch)


-To change the schema, chnage it in db/schema.ts file. (!important)

<!-- // TODO: -->
- Can easily add the contents in the folders/files to Vectorize, and store them under an ID.
- By using dispatch(local state-management, we can load the data into any external component and use it)
- But may need to add a row in the DB for folder, file and workspace.

### 22-10-2024

- Added drizzle to the project for database operations.
- Added drizzle.config.ts to the project for database migrations.
- Faced error while running drizzle-kit generate:
<hr/>

### 23-10-2024

- Fixed the error.(caused by using pnpm dlx🥹)

__//BUG__
- - Error while running drizzle-kit push/pull. Have asked in discord. Awaiting response.
- - Error happens when pulling the schemas all-together ([discord-link](https://discord.com/channels/1043890932593987624/1298587412821315624))

__//FIXED__
- - Fixed the migration issue. It was due to a driver not being installed.🥹
- - Fixed the error in schema.ts file.    
- - Changed the default schema file. (need to so a petty trick to work -- a work around!) 
- - if you pull from DB, don't forget to copy-paste the subscription-schema

- dummy landing page done  
<hr/>


### 24-10-2024

- Authentication 
- Navbar added
- custom auth / onto supabase / security setup complete.

- __//BUG__ __//FIXED__ 
- - Middleware issue  
- SignIn and LogIn page - logic 
- Custom Email template added for sending in confirmation emails.

- __//BUG__  __//FIXED__
- - supabase needs custom SMTP service to send in verification. 
- Brevo added for SMTP (supabse supports brevo. 300 mails/day )

- Both Login and Signup ready
- basic Dashboard routing and authentication added 


<hr/>


### 25-10-2024

- Database types added, after setting up supabase cli
- Dashboard page + user subscription logic
- Dashboard forms 
- Need to add storage options in supabase for image upload (create-workspace). 

- Adding Provider (feked up my mind 🙂🙂)

- __//BUG__
- - Error found in dashboard-setup while using dispatch - useAppState (need to check - now going to Lulu 🫶)

<hr/>

### 26-10-2024
- __//FIXED__
- - Error found in dashboard-setup while using dispatch - useAppState 



- Workspace-params-page 
- supabase storage setup completed

- __//BUG__ __//FIXED__ Error while calling supabase to get user in sidebar.tsx. (764 calls in under 10sec 🫶)

- DB call for workspaces(shared, collaborative, private)
- Main part : Dashboard in the making!
<hr/>


### 27-10-2024

- REDUX : Managing state for dashboard + workspaces
- REDUX : Zustand added for managing subscription and user. - But removed

- __//BUG#7__ : +6 renders each time, on click.

- dashboard : CRUD for collaborator 
- dashboard : CRUD for dashboards


- Need to test for errors

- Test success : DB CRUD working perfectly
- plan-usage-progress bar added
- Navigation - settings + trash + Home added
- Realtime folderrs needs to be added

<hr/>

### 28-10-2024

- Functionality for Adding folders done.
- Need to CRUD for Folders !
- Folders added to the workspace.
- Change file option added

- __//BUG__ files error 

<hr/>


### 29-10-2024

- File/FOlder Sytem added. Some minor smoothening required!
- Need to check the if there are any unwanted calls happening.(more efficient)
- __//BUG__ : Bug while updatng the file_name.
- Trash page added

- went home

<hr/>

### 30-10-2024

- Settings page added
- Edit workspace, name, add and remove collborators, update profile DP, update workspace banner
- change btw shared and private (simple logic - think it can be easily tampered from the frontend itself 🙂🙂)

<hr/>

### 31-10-2024

- Editor 
- Quill Editor added, since its open source and have Delta(google docs like feature)
- An opption to delete/restore files in trash added,working

- __//BUG__
-- A possible error on the onBlur event handler (for changing names.) when in folder and files.

<hr/>

### 2-11-2024

- Breadcrumbs for easy navigatoin added
- Banner for uploads added
- banner uploades added (CRUD for banner)
- socket provider added(context added)

- __//BUG__ Auth not working, a very big bug!
- __//FIX__ Login bug fixed
- __//BUG__ bug for cookies exist

- Realtime Working fine. Can see the edits, live collaborators name can be seen.
- Real time edits, using supabase realtime.

- __//BUG__ Realtime cursor not working. Seems like an issue with the quill-cursor package. need to dive into the ocean of quilll



### 7-11-2024

- __//BUG__ Editing name of file 
- __//BUG__ Only one editor, create a welcome folder on creating a workspace.

### 8-11-2024

- Novel editor added

### 8-11-2024

- Front end adding as per the UI

### 9-11-2024

- TODO : change the name of Trash to Archeive.

### 14-11-2024

- Starting with the front end of the project.

### 17-11-2024

- Novel editor works finished by @AnirudhDaya 
- Live collaboration also working good so far


### 19-11-2024

- Started work on Refactoring the workspace logic to accomdate the changes 
- Also need to refactor the structure.

- __//BUG__ : Novel editor is only being loaded on shared-workspace, not even on the files of that workspace.

### 22-11-2024

- __//BUG__ : Workspace selector onClick to be removed.
- __//BUG__ : Workspace selector is being called 34 times, on reload. at @workspace-dropdown.tsx

- work progressing to slooow. need to move fast

### 23-11-2024

- Need to do a change over for the settings page.
- Need to add the tabs, for the settings page, so that the user can switch btw workspace settings and user settings.
- else create a complete new page for the user settings.

- __//BUG__ : Archeived files delete option not showing. Need to check that in novel


### 24-11-2024

- Restructuring the project as VSCODE complete

- __//BUG__ : Novel editor not working
- __//BUG__ : Hocupocus, timeout needed. else it will go to infinite loop.


### 28-11-2024

 - __//BUG__ : Session should be cleared when a workspace is deleted. 

 - Whole DB feked up, when i tried to do a big blunder.
 - Tried to chnage the  


### 01-12-2024

- TODO : i need to configure the supabase DB, with stripe subscription, as default
- - Then remove the trigger from that SQL query
- - Then setup drizzle adapter in nextAuth
- - After that, i set a callback function to add in the new user in the user DB.
- - Then also need to update the nextAuth JS schema onto my schema


- HATE : Haven;t found the reason, why when adding the subscription the whole DB is being reset
- HATE : SO made my own schema, not following stripe schema.



### 03-12-2024

- Finally migrated from Supabase auth to NextAuth.
- All providers changed
- User provider added.(to access the user session and subscription in client components)
- Session provider added.(for next-auth to work on client components)

- ALl unnecessary codes removed.

__//BUG__ : CSS : change the hydration issue in the settings-form --> shared btn.
__//BUG__ : Workspace Selector in the sidebar --> dropdown not working.



### 10-12-2024

- __//TODO__ : add a slash command in the Neura AI chat, to get the research paper along with the answer.


### 11-12-2024

- __//TODO__: Remove utils/supabase

#### 14-12-20244

- __//TODO__ : Need to add onboarding and that onboarding data onto semantic search result.and add colors to make it feel goos