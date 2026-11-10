import type { Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PortalProjectsService } from './portal-projects.service';

describe('PortalProjectsService.findMilestone', () => {
  let service: PortalProjectsService;
  let prisma: { milestone: { findFirst: Mock } };
  let context: { require: Mock; sharedProjectIds: Mock };

  beforeEach(() => {
    prisma = { milestone: { findFirst: vi.fn() } };
    context = {
      require: vi.fn().mockResolvedValue({ clientId: 'c-1', permission: { viewPayments: false } }),
      sharedProjectIds: vi.fn().mockResolvedValue(['p-1']),
    };
    service = new PortalProjectsService(
      prisma as any,
      {} as any,
      context as any,
    );
  });

  it('reads one milestone of a shared project with client-facing columns only', async () => {
    prisma.milestone.findFirst.mockResolvedValue({ id: 'm-1', name: 'M01' });

    await expect(
      service.findMilestone('portal-1', 'u-1', 'p-1', 'm-1'),
    ).resolves.toEqual({
      id: 'm-1',
      name: 'M01',
      // Billing is read for the sign-off summary but blanked without viewPayments.
      amount: null,
      billingTrigger: null,
      releasesRetention: false,
    });

    expect(context.require).toHaveBeenCalledWith('portal-1', 'viewProjects');
    const args = prisma.milestone.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'm-1', projectId: 'p-1' });
    for (const hidden of [
      'notes',
      'estimatedHours',
      'retainedAmount',
      'invoice',
    ]) {
      expect(args.select).not.toHaveProperty(hidden);
    }
    expect(args.select).toMatchObject({ deliverables: true, status: true });
  });

  it('shows the price to portals that may see payments', async () => {
    context.require.mockResolvedValue({ clientId: 'c-1', permission: { viewPayments: true } });
    prisma.milestone.findFirst.mockResolvedValue({
      id: 'm-1',
      amount: '50000',
      billingTrigger: 'on_acceptance',
      releasesRetention: true,
    });
    await expect(service.findMilestone('portal-1', 'u-1', 'p-1', 'm-1')).resolves.toMatchObject({
      amount: '50000',
      releasesRetention: true,
    });
  });

  it("404s a project outside the user's access without reading the milestone", async () => {
    context.sharedProjectIds.mockResolvedValue(['p-2']);
    await expect(
      service.findMilestone('portal-1', 'u-1', 'p-1', 'm-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.milestone.findFirst).not.toHaveBeenCalled();
  });

  it('404s a milestone that is gone or belongs to another project', async () => {
    prisma.milestone.findFirst.mockResolvedValue(null);
    await expect(
      service.findMilestone('portal-1', 'u-1', 'p-1', 'm-9'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
