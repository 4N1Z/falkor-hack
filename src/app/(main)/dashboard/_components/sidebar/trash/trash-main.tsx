import React from 'react';


import CustomDialogTrigger from '@/components/custom-dialog';
import TrashRestore from './trash-restore';

interface TrashProps {
  children: React.ReactNode;
}

const Trash: React.FC<TrashProps> = ({ children }) => {
  return (
    <CustomDialogTrigger
      header="Archive"
      content={<TrashRestore />}
    >
      {children}
    </CustomDialogTrigger>
  );
};

export default Trash;