import { create } from "zustand";
import { getAuthStatus, logoutUser, UserProfile } from "@/lib/api";

interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  appId: string;
  isLoading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  appId: "",
  isLoading: true,
  error: null,

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await getAuthStatus();
      set({
        isAuthenticated: data.authenticated,
        user: data.user,
        appId: data.app_id,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        isAuthenticated: false,
        user: null,
        error: err.message,
        isLoading: false,
      });
    }
  },

  logout: async () => {
    try {
      await logoutUser();
      set({ isAuthenticated: false, user: null });
    } catch (err) {
      set({ isAuthenticated: false, user: null });
    }
  },
}));
