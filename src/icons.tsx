import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const defaultSize = 16;

// ===== Game core icons =====

export const BombIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="14" r="8" fill="currentColor" opacity="0.9" />
    <rect x="11" y="2" width="2" height="5" rx="1" fill="currentColor" />
    <line x1="6" y1="6" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="18" y1="6" x2="15.5" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="9.5" cy="11.5" r="2" fill="white" opacity="0.3" />
  </svg>
);

export const FlagIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M5 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M5 4l12 4-12 4" fill="#ef4444" />
    <rect x="3" y="19" width="6" height="2" rx="1" fill="currentColor" opacity="0.6" />
  </svg>
);

export const TrophyIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M8 2h8v10a4 4 0 01-8 0V2z" fill="#facc15" />
    <path d="M16 4h2a3 3 0 010 6h-2" stroke="#facc15" strokeWidth="2" />
    <path d="M8 4H6a3 3 0 000 6h2" stroke="#facc15" strokeWidth="2" />
    <rect x="10" y="14" width="4" height="4" fill="#facc15" />
    <rect x="7" y="18" width="10" height="2" rx="1" fill="#facc15" />
  </svg>
);

export const CrownIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 18L5 8l4 4 3-6 3 6 4-4 2 10H3z" fill="#facc15" />
    <circle cx="5" cy="7" r="1.5" fill="#facc15" />
    <circle cx="12" cy="4" r="1.5" fill="#facc15" />
    <circle cx="19" cy="7" r="1.5" fill="#facc15" />
  </svg>
);

export const GamepadIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="6" width="20" height="12" rx="4" />
    <circle cx="16.5" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="10" r="1" fill="currentColor" />
    <line x1="7" y1="10" x2="7" y2="14" />
    <line x1="5" y1="12" x2="9" y2="12" />
  </svg>
);

export const UsersIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
    <circle cx="17" cy="7" r="3" />
    <path d="M21 21v-2a3 3 0 00-2-2.83" />
  </svg>
);

// ===== Status / face icons for game status button =====

export const SmileFaceIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
    <path d="M8 14.5c1 2 7 2 8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const NeutralFaceIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
    <line x1="8" y1="15" x2="16" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const CoolFaceIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <rect x="5" y="8" width="5.5" height="3" rx="1.5" fill="currentColor" />
    <rect x="13.5" y="8" width="5.5" height="3" rx="1.5" fill="currentColor" />
    <path d="M8 15c1 2 7 2 8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const DizzyFaceIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <line x1="7" y1="8" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="8" x2="7" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="8" x2="17" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="17" y1="8" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12" cy="16" r="2" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const SadFaceIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
    <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
    <path d="M8 16.5c1-2 7-2 8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ===== UI icons =====

export const TargetIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const HourglassIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 3h14v4l-5 5 5 5v4H5v-4l5-5-5-5V3z" />
  </svg>
);

export const EyeIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const DoorIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const PencilIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

export const UnlockIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 019.9-1" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

export const InboxIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
  </svg>
);

export const RocketIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

export const QuestionIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
  </svg>
);

export const HandshakeIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 17l-1.5 1.5a2.12 2.12 0 01-3-3L11 11" />
    <path d="M13 7l1.5-1.5a2.12 2.12 0 013 3L13 13" />
    <path d="M2 12h4l3-3" />
    <path d="M22 12h-4l-3 3" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CheckCircleIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="16 9 10.5 14.5 8 12" />
  </svg>
);

export const LightningIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
  </svg>
);

export const StopwatchIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M10 2h4" />
    <path d="M12 2v2" />
  </svg>
);

export const ChessPawnIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <circle cx="12" cy="6" r="3" />
    <path d="M9 10h6l1 4H8l1-4z" />
    <path d="M7 16h10l1 4H6l1-4z" />
  </svg>
);

export const ExplosionIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2l2 5 5-2-3 4 4 3-5 1 1 5-4-3-4 3 1-5-5-1 4-3-3-4 5 2z" />
  </svg>
);

export const PartyIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5.8 11.3L2 22l10.7-3.8" />
    <path d="M4 3h.01" />
    <path d="M22 8h.01" />
    <path d="M15 2h.01" />
    <path d="M22 20h.01" />
    <path d="M22 2l-2.24.75a2.9 2.9 0 00-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" />
    <path d="M22 13l-7 2" />
  </svg>
);

export const DesertIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 22c2-4 4-6 6-6s3 2 5 2 4-4 6-4 3 2 3 2" />
    <circle cx="12" cy="4" r="3" fill="none" />
    <line x1="12" y1="7" x2="12" y2="12" />
    <line x1="9" y1="10" x2="12" y2="8" />
    <line x1="15" y1="9" x2="12" y2="7" />
  </svg>
);

// ===== Arena / Diep icon =====

export const SwordsIcon: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2L18 5.5 9.5 14 6 10.5 14.5 2z" />
    <path d="M18 5.5L22 2" />
    <path d="M22 6l-4-4" />
    <path d="M9.5 2L6 5.5 14.5 14 18 10.5 9.5 2z" />
    <path d="M6 5.5L2 2" />
    <path d="M2 6l4-4" />
    <path d="M3 21l5-5" />
    <path d="M21 21l-5-5" />
  </svg>
);

// ===== Difficulty dot icons =====

export const DifficultyDot: React.FC<IconProps & { color: string }> = ({ size = 12, color, className }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
    <circle cx="6" cy="6" r="5" fill={color} />
  </svg>
);

export const EasyDot: React.FC<IconProps> = (props) => <DifficultyDot color="#22c55e" {...props} />;
export const MediumDot: React.FC<IconProps> = (props) => <DifficultyDot color="#eab308" {...props} />;
export const HardDot: React.FC<IconProps> = (props) => <DifficultyDot color="#ef4444" {...props} />;
