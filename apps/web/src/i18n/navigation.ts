import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Locale-aware navigation helpers; always use these for internal UI links. */
export const { Link, redirect, usePathname, useRouter, getPathname, permanentRedirect } = createNavigation(routing);
