import {
  generateManagementReport,
  getCurrentReportDate,
  getReportWindow,
  type ReportWindow,
} from './reporting';
import { listResearchMissionActions } from './research';
import { prisma } from './prisma';

export const MAX_DASHBOARD_LIMIT = 50;
const DEFAULT_DASHBOARD_LIMIT = 20;

export class DashboardPolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'DashboardPolicyError';
  }
}

function parseWindow(reportDate: string): ReportWindow {
  try {
    return getReportWindow(reportDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid dashboard date';
    throw new DashboardPolicyError(400, message);
  }
}

function parseLimit(limit: number | undefined) {
  const value = limit ?? DEFAULT_DASHBOARD_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_DASHBOARD_LIMIT) {
    throw new DashboardPolicyError(400, `limit must be an integer between 1 and ${MAX_DASHBOARD_LIMIT}`);
  }
  return value;
}

const rankingCompanySelect = {
  id: true,
  name: true,
  country: true,
  sector: true,
} as const;

export async function getDailyDashboard(input: { reportDate?: string; limit?: number } = {}) {
  const reportDate = input.reportDate ?? getCurrentReportDate();
  const window = parseWindow(reportDate);
  const limit = parseLimit(input.limit);

  const [{ report, reused }, rankingReceipts, missions] = await Promise.all([
    generateManagementReport(reportDate),
    prisma.companyRankingReceipt.findMany({
      where: { evaluatedAt: { gte: window.periodStart, lt: window.periodEnd } },
      select: {
        id: true,
        companyId: true,
        algorithmVersion: true,
        policyVersion: true,
        totalScore: true,
        reasonCodes: true,
        nextAction: true,
        evaluatedAt: true,
        company: { select: rankingCompanySelect },
      },
      orderBy: [{ totalScore: 'desc' }, { evaluatedAt: 'desc' }, { companyId: 'asc' }],
      take: limit,
    }),
    prisma.researchMission.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const researchActions: Array<{
    id: string;
    missionId: string;
    missionName: string;
    missionStatus: string;
    candidateId: string;
    type: string;
    priority: number;
    reasonCodes: string[];
    candidateStatus: string;
    confidence: number;
    evidenceSourceCount: number;
    independentEvidenceSourceCount: number;
    hasContactSignal: boolean;
  }> = [];

  for (const mission of missions) {
    if (researchActions.length >= limit) break;
    const projection = await listResearchMissionActions({
      missionId: mission.id,
      limit: limit - researchActions.length,
    });
    for (const action of projection.actions) {
      researchActions.push({
        id: action.id,
        missionId: action.missionId,
        missionName: projection.mission.name,
        missionStatus: projection.mission.status,
        candidateId: action.candidateId,
        type: action.type,
        priority: action.priority,
        reasonCodes: action.reasonCodes,
        candidateStatus: action.candidateStatus,
        confidence: action.confidence,
        evidenceSourceCount: action.evidenceSourceCount,
        independentEvidenceSourceCount: action.independentEvidenceSourceCount,
        hasContactSignal: action.hasContactSignal,
      });
    }
  }

  return {
    reportDate: window.reportDate,
    timezone: window.timezone,
    report: {
      id: report.id,
      reportDate: report.reportDate,
      timezone: report.timezone,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
      inputHash: report.inputHash,
      metrics: report.metrics,
    },
    reused,
    ranking: rankingReceipts.map((receipt) => ({
      id: receipt.id,
      companyId: receipt.companyId,
      company: receipt.company,
      algorithmVersion: receipt.algorithmVersion,
      policyVersion: receipt.policyVersion,
      totalScore: receipt.totalScore,
      reasons: receipt.reasonCodes,
      nextAction: receipt.nextAction,
      evaluatedAt: receipt.evaluatedAt.toISOString(),
    })),
    researchActions,
    actualLeadCreated: false,
    actualOutreachCreated: false,
    actualSendPerformed: false,
    externalCallsPerformed: false,
  };
}
