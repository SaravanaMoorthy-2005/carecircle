import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';

export const permissions = [
  'medication.read',
  'medication.write',
  'medication.confirm',
  'appointment.read',
  'appointment.write',
  'adherence.read',
  'alert.read',
  'alert.acknowledge',
  'assistance.respond',
  'members.manage',
  'privacy.manage',
  'audit.read',
  'members.read',
  'inventory.read',
  'inventory.write',
  'task.read',
  'task.act',
  'task.manage',
  'prescription.read',
  'prescription.write',
  'prescription.approve',
  'passport.read',
  'checkin.read',
  'checkin.write',
] as const;
export type Permission = (typeof permissions)[number];
export type Role = 'owner' | 'caregiver' | 'family';
export const roleCapabilities: Record<Role, readonly Permission[]> = {
  owner: permissions,
  caregiver: permissions.filter((p) => !['privacy.manage', 'members.manage'].includes(p)),
  family: [
    'medication.read',
    'medication.confirm',
    'appointment.read',
    'adherence.read',
    'alert.read',
    'members.read',
    'inventory.read',
    'task.read',
    'task.act',
    'passport.read',
    'checkin.read',
  ],
};
export const defaultRolePermissions: Record<'caregiver' | 'family', Permission[]> = {
  caregiver: [
    'medication.read',
    'medication.confirm',
    'appointment.read',
    'appointment.write',
    'adherence.read',
    'alert.read',
    'alert.acknowledge',
    'assistance.respond',
    'members.read',
    'inventory.read',
    'inventory.write',
    'task.read',
    'task.act',
    'task.manage',
    'prescription.read',
    'checkin.read',
  ],
  family: [
    'medication.read',
    'appointment.read',
    'adherence.read',
    'alert.read',
    'members.read',
    'inventory.read',
    'task.read',
    'task.act',
    'checkin.read',
  ],
};
export function roleAllows(role: Role, permission: Permission) {
  return roleCapabilities[role]?.includes(permission) ?? false;
}
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/, 'Invalid resource identifier');
export const timezone = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      Temporal.Now.zonedDateTimeISO(value);
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid IANA time zone');
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      Temporal.PlainDate.from(value);
      return true;
    } catch {
      return false;
    }
  }, 'Enter a valid date');
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time from 00:00 to 23:59');
const text = (max: number) => z.string().trim().max(max);
export const profileSchema = z
  .object({
    displayName: text(80).min(1),
    language: z.enum(['en', 'hi', 'ta']).default('en'),
    timeZone: timezone,
    emergencyContact: text(160).default(''),
    largeText: z.boolean().default(false),
    highContrast: z.boolean().default(false),
    consent: z.literal(true),
  })
  .strict();
export const medicationSchema = z
  .object({
    name: text(100).min(1),
    strength: text(100).min(1),
    instructions: text(1000).min(1),
    times: z
      .array(time)
      .min(1)
      .max(8)
      .refine((v) => new Set(v).size === v.length, 'Dose times must be unique'),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    startDate: date,
    endDate: date.nullable().default(null),
    timeZone: timezone,
    doctor: text(100).default(''),
    specialInstructions: text(1000).default(''),
    status: z.enum(['active', 'paused', 'archived']).default('active'),
  })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: 'End date must not precede start date',
    path: ['endDate'],
  });
export const appointmentSchema = z
  .object({
    clinician: text(100).min(1),
    specialty: text(100).default(''),
    localDate: date,
    localTime: time,
    timeZone: timezone,
    location: text(200).min(1),
    teleconsultationUrl: z
      .union([
        z.literal(''),
        z
          .url()
          .max(500)
          .refine((v) => new URL(v).protocol === 'https:', 'Use an HTTPS link'),
      ])
      .default(''),
    instructions: text(1000).default(''),
    status: z.enum(['scheduled', 'cancelled', 'completed']).default('scheduled'),
    reminderMinutes: z.array(z.number().int().min(5).max(10080)).max(4).default([1440, 60]),
  })
  .strict();
export const inviteSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    role: z.enum(['caregiver', 'family']),
    permissions: z
      .array(z.enum(permissions))
      .max(permissions.length)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export const preferencesSchema = z
  .object({
    email: z.boolean(),
    push: z.boolean(),
    upcomingMinutes: z.number().int().min(0).max(120),
    unconfirmedMinutes: z.number().int().min(5).max(240),
    escalationMinutes: z.number().int().min(10).max(480),
  })
  .strict()
  .refine(
    (v) => v.escalationMinutes > v.unconfirmedMinutes,
    'Escalation must follow the unconfirmed reminder',
  );
export const defaultPreferences = {
  email: true,
  push: false,
  upcomingMinutes: 15,
  unconfirmedMinutes: 30,
  escalationMinutes: 60,
};
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('insights'), circleId: id }).strict(),
  z.object({ action: z.literal('createCircle'), profile: profileSchema, requestId: id }).strict(),
  z
    .object({
      action: z.literal('updateProfile'),
      circleId: id,
      profile: profileSchema,
      version: z.number().int().min(1),
    })
    .strict(),
  z.object({ action: z.literal('invite'), circleId: id, invitation: inviteSchema }).strict(),
  z
    .object({ action: z.literal('redeem'), invitationId: id, code: z.string().regex(/^\d{8}$/) })
    .strict(),
  z.object({ action: z.literal('revokeInvite'), circleId: id, invitationId: id }).strict(),
  z
    .object({
      action: z.literal('member'),
      circleId: id,
      uid: id,
      permissions: z.array(z.enum(permissions)).max(permissions.length),
      status: z.enum(['active', 'revoked']),
    })
    .strict(),
  z
    .object({
      action: z.literal('saveMedication'),
      circleId: id,
      resourceId: id,
      version: z.number().int().min(0),
      medication: medicationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('confirmDose'),
      circleId: id,
      resourceId: id,
      version: z.number().int().min(1),
      state: z.enum(['taken', 'skipped']),
      requestId: id,
      reportedTakenAt: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('correctDose'),
      circleId: id,
      resourceId: id,
      version: z.number().int().min(1),
      reason: text(300).min(5),
    })
    .strict(),
  z
    .object({
      action: z.literal('saveAppointment'),
      circleId: id,
      resourceId: id,
      version: z.number().int().min(0),
      appointment: appointmentSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('help'),
      circleId: id,
      requestId: id,
      category: z.enum([
        'Medication assistance',
        'Appointment assistance',
        'Contact caregiver',
        'Other assistance',
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal('alert'),
      circleId: id,
      resourceId: id,
      collection: z.enum(['alerts', 'assistanceRequests']),
      version: z.number().int().min(1),
      state: z.enum(['acknowledged', 'resolved']),
      outcome: text(500).default(''),
    })
    .strict(),
  z.object({ action: z.literal('preferences'), preferences: preferencesSchema }).strict(),
  z.object({ action: z.literal('saveNote'), circleId: id, note: text(4000) }).strict(),
  z.object({ action: z.literal('readNote'), circleId: id }).strict(),
  z
    .object({
      action: z.literal('contactConsent'),
      circleId: id,
      enabled: z.boolean(),
      phone: z
        .string()
        .trim()
        .max(30)
        .regex(/^(?:[+\d\s()-]{7,30})?$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('passport'),
      circleId: id,
      includePrivateNotes: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal('readCompanion'), circleId: id, appointmentId: id }).strict(),
  z
    .object({
      action: z.literal('saveCompanion'),
      circleId: id,
      appointmentId: id,
      version: z.number().int().min(0),
      questions: text(2000),
      notes: text(2000),
      checklist: z
        .array(z.object({ id, label: text(120).min(1), done: z.boolean() }).strict())
        .max(15),
    })
    .strict(),
  z
    .object({
      action: z.literal('checkIn'),
      circleId: id,
      version: z.number().int().min(0),
      state: z.enum(['okay', 'help']),
      requestId: id,
    })
    .strict(),
  z
    .object({
      action: z.literal('wellbeingPreferences'),
      circleId: id,
      enabled: z.boolean(),
      localTime: time,
      followupMinutes: z.number().int().min(15).max(720),
      version: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal('followUp'),
      circleId: id,
      resourceId: id,
      version: z.number().int().positive(),
      reason: z.enum(['forgot', 'unavailable', 'assistance', 'unwell', 'already_taken']),
      requestId: id,
    })
    .strict(),
  z
    .object({
      action: z.literal('inventory'),
      circleId: id,
      medicationId: id,
      version: z.number().int().min(0),
      requestId: id,
      mode: z.enum(['set', 'restock']),
      quantity: z.number().finite().min(0).max(100000),
      unit: text(30).min(1),
      unitsPerDose: z.number().finite().min(0.01).max(1000),
      lowDays: z.number().int().min(1).max(90),
      reason: text(300).min(3),
    })
    .strict(),
  z.object({ action: z.literal('requestRefill'), circleId: id, medicationId: id }).strict(),
  z
    .object({
      action: z.literal('saveTask'),
      circleId: id,
      resourceId: id,
      version: z.number().int().min(0),
      task: z
        .object({
          title: text(120).min(3),
          category: z.enum(['medication', 'appointment', 'refill', 'general', 'coverage']),
          detail: text(1000),
          assignedTo: id.nullable(),
          dueAt: z.number().int().positive(),
          coverageStart: z.number().int().positive().nullable(),
          coverageEnd: z.number().int().positive().nullable(),
          relatedId: id.nullable(),
        })
        .strict()
        .refine(
          (t) =>
            t.category !== 'coverage' ||
            (!!t.coverageStart && !!t.coverageEnd && t.coverageEnd > t.coverageStart),
          'Coverage needs a valid start and end',
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal('taskTransition'),
      circleId: id,
      resourceId: id,
      version: z.number().int().positive(),
      state: z.enum(['accepted', 'declined', 'in_progress', 'completed']),
      outcome: text(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('draftPrescription'),
      circleId: id,
      requestId: id,
      source: text(300).min(3),
      items: z
        .array(
          z
            .object({
              medicationId: id,
              expectedVersion: z.number().int().min(0),
              medication: medicationSchema,
            })
            .strict(),
        )
        .min(1)
        .max(20)
        .refine(
          (items) => new Set(items.map((i) => i.medicationId)).size === items.length,
          'Each medication must appear once',
        ),
    })
    .strict(),
  z.object({ action: z.literal('readPrescription'), circleId: id, resourceId: id }).strict(),
  z
    .object({
      action: z.literal('applyPrescription'),
      circleId: id,
      resourceId: id,
      version: z.number().int().positive(),
      verified: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal('pushToken'),
      token: z.string().min(10).max(4096),
      remove: z.boolean(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Medication = z.infer<typeof medicationSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type CareTaskInput = Extract<Command, { action: 'saveTask' }>['task'];
export interface CareTask extends CareTaskInput {
  id: string;
  circleId: string;
  state: 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed';
  version: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  outcome?: string;
  assignedName?: string;
}
export interface Inventory {
  id: string;
  medicationId: string;
  balance: number;
  unit: string;
  unitsPerDose: number;
  lowDays: number;
  version: number;
  updatedAt: number;
}
export interface CareDirectoryMember {
  id: string;
  uid: string;
  displayName: string;
  role: Role;
  permissions: Permission[];
  status: 'active' | 'revoked';
  contactEmail?: string;
  contactPhone?: string;
}
export type PrescriptionItem = Extract<Command, { action: 'draftPrescription' }>['items'][number];
export interface Member {
  contactConsent?: boolean;
  contactPhone?: string;
  uid: string;
  circleId: string;
  displayName: string;
  email: string;
  role: 'owner' | 'caregiver' | 'family';
  permissions: Permission[];
  status: 'active' | 'revoked';
}
export interface Circle extends Profile {
  id: string;
  ownerId: string;
  version: number;
}
export type RecordWithId<T> = T & {
  id: string;
  version: number;
  createdAt: number;
  updatedAt: number;
};
export type DoseState = 'scheduled' | 'due' | 'taken' | 'skipped' | 'unconfirmed' | 'cancelled';
export interface Dose {
  id: string;
  medicationId: string;
  circleId: string;
  scheduledAt: number;
  localDate: string;
  localTime: string;
  timeZone: string;
  name: string;
  instructions: string;
  state: DoseState;
  version: number;
  scheduleVersion: number;
  confirmedAt?: number;
  confirmedBy?: string;
  source?: 'owner' | 'caregiver' | 'family';
  unconfirmedAfterMinutes?: number;
  unconfirmedAt?: number;
  requestId?: string;
  confirmedName?: string;
  reportedTakenAt?: number;
  inventoryConsumed?: number;
  followUpReason?: string;
  followUpAt?: number;
  followUpBy?: string;
  followUpRequestId?: string;
  followUpAcknowledged?: boolean;
}
export interface CareAlert {
  assignedCaregivers?: { uid: string; displayName: string }[];
  id: string;
  category: string;
  state: 'created' | 'sent' | 'acknowledged' | 'resolved';
  version: number;
  createdAt: number;
  updatedAt: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedBy?: string;
  outcome?: string;
  resourceId?: string;
  priority: 'normal' | 'high';
}
export interface Audit {
  id: string;
  actorId: string;
  action: string;
  resourceId: string;
  createdAt: number;
}
export interface InvitationSummary {
  id: string;
  email: string;
  role: string;
  permissions: Permission[];
  state: string;
  expiresAt: number;
}
