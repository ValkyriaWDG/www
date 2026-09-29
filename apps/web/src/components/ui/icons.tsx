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

/*
 * Interface glyphs from the original Valkyria UI icon pack (assets/icons/valkyria-ui,
 * docs/assets/icon-handoff.md): geometry copied unchanged from each 24×24 source SVG.
 * Not clan, game, Discord, rank or faction marks.
 */

export const MembersIcon = (props: IconProps) => (
  <Icon {...props} data-icon="members">
    <circle cx="8" cy="8" r="3" />
    <path d="M2.5 21v-3.5a5.5 5.5 0 0 1 11 0V21M16 5a3 3 0 0 1 0 6M17 14a4.5 4.5 0 0 1 4.5 4.5V21" />
  </Icon>
);

export const MatchIcon = (props: IconProps) => (
  <Icon {...props} data-icon="match">
    <path d="M4 21V3M4 4h6v7H4M20 21V3M20 4h-6v7h6M10 17h4" />
  </Icon>
);

export const TrophyIcon = (props: IconProps) => (
  <Icon {...props} data-icon="trophy">
    <path d="M7 3h10v5a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 13v5M8 21v-3h8v3M6 21h12" />
  </Icon>
);

export const ServerIcon = (props: IconProps) => (
  <Icon {...props} data-icon="server">
    <rect x="3" y="4" width="18" height="6" />
    <rect x="3" y="14" width="18" height="6" />
    <path d="M6 7h1M11 7h7M6 17h1M11 17h7" />
  </Icon>
);

export const ManualIcon = (props: IconProps) => (
  <Icon {...props} data-icon="manual">
    <path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15M6 8h3M6 12h3M15 8h3M15 12h3" />
  </Icon>
);

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props} data-icon="calendar">
    <rect x="3" y="5" width="18" height="16" />
    <path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3" />
  </Icon>
);

export const FilterIcon = (props: IconProps) => (
  <Icon {...props} data-icon="filter">
    <path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" />
  </Icon>
);

export const RefreshIcon = (props: IconProps) => (
  <Icon {...props} data-icon="refresh">
    <path d="M20 8a8.5 8.5 0 0 0-14-3L3 8M3 3v5h5M4 16a8.5 8.5 0 0 0 14 3l3-3M16 16h5v5" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon {...props} data-icon="copy">
    <rect x="8" y="8" width="13" height="13" />
    <path d="M16 4V3H3v13h1" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props} data-icon="settings">
    <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3H9Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const UploadIcon = (props: IconProps) => (
  <Icon {...props} data-icon="upload">
    <path d="M12 15V3M7 8l5-5 5 5M3 14v7h18v-7" />
  </Icon>
);

export const PreviewIcon = (props: IconProps) => (
  <Icon {...props} data-icon="preview">
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const SaveIcon = (props: IconProps) => (
  <Icon {...props} data-icon="save">
    <path d="M3 3h15l3 3v15H3V3ZM7 3v6h9V3M7 21v-7h10v7M13 6h.5" />
  </Icon>
);

export const HistoryIcon = (props: IconProps) => (
  <Icon {...props} data-icon="history">
    <path d="M3 4v5h5M3 9a9 9 0 1 1 1 9M12 7v5l4 2" />
  </Icon>
);

export const EditIcon = (props: IconProps) => (
  <Icon {...props} data-icon="edit">
    <path d="m4 15 12-12 5 5L9 20l-6 1 1-6ZM13 6l5 5M4 15l5 5" />
  </Icon>
);

export const DeleteIcon = (props: IconProps) => (
  <Icon {...props} data-icon="delete">
    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
  </Icon>
);
