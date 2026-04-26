"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { login } from "@/lib/api";
import {
  getDefaultRouteForRole,
  getStoredAuthSession,
  setStoredAuthSession,
  type AuthRole,
  type StoredAuthSession,
} from "@/store/auth";

type UseAuthGuardResult = {
  isCheckingAuth: boolean;
  session: StoredAuthSession | null;
};

export function useAuthGuard(allowedRoles?: AuthRole[]): UseAuthGuardResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const allowedRolesKey = (allowedRoles || []).join(",");
  const linkKey = String(searchParams.get("key") || "").trim();

  useEffect(() => {
    let active = true;

    const load = async () => {
      const roleList = allowedRolesKey ? (allowedRolesKey.split(",") as AuthRole[]) : [];
      let storedSession = await getStoredAuthSession();

      if (linkKey) {
        try {
          const auth = await login(linkKey);
          storedSession = {
            key: linkKey,
            role: auth.role,
            subjectId: auth.subject_id,
            name: auth.name,
            scope: auth.scope,
            quotaLimit: auth.quota_limit,
            quotaUsed: auth.quota_used,
            quotaRemaining: auth.quota_remaining,
            quotaMode: auth.quota_mode,
            publicFreeLimit: auth.public_free_limit,
            publicFreeUsed: auth.public_free_used,
            publicFreeRemaining: auth.public_free_remaining,
            quotaResetDate: auth.quota_reset_date,
            expiresAt: auth.expires_at ?? null,
          };
          await setStoredAuthSession(storedSession);
          router.replace("/image");
        } catch {
          storedSession = null;
        }
      }

      if (!active) {
        return;
      }

      if (!storedSession) {
        setSession(null);
        setIsCheckingAuth(false);
        router.replace("/login");
        return;
      }

      if (roleList.length > 0 && !roleList.includes(storedSession.role)) {
        setSession(storedSession);
        setIsCheckingAuth(false);
        router.replace(getDefaultRouteForRole(storedSession.role));
        return;
      }

      setSession(storedSession);
      setIsCheckingAuth(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [allowedRolesKey, linkKey, router]);

  return { isCheckingAuth, session };
}

export function useRedirectIfAuthenticated() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const storedSession = await getStoredAuthSession();
      if (!active) {
        return;
      }

      if (storedSession) {
        router.replace(getDefaultRouteForRole(storedSession.role));
        return;
      }

      setIsCheckingAuth(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  return { isCheckingAuth };
}
