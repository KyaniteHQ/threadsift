import { PasswordSection } from "./PasswordSection.tsx";
import { SignOutSection } from "./SignOutSection.tsx";

export function AccountSections({
  signOut,
  signOutFailed,
}: Readonly<{ signOut: () => void; signOutFailed: boolean }>) {
  return (
    <>
      <SignOutSection signOut={signOut} failed={signOutFailed} />
      <PasswordSection />
    </>
  );
}
