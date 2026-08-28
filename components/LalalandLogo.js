import Image from 'next/image';
import logo from '@/public/logo/lalaland.png';

/**
 * La La Land wordmark. The source PNG is 1918x333 (no SVG version exists in
 * public/logo); next/image keeps that intrinsic ratio while .auth-foot-mark
 * scales it down to a 26px-tall footer lockup.
 */
export default function LalalandLogo({ title = 'La La Land' }) {
  return <Image src={logo} alt={title} priority />;
}
