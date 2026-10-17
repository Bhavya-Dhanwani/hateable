import { createContext, use } from 'react';

export const TransitionContext = createContext(null);
export const useHeartbreak = () => use(TransitionContext);
