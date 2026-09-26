import type { ReactNode, SVGProps } from 'react';

/** Original simple line icons (24×24, currentColor). Decorative: names come from adjacent text. */
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 24, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const NewsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 3.5h8.5L18.5 7.5V20.5H6z" />
    <path d="M14 3.5v4.5h4.5M9 11h6.5M9 14h6.5M9 17h4.5" />
  </Icon>
);

/** Community chat bubble used for the Discord link (not a third-party logo). */
export const CommunityIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 5.5h17v11h-9l-4.5 3.5v-3.5h-3.5z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
  </Icon>
);

export const GlobeIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z" />
  </Icon>
);

export const ExternalIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.5 4.5h6v6M19.5 4.5l-9 9M17.5 14v5.5h-13v-13H10" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7.5 5v14l11-7z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const VideoOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 7h11v10h-11zM14.5 10.5l6-3v9l-6-3M3 3l18 18" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
  </Icon>
);

export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20.5c.8-4 3.6-6 7.5-6s6.7 2 7.5 6" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Icon>
);

export const SortIcon = (props: IconProps & { direction?: 'ascending' | 'descending' | 'none' }) => {
  const { direction = 'none', ...rest } = props;
  return (
    <Icon {...rest}>
      <path d="M8 10l4-4.5 4 4.5" opacity={direction === 'descending' ? 0.35 : 1} />
      <path d="M8 14l4 4.5 4-4.5" opacity={direction === 'ascending' ? 0.35 : 1} />
    </Icon>
  );
};

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5.5 5.5" />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5l9 16H3z" />
    <path d="M12 10v4.5M12 17h.01" />
  </Icon>
);

export const ErrorIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8.2 3.5h7.6l5.2 5.2v7.6l-5.2 5.2H8.2L3 16.3V8.7z" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Icon>
);

export const DotIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 9h6v6H9z" fill="currentColor" stroke="none" />
  </Icon>
);

export const ShieldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5l7.5 3v5.5c0 4.3-3 7.4-7.5 8.5-4.5-1.1-7.5-4.2-7.5-8.5V6.5z" />
  </Icon>
);
