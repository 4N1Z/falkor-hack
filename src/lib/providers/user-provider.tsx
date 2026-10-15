'use client';

import { getUserSubscriptionUser } from '@/db/actions/get-user-subscription';
import { Subscription } from '@/db/database.types';
import { Session } from 'next-auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

// can be used i get the user session and subscription when dealing with client components
type UserContextType = {
  session: Session | null;
  subscription: Subscription | null;
};

const UserContext = createContext<UserContextType>({
  session: null,
  subscription: null,
});

export const useUser = () => {
  return useContext(UserContext);
};

interface UserProviderProps {
  children: React.ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  console.log()

  // Fetch subscription when session changes
  useEffect(() => {
    const getSubscription = async () => {
      if (session?.user?.id) {
        const { data, error } = await getUserSubscriptionUser(session.user.id);
        if (data) setSubscription(data);
        if (error) {
          toast('Unexpected Error', {
            description: 'Oops! An unexpected error happened. Try again later.',
          });
        }
      }
    };
    getSubscription();
  }, [session]);

  return (
 
      <UserContext.Provider value={{ session, subscription }}>
        {children}
      </UserContext.Provider>
   
  );
};