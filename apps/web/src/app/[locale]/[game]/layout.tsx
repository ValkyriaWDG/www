import type { ReactNode } from 'react';
import { HllShell } from '@/components/hll/hll-shell';
import type { ShellAccount } from '@/components/shell/account-slot';
import { MenuShell } from '@/components/shell/menu-shell';
import { notFound } from 'next/navigation';
import { GAME_ROUTES, isGameRoute } from '@/modules/games/registry';
import { getHeaderAccountState } from '@/modules/auth/header-state';

export const dynamicParams = false;

export function generateStaticParams() {
  return GAME_ROUTES.map((game) => ({ game }));
}

/**
 * Game section frame. The URL segment is validated against the registry (unknown values
 * are a 404, never a default game). HLL gets the HLL game-menu shell; Wardogs keeps its
 * existing menu shell. Both share the single website session and the language control.
 */
export default async function GameLayout({ children, params }: LayoutProps<'/[locale]/[game]'>) {
  const { game } = await params;
  if (!isGameRoute(game)) notFound();
  const account: ShellAccount = await getHeaderAccountState();
  if (game === 'hll') return <HllShell account={account}>{children as ReactNode}</HllShell>;
  return (
    <MenuShell account={account} presentation="wardogs">
      {children as ReactNode}
    </MenuShell>
  );
}
