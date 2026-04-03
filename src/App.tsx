import { Suspense, lazy, useEffect } from "react";
import districtArtwork from "./images/ChatGPT Image 2 avr. 2026, 21_17_56.png";
import cardArtwork from "./images/Cartes de pirate au crépuscule.png";
import freshVideo from "./videos/fresh.mp4";
import CasinoAuthScreen from "./features/app/components/CasinoAuthScreen";
import CasinoGameScreen from "./features/app/components/CasinoGameScreen";
import LoadingPanel from "./features/app/components/LoadingPanel";
import { useCasinoMedia } from "./features/app/useCasinoMedia";
import { useCasinoSession } from "./features/app/useCasinoSession";

const PirateSlotsGame = lazy(() => import("./PirateSlotsGame"));

export default function App() {
  const session = useCasinoSession();
  const media = useCasinoMedia({
    activeCasinoRoom: session.activeCasinoRoom,
    profileLoaded: Boolean(session.profile),
  });

  useEffect(() => {
    if (!session.profile || !session.pendingImmersionName) return;
    const nextImmersionName = session.consumePendingImmersionName();
    if (!nextImmersionName) return;
    void media.startConnectionImmersion(nextImmersionName);
  }, [session.profile, session.pendingImmersionName]);

  if (session.booting) {
    return (
      <main className="casino-shell casino-shell--loading">
        <LoadingPanel label="Ouverture du salon prive..." />
      </main>
    );
  }

  return (
    <main className={`casino-shell ${session.profile ? "casino-shell--game" : ""}`}>
      {!session.profile ? (
        <CasinoAuthScreen
          authMode={session.authMode}
          busy={session.busy}
          error={session.error}
          notice={session.notice}
          loginName={session.loginName}
          loginPassword={session.loginPassword}
          registerName={session.registerName}
          registerEmail={session.registerEmail}
          registerPassword={session.registerPassword}
          registerPasswordConfirm={session.registerPasswordConfirm}
          forgotEmail={session.forgotEmail}
          onAuthModeChange={session.setAuthMode}
          onLoginNameChange={session.setLoginName}
          onLoginPasswordChange={session.setLoginPassword}
          onRegisterNameChange={session.setRegisterName}
          onRegisterEmailChange={session.setRegisterEmail}
          onRegisterPasswordChange={session.setRegisterPassword}
          onRegisterPasswordConfirmChange={session.setRegisterPasswordConfirm}
          onForgotEmailChange={session.setForgotEmail}
          onLoginSubmit={(event) => {
            void media.requestMediaPlayback();
            void session.handleLogin(event);
          }}
          onRegisterSubmit={(event) => {
            void media.requestMediaPlayback();
            void session.handleRegister(event);
          }}
          onForgotSubmit={session.handleForgot}
        />
      ) : (
        <CasinoGameScreen
          profile={session.profile}
          busy={session.busy}
          error={session.error}
          notice={session.notice}
          displayName={session.displayName}
          activeCasinoRoom={session.activeCasinoRoom}
          ambientVideoAudible={media.ambientVideoAudible}
          showImmersion={media.showImmersion}
          immersionLine={media.immersionLine}
          mediaReady={media.mediaReady}
          ambientVideoRef={media.ambientVideoRef}
          freshVideo={freshVideo}
          districtArtwork={districtArtwork}
          cardArtwork={cardArtwork}
          onClaimBonus={session.handleClaimBonus}
          onRefreshProfile={() => void session.refreshProfile("Compte synchronise.")}
          onLogout={() => {
            media.resetMediaSession();
            session.handleLogout();
          }}
          gameTable={(
            <Suspense fallback={<LoadingPanel label="Chargement de la table..." />}>
              <PirateSlotsGame
                profile={session.profile}
                busy={session.busy}
                mediaReady={media.mediaReady}
                onRouletteEvent={media.handleRouletteEvent}
                onRequestMediaPlayback={() => {
                  void media.requestMediaPlayback();
                }}
                onProfileChange={session.handleProfileChange}
                onError={session.setError}
                onRoomChange={session.setActiveCasinoRoom}
              />
            </Suspense>
          )}
        />
      )}
    </main>
  );
}
