import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/** Demo staff identity. Auth is a stub: no password, role not enforced. */
export const DEMO_STAFF_EMAIL = "staff@example.gov";

/** Sign in as the demo staff user and open the staff console. */
export function useOpenStaffDemo(): () => void {
  const navigate = useNavigate();
  const { loginAsStaff } = useAuth();
  return useCallback(() => {
    loginAsStaff(DEMO_STAFF_EMAIL, "admin");
    navigate("/admin");
  }, [loginAsStaff, navigate]);
}
