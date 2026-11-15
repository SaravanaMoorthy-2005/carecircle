import {
  CalendarDays,
  House,
  Pill,
  Users,
  Ellipsis,
  ListTodo,
  Bell,
  ChartNoAxesCombined,
  History,
  ShieldCheck,
  PackageCheck,
  FileCheck2,
  ContactRound,
  Smile,
  ClipboardList,
  Settings,
} from 'lucide-react';
import type { Permission, Role } from '@carecircle/shared';
export const destinations = [
  {
    path: '/dashboard',
    label: 'Overview',
    icon: House,
    permission: null,
    description: 'Your daily care plan and next important action.',
  },
  {
    path: '/medications',
    label: 'Medications',
    icon: Pill,
    permission: 'medication.read',
    description: 'Prescribed medicines, schedules and dose details.',
  },
  {
    path: '/tasks',
    label: 'CareShift',
    icon: ListTodo,
    permission: 'task.read',
    description: 'Shared responsibilities and caregiver coverage.',
  },
  {
    path: '/appointments',
    label: 'Appointments',
    icon: CalendarDays,
    permission: 'appointment.read',
    description: 'Upcoming visits and your Appointment Companion.',
  },
  {
    path: '/members',
    label: 'Care Circle',
    icon: Users,
    permission: 'members.read',
    description: 'The people you trust and their responsibilities.',
  },
  {
    path: '/inventory',
    label: 'Refill Guardian',
    icon: PackageCheck,
    permission: 'inventory.read',
    description: 'Stock estimates and refill planning.',
  },
  {
    path: '/prescriptions',
    label: 'DischargeSync',
    icon: FileCheck2,
    permission: 'prescription.read',
    description: 'Compare and verify clinician-issued changes.',
  },
  {
    path: '/history',
    label: 'Dose history',
    icon: History,
    permission: 'medication.read',
    description: 'Reported actions and audited corrections.',
  },
  {
    path: '/alerts',
    label: 'Updates',
    icon: Bell,
    permission: 'alert.read',
    description: 'Care alerts and notifications from your circle.',
  },
  {
    path: '/insights',
    label: 'Care insights',
    icon: ChartNoAxesCombined,
    permission: 'adherence.read',
    description: 'Understand reported confirmations over time.',
  },
  {
    path: '/passport',
    label: 'CarePassport',
    icon: ContactRound,
    permission: 'passport.read',
    description: 'An authorized, private summary for care conversations.',
  },
  {
    path: '/wellbeing',
    label: 'Wellbeing Check-In',
    icon: Smile,
    permission: 'checkin.read',
    description: 'A simple daily check-in, on your terms.',
  },
  {
    path: '/handoff',
    label: 'Care Handoff',
    icon: ClipboardList,
    permission: 'task.read',
    description: 'A concise briefing for the next caregiver.',
  },
  {
    path: '/activity',
    label: 'Care activity',
    icon: ShieldCheck,
    permission: 'audit.read',
    description: 'An accountable history of care-circle changes.',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    permission: null,
    description: 'Profile, accessibility, privacy and preferences.',
  },
] satisfies {
  path: string;
  label: string;
  icon: typeof House;
  permission: Permission | null;
  description: string;
}[];
export function navigationFor(role: Role) {
  const item = (path: string, label: string) => ({
    ...destinations.find((d) => d.path === path)!,
    label,
  });
  if (role === 'caregiver')
    return [
      item('/dashboard', 'Overview'),
      item('/tasks', 'Care Tasks'),
      item('/medications', 'Medications'),
      item('/appointments', 'Appointments'),
      item('/members', 'Care Circle'),
    ];
  if (role === 'family')
    return [
      item('/dashboard', 'Care Overview'),
      item('/alerts', 'Updates'),
      item('/tasks', 'Responsibilities'),
      item('/appointments', 'Appointments'),
      item('/members', 'Family'),
    ];
  return [
    item('/dashboard', 'Today'),
    item('/medications', 'My Medicines'),
    item('/appointments', 'Appointments'),
    item('/members', 'My Care Circle'),
    { path: '/more', label: 'More', icon: Ellipsis, permission: null, description: '' },
  ];
}
export function routeAllowed(path: string, can: (p: Permission) => boolean) {
  const requirement = destinations.find((d) => d.path === path)?.permission;
  return (
    (!requirement || can(requirement)) &&
    (!['/inventory', '/passport'].includes(path) || can('medication.read'))
  );
}
