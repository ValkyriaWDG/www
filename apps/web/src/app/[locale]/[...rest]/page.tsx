import { notFound } from 'next/navigation';

/** Unknown localized paths render the localized not-found page (HTTP 404). */
export default function UnknownLocalizedRoute() {
  notFound();
}
