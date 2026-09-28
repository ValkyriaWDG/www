import type { ReactNode } from 'react';
import type { ShellAccount } from '@/components/shell/account-slot';
import { MenuShell } from '@/components/shell/menu-shell';
import { getHeaderAccountState } from '@/modules/auth/header-state';

/**
 * Shared Valkyria frame: community hub (`/`), shared community pages, sign-in, account and
 * administration. Game sections live under `[game]` with their own presentation.
 */
export default async function PlatformLayout({ children }: LayoutProps<'/[locale]'>) {
  // Signed-in projection for the header; visibility is convenience only, account/admin
  // routes authorize every request on the server.
  const account: ShellAccount = await getHeaderAccountState();
  return (
    <MenuShell account={account} presentation="platform">
      {children as ReactNode}
    </MenuShell>
  );
}
