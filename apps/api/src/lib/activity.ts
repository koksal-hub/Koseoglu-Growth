import { Prisma, type Activity } from '@prisma/client';
import { prisma } from './prisma';

/** Thrown when an Activity violates the "at least one of Lead/Contact" invariant. */
export class ActivityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityValidationError';
  }
}

/**
 * Creates an Activity, enforcing the invariant that every Activity must
 * reference at least one of a Lead or a Contact. The database backs this up
 * with a CHECK constraint ("Activity_lead_or_contact_required"), but this
 * helper is the intended write path so callers get a clear validation error
 * instead of a raw database error.
 */
export async function createActivity(data: Prisma.ActivityUncheckedCreateInput): Promise<Activity> {
  if (!data.leadId && !data.contactId) {
    throw new ActivityValidationError(
      'Activity must reference at least one of leadId or contactId'
    );
  }
  return prisma.activity.create({ data });
}
