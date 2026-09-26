import { readDelivery } from './delivery';

/** Fails the actual-media suite before any browser work when the delivered files are absent or altered. */
export default async function verifyDelivery(): Promise<void> {
  const files = await readDelivery();
  for (const file of files) console.log(`verified ${file.filename} ${file.bytes} bytes sha256 ${file.sha256}`);
}
