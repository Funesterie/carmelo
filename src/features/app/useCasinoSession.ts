import * as React from "react";
import { startTransition, useEffect, useMemo, useState } from "react";
import {
  SLOT_VIDEO_INTRO_ARMED_SESSION_KEY,
  SLOT_VIDEO_INTRO_SESSION_KEY,
  type RoomId,
} from "../casino/catalog";
import { BLACKJACK_SALONS } from "../../lib/tableSalons";
import { POKER_SALONS } from "../../lib/tableSalons";
import {
  claimCasinoDailyBonus,
  clearCasinoSession,
  fetchCasinoProfile,
  getCasinoDisplayName,
  hasCasinoToken,
  isCasinoSessionError,
  leaveCasinoTableRoom,
  loginCasino,
  registerCasino,
  requestCasinoPasswordReset,
  type CasinoProfile,
} from "../../lib/casinoApi";
import { readSyncedTableSelection } from "../../lib/tableChannelSync";

export type AuthMode = "login" | "register" | "forgot";

const CASINO_IMMERSION_AUDIO_SESSION_KEY = "casino.immersion.funesterie.played";

type UseCasinoSessionOptions = {
};

let bootProfilePromise: Promise<CasinoProfile | null> | null = null;

async function loadBootCasinoProfile() {
  if (!hasCasinoToken()) {
    return null;
  }

  if (!bootProfilePromise) {
    bootProfilePromise = fetchCasinoProfile()
      .then((profile) => profile)
      .finally(() => {
        bootProfilePromise = null;
      });
  }

  return bootProfilePromise;
}

export function useCasinoSession(_: UseCasinoSessionOptions = {}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [profile, setProfile] = useState<CasinoProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeCasinoRoom, setActiveCasinoRoom] = useState<RoomId>("slots");
  const [pendingImmersionName, setPendingImmersionName] = useState("");
  const [roomChangeCount, setRoomChangeCount] = useState(0);

  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!hasCasinoToken()) {
        if (!cancelled) setBooting(false);
        return;
      }

      try {
        const nextProfile = await loadBootCasinoProfile();
        if (!nextProfile) {
          if (!cancelled) setBooting(false);
          return;
        }
        if (cancelled) return;
        startTransition(() => setProfile(nextProfile));
        setNotice(`Bienvenue a bord, ${nextProfile.user.username}.`);
      } catch (error_) {
        if (cancelled) return;
        if (isCasinoSessionError(error_)) {
          clearCasinoSession();
          setError("La session a expire. Reconnecte-toi pour retrouver ton solde.");
        } else {
          setError(error_ instanceof Error ? error_.message : "Le compte est momentanement indisponible.");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => {
      setNotice((current) => (current === notice ? "" : current));
    }, 3600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  const displayName = useMemo(() => {
    return profile?.user?.username || getCasinoDisplayName() || "Capitaine";
  }, [profile]);

  function resetConnectedSessionMediaIntro() {
    try {
      sessionStorage.removeItem(SLOT_VIDEO_INTRO_SESSION_KEY);
      sessionStorage.setItem(SLOT_VIDEO_INTRO_ARMED_SESSION_KEY, "1");
      sessionStorage.removeItem(CASINO_IMMERSION_AUDIO_SESSION_KEY);
    } catch {
      // ignore storage failures
    }
  }

  async function refreshProfile(message = "") {
    setBusy(true);
    setError("");
    try {
      const nextProfile = await fetchCasinoProfile();
      startTransition(() => setProfile(nextProfile));
      if (message) setNotice(message);
    } catch (error_) {
      if (isCasinoSessionError(error_)) {
        handleLogout();
        setError("La session a expire. Reconnecte-toi pour retrouver ton solde.");
        return;
      }
      setError(error_ instanceof Error ? error_.message : "Impossible de charger le compte.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await loginCasino(loginName, loginPassword);
      const nextProfile = await fetchCasinoProfile();
      resetConnectedSessionMediaIntro();
      setActiveCasinoRoom("slots");
      startTransition(() => setProfile(nextProfile));
      setPendingImmersionName(nextProfile.user.username);
      setNotice(`Bienvenue a bord, ${nextProfile.user.username}.`);
      setLoginPassword("");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registerPassword !== registerPasswordConfirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      await registerCasino(registerName, registerEmail, registerPassword);
      const nextProfile = await fetchCasinoProfile();
      resetConnectedSessionMediaIntro();
      setActiveCasinoRoom("slots");
      startTransition(() => setProfile(nextProfile));
      setPendingImmersionName(nextProfile.user.username);
      setNotice(`Compte cree. Bon vent, ${nextProfile.user.username}.`);
      setRegisterPassword("");
      setRegisterPasswordConfirm("");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Inscription impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestCasinoPasswordReset(forgotEmail);
      setNotice("Un lien de reinitialisation a ete envoye si l’email existe.");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClaimBonus() {
    setBusy(true);
    setError("");
    try {
      const result = await claimCasinoDailyBonus();
      startTransition(() => setProfile(result.profile));
      setNotice(`Bonus journalier recupere: +${result.claimedAmount} credits.`);
    } catch (error_) {
      if (isCasinoSessionError(error_)) {
        handleLogout();
        setError("La session a expire. Reconnecte-toi pour retrouver ton solde.");
        return;
      }
      setError(error_ instanceof Error ? error_.message : "Bonus indisponible.");
    } finally {
      setBusy(false);
    }
  }

  function handleRoomChange(nextRoomId: RoomId) {
    if (nextRoomId === activeCasinoRoom) {
      return;
    }

    const previousRoom = activeCasinoRoom;
    if (hasCasinoToken() && (previousRoom === "blackjack" || previousRoom === "poker")) {
      const previousTableRoomId =
        readSyncedTableSelection(previousRoom)
        || (previousRoom === "blackjack" ? BLACKJACK_SALONS[0]?.id : POKER_SALONS[0]?.id)
        || "";

      if (previousTableRoomId) {
        void leaveCasinoTableRoom(previousRoom, previousTableRoomId).catch(() => {
          // Best effort only: the room component cleanup also releases table presence.
        });
      }
    }

    setRoomChangeCount((current) => current + 1);
    setActiveCasinoRoom(nextRoomId);
  }

  function handleLogout() {
    setPendingImmersionName("");
    setActiveCasinoRoom("slots");
    try {
      sessionStorage.removeItem(SLOT_VIDEO_INTRO_SESSION_KEY);
      sessionStorage.removeItem(SLOT_VIDEO_INTRO_ARMED_SESSION_KEY);
      sessionStorage.removeItem(CASINO_IMMERSION_AUDIO_SESSION_KEY);
    } catch {
      // ignore storage failures
    }
    clearCasinoSession();
    setProfile(null);
    setNotice("Session fermee.");
    setError("");
    setLoginPassword("");
  }

  function consumePendingImmersionName() {
    const nextValue = pendingImmersionName;
    setPendingImmersionName("");
    return nextValue;
  }

  function handleProfileChange(nextProfile: CasinoProfile, message?: string) {
    startTransition(() => setProfile(nextProfile));
    if (message) setNotice(message);
  }

  return {
    authMode,
    setAuthMode,
    profile,
    booting,
    busy,
    error,
    notice,
    activeCasinoRoom,
    roomChangeCount,
    setActiveCasinoRoom,
    handleRoomChange,
    displayName,
    pendingImmersionName,
    consumePendingImmersionName,
    loginName,
    setLoginName,
    loginPassword,
    setLoginPassword,
    registerName,
    setRegisterName,
    registerEmail,
    setRegisterEmail,
    registerPassword,
    setRegisterPassword,
    registerPasswordConfirm,
    setRegisterPasswordConfirm,
    forgotEmail,
    setForgotEmail,
    setError,
    setNotice,
    refreshProfile,
    handleLogin,
    handleRegister,
    handleForgot,
    handleClaimBonus,
    handleLogout,
    handleProfileChange,
  };
}
