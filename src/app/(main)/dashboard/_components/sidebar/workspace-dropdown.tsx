"use client";

import { workspace } from "@/db/database.types";
import { useAppState } from "@/lib/providers/state-providers";
import React, { useEffect, useState, useRef } from "react";
import WorkspaceSelected from "./workspace-selected";
import CustomDialogTrigger from "@/components/custom-dialog";
import WorkspaceCreator from "@/components/workspace-creator";

interface WorkspaceDropdownProps {
  privateWorkspaces: workspace[] | [];
  sharedWorkspaces: workspace[] | [];
  collaborativeWorkspaces: workspace[] | [];
  defaultValue: workspace | undefined;
  userId:string 
}

const workspaceTypeStyles = {
  private: {
    label: "text-amber-700 font-medium",
    divider: "border-amber-200",
    heading: "Private"
  },
  shared: {
    label: "text-green-700 font-medium",
    divider: "border-green-200",
    heading: "Shared"
  },
  collaborative: {
    label: "text-cyan-700 font-medium",
    divider: "border-cyan-200",
    heading: "Collaborative"
  }
};

export default function WorkspaceDropdown({
  privateWorkspaces,
  collaborativeWorkspaces,
  sharedWorkspaces,
  defaultValue,
  userId
}: WorkspaceDropdownProps) {

  const { dispatch, state } = useAppState();
  const [selectedState, setSelectedState] = useState<workspace | undefined>(
    defaultValue
  );
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const totalWorkspaces = privateWorkspaces.length + sharedWorkspaces.length + collaborativeWorkspaces.length;
  const MAX_WORKSPACES = 5;

  useEffect(() => {
    if (!state.workspaces.length) {
      // console.log(":: IN DISPATCH :: ")
      dispatch({
        type: "SET_WORKSPACES",
        payload: {
          workspaces: [
            ...privateWorkspaces,
            ...collaborativeWorkspaces,
            ...sharedWorkspaces,
          ].map((workspace) => ({ ...workspace, folders: [] })),
        },
      });
    }
  }, [privateWorkspaces, collaborativeWorkspaces, sharedWorkspaces]);
  // console.count("BUG#7 :  Workspace Drop-Down :: ")

  const handleSelect = (option: workspace) => {
    setSelectedState(option);
    setIsOpen(false);
  };

  useEffect(() => {
    const finddSelectedWorkspace = state.workspaces.find(
      (workspace) => workspace.id === defaultValue?.id
    );

    if (finddSelectedWorkspace) setSelectedState(finddSelectedWorkspace);
  }, [state, defaultValue]);


  {
    /*
    
    - Selected State is being set to the workspace that is selected
    - IsOpen is being set to false, when the workspace is selected
    
    
    */
  }

  // console.count("BUG #7 :  WTF called 34 times, on reload ::");

  const getWorkspaceType = (workspace: workspace) => {
    if (privateWorkspaces.some(w => w.id === workspace.id)) return "private";
    if (sharedWorkspaces.some(w => w.id === workspace.id)) return "shared";
    if (collaborativeWorkspaces.some(w => w.id === workspace.id)) return "collaborative";
    return "private"; // fallback
  };

  return (
    <div className="relative inline-block text-left w-full" ref={dropdownRef}>
      <span
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        {selectedState ? (
          <WorkspaceSelected
            workspace={selectedState}
            enableRedirection={false}
            type={getWorkspaceType(selectedState)}
          />
        ) : (
          "select a workspace"
        )}
      </span>
      <div className="relative">
        {isOpen && (
          <div className="origin-top-right absolute min-w-[100%] rounded-md shadow-lg z-50 bg-white group border-2 border-muted flex flex-col">
            <div className="p-2 overflow-y-auto max-h-[300px]">
              <div className="rounded-md flex flex-col">
                <div className="space-y-4">
                  {!!privateWorkspaces.length && (
                    <div className="space-y-2">
                      <p className={workspaceTypeStyles.private.label}>
                        {workspaceTypeStyles.private.heading}
                      </p>
                      <hr className={workspaceTypeStyles.private.divider} />
                      {privateWorkspaces.map((option) => (
                        <WorkspaceSelected
                          key={option.id}
                          workspace={option}
                          onClick={handleSelect}
                          enableRedirection={true}
                          type="private"
                          variant="dropdown"
                          isSelected={selectedState?.id === option.id}
                        />
                      ))}
                    </div>
                  )}

                  {!!sharedWorkspaces.length && (
                    <div className="space-y-2">
                      <p className={workspaceTypeStyles.shared.label}>
                        {workspaceTypeStyles.shared.heading}
                      </p>
                      <hr className={workspaceTypeStyles.shared.divider} />
                      {sharedWorkspaces.map((option) => (
                        <WorkspaceSelected
                          key={option.id}
                          workspace={option}
                          onClick={handleSelect}
                          enableRedirection={true}
                          type="shared"
                          variant="dropdown"
                          isSelected={selectedState?.id === option.id}
                        />
                      ))}
                    </div>
                  )}

                  {!!collaborativeWorkspaces.length && (
                    <div className="space-y-2">
                      <p className={workspaceTypeStyles.collaborative.label}>
                        {workspaceTypeStyles.collaborative.heading}
                      </p>
                      <hr className={workspaceTypeStyles.collaborative.divider} />
                      {collaborativeWorkspaces.map((option) => (
                        <WorkspaceSelected
                          key={option.id}
                          workspace={option}
                          onClick={handleSelect}
                          enableRedirection={true}
                          type="collaborative"
                          variant="dropdown"
                          isSelected={selectedState?.id === option.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

      <div className="sticky bottom-0 w-full border-t z-50 p-2">
        {totalWorkspaces >= MAX_WORKSPACES ? (
          <div className="flex 
            justify-center 
            items-center 
            gap-2
            p-2 
            w-full
            rounded-md
            cursor-not-allowed
            opacity-50
            bg-muted
            text-muted-foreground"
          >
            Workspace limit reached ({MAX_WORKSPACES})
          </div>
        ) : (
          <CustomDialogTrigger
            header="Create A Workspace"
            content={<WorkspaceCreator 
              userId={userId}
              currentWorkspaceCount={totalWorkspaces}  // Pass the count to WorkspaceCreator
            />}
            description="Workspaces give you the power to collaborate with others."
          >
            <div className="flex transition-colors duration-150 hover:bg-muted justify-center items-center gap-2 text-primary p-2 w-full rounded-md">
              New workspace <span className="font-bold">+</span>
            </div>
          </CustomDialogTrigger>
        )}
      </div>
          </div>
        )}
      </div>
    </div>
  );
}
