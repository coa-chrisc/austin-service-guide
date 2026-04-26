import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { StaffRole } from "@/types";

interface AuthContextValue {
  isAuthenticated: boolean;
  isStaff: boolean;
  staffRole: StaffRole | null;
  residentName: string | null;
  email: string | null;
  login: (email: string) => void;
  loginAsStaff: (email: string, role?: StaffRole) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isStaff: false,
  staffRole: null,
  residentName: null,
  email: null,
  login: () => {},
  loginAsStaff: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("asg-auth") === "true";
  });
  const [isStaff, setIsStaff] = useState(() => {
    return localStorage.getItem("asg-staff") === "true";
  });
  const [staffRole, setStaffRole] = useState<StaffRole | null>(() => {
    return (localStorage.getItem("asg-staff-role") as StaffRole) || null;
  });
  const [email, setEmail] = useState<string | null>(() => {
    return localStorage.getItem("asg-email");
  });
  const [residentName, setResidentName] = useState<string | null>(() => {
    return localStorage.getItem("asg-name");
  });

  const login = useCallback((userEmail: string) => {
    const name = userEmail.split("@")[0].replace(/[._]/g, " ");
    const displayName = name
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    setIsAuthenticated(true);
    setEmail(userEmail);
    setResidentName(displayName);
    setIsStaff(false);
    setStaffRole(null);
    localStorage.setItem("asg-auth", "true");
    localStorage.setItem("asg-email", userEmail);
    localStorage.setItem("asg-name", displayName);
    localStorage.removeItem("asg-staff");
    localStorage.removeItem("asg-staff-role");
  }, []);

  const loginAsStaff = useCallback(
    (staffEmail: string, role: StaffRole = "admin") => {
      const name = staffEmail.split("@")[0].replace(/[._]/g, " ");
      const displayName = name
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      setIsAuthenticated(true);
      setIsStaff(true);
      setStaffRole(role);
      setEmail(staffEmail);
      setResidentName(displayName);
      localStorage.setItem("asg-auth", "true");
      localStorage.setItem("asg-staff", "true");
      localStorage.setItem("asg-staff-role", role);
      localStorage.setItem("asg-email", staffEmail);
      localStorage.setItem("asg-name", displayName);
    },
    [],
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setIsStaff(false);
    setStaffRole(null);
    setEmail(null);
    setResidentName(null);
    localStorage.removeItem("asg-auth");
    localStorage.removeItem("asg-staff");
    localStorage.removeItem("asg-staff-role");
    localStorage.removeItem("asg-email");
    localStorage.removeItem("asg-name");
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      isStaff,
      staffRole,
      residentName,
      email,
      login,
      loginAsStaff,
      logout,
    }),
    [
      isAuthenticated,
      isStaff,
      staffRole,
      residentName,
      email,
      login,
      loginAsStaff,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
